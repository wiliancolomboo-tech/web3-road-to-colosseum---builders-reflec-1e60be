import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ColosseumEcho } from "../target/types/colosseum_echo";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import * as crypto from "crypto";

describe("colosseum_echo protocol unit & integration tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ColosseumEcho as Program<ColosseumEcho>;

  const author = Keypair.generate();
  const peer1 = Keypair.generate();
  const peer2 = Keypair.generate();

  const track = "DePIN";
  const projectName = "Decentralized Acoustic Mesh";
  const metadataUri = "https://arweave.net/Xw3j_reflection_report_2024.md";
  const contentHash = Array.from(crypto.createHash("sha256").update("lessons_learned_radar").digest());

  let reflectionPda: PublicKey;
  let bump: number;

  before(async () => {
    // Airdrop SOL to test keypairs
    const airdropSig1 = await provider.connection.requestAirdrop(author.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    const airdropSig2 = await provider.connection.requestAirdrop(peer1.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    const airdropSig3 = await provider.connection.requestAirdrop(peer2.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);

    const latestBlockhash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      signature: airdropSig1,
      ...latestBlockhash
    });

    [reflectionPda, bump] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("colosseum_reflection"),
        author.publicKey.toBuffer(),
        Buffer.from(track)
      ],
      program.programId
    );
  });

  it("1. Successfully initializes a builder reflection account", async () => {
    await program.methods
      .initializeReflection(track, projectName, metadataUri, contentHash, 5)
      .accounts({
        reflection: reflectionPda,
        author: author.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([author])
      .rpc();

    const account = await program.account.reflectionAccount.fetch(reflectionPda);
    expect(account.author.toBase58()).to.equal(author.publicKey.toBase58());
    expect(account.track).to.equal(track);
    expect(account.projectName).to.equal(projectName);
    expect(account.metadataUri).to.equal(metadataUri);
    expect(account.attestationCount).to.equal(0);
    expect(account.lessonsCount).to.equal(5);
  });

  it("2. Fails when author attempts to self-attest", async () => {
    try {
      await program.methods
        .attestReflection()
        .accounts({
          reflection: reflectionPda,
          peer: author.publicKey,
        })
        .signers([author])
        .rpc();
      expect.fail("Expected SelfAttestationForbidden error");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("SelfAttestationForbidden");
    }
  });

  it("3. Successfully registers valid peer attestations", async () => {
    await program.methods
      .attestReflection()
      .accounts({
        reflection: reflectionPda,
        peer: peer1.publicKey,
      })
      .signers([peer1])
      .rpc();

    let account = await program.account.reflectionAccount.fetch(reflectionPda);
    expect(account.attestationCount).to.equal(1);
    expect(account.attestations[0].toBase58()).to.equal(peer1.publicKey.toBase58());

    // Peer 2 attestation
    await program.methods
      .attestReflection()
      .accounts({
        reflection: reflectionPda,
        peer: peer2.publicKey,
      })
      .signers([peer2])
      .rpc();

    account = await program.account.reflectionAccount.fetch(reflectionPda);
    expect(account.attestationCount).to.equal(2);
    expect(account.attestations[1].toBase58()).to.equal(peer2.publicKey.toBase58());
  });

  it("4. Prevents duplicate attestation from the same peer", async () => {
    try {
      await program.methods
        .attestReflection()
        .accounts({
          reflection: reflectionPda,
          peer: peer1.publicKey,
        })
        .signers([peer1])
        .rpc();
      expect.fail("Expected DuplicateAttestation error");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("DuplicateAttestation");
    }
  });

  it("5. Allows author to close account and reclaim lamports", async () => {
    const balanceBefore = await provider.connection.getBalance(author.publicKey);

    await program.methods
      .closeReflection()
      .accounts({
        reflection: reflectionPda,
        author: author.publicKey,
      })
      .signers([author])
      .rpc();

    const balanceAfter = await provider.connection.getBalance(author.publicKey);
    expect(balanceAfter).to.be.greaterThan(balanceBefore);

    const closedAccount = await provider.connection.getAccountInfo(reflectionPda);
    expect(closedAccount).to.be.null;
  });
});