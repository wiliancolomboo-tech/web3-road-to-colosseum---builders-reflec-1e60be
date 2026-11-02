import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ColosseumChronicle } from "../target/types/colosseum_chronicle";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import * as crypto from "crypto";

describe("colosseum_chronicle protocol tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ColosseumChronicle as Program<ColosseumChronicle>;
  const builder = (provider.wallet as anchor.Wallet).payer;
  const mentor = Keypair.generate();
  const imposter = Keypair.generate();

  let profilePda: PublicKey;
  let milestonePda: PublicKey;
  let attestationPda: PublicKey;

  before(async () => {
    // Fund mentor and imposter test wallets with airdrops
    const airdropSig1 = await provider.connection.requestAirdrop(mentor.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    const airdropSig2 = await provider.connection.requestAirdrop(imposter.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    
    const latestBlockhash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      signature: airdropSig1,
      ...latestBlockhash,
    });
    await provider.connection.confirmTransaction({
      signature: airdropSig2,
      ...latestBlockhash,
    });

    [profilePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("profile"), builder.publicKey.toBuffer()],
      program.programId
    );

    const indexBytes = Buffer.alloc(4);
    indexBytes.writeUInt32LE(0, 0);

    [milestonePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("milestone"), profilePda.toBuffer(), indexBytes],
      program.programId
    );

    [attestationPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("attestation"), milestonePda.toBuffer(), mentor.publicKey.toBuffer()],
      program.programId
    );
  });

  it("1. Successfully registers a Builder Profile PDA", async () => {
    const tx = await program.methods
      .initializeBuilderProfile(
        "Satoshi Nakamoto",
        "Chronicle Engine",
        "https://arweave.net/metadata-proof-manifest.json"
      )
      .accounts({
        profile: profilePda,
        authority: builder.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    expect(tx).to.be.a("string");

    const profileAccount = await program.account.builderProfile.fetch(profilePda);
    expect(profileAccount.name).to.equal("Satoshi Nakamoto");
    expect(profileAccount.projectName).to.equal("Chronicle Engine");
    expect(profileAccount.milestoneCount).to.equal(0);
    expect(profileAccount.totalAttestations).to.equal(0);
  });

  it("2. Successfully records a retrospective milestone with SHA-256 commit root", async () => {
    const proofDigest = crypto.createHash("sha256").update("git:commit:a9f8b2d308fbc8").digest();
    const proofBytes = Array.from(proofDigest);

    const tx = await program.methods
      .recordMilestone(
        "Sprint 1: Anchor Architecture Complete",
        "Engineered zero-alloc custom serializations and deterministic PDA roots.",
        proofBytes,
        1, // Category: Architecture
        48 // Hours invested
      )
      .accounts({
        profile: profilePda,
        milestone: milestonePda,
        authority: builder.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    expect(tx).to.be.a("string");

    const milestoneAccount = await program.account.milestoneRecord.fetch(milestonePda);
    expect(milestoneAccount.title).to.equal("Sprint 1: Anchor Architecture Complete");
    expect(milestoneAccount.index).to.equal(0);
    expect(milestoneAccount.category).to.equal(1);
    expect(milestoneAccount.hoursInvested).to.equal(48);

    const profileAccount = await program.account.builderProfile.fetch(profilePda);
    expect(profileAccount.milestoneCount).to.equal(1);
  });

  it("3. Successfully records a peer/mentor attestation with score", async () => {
    const tx = await program.methods
      .attestMilestone(98, "Exceptional engineering discipline and clean Anchor structure.")
      .accounts({
        profile: profilePda,
        milestone: milestonePda,
        attestation: attestationPda,
        mentor: mentor.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([mentor])
      .rpc();

    expect(tx).to.be.a("string");

    const attestationAccount = await program.account.attestationRecord.fetch(attestationPda);
    expect(attestationAccount.score).to.equal(98);
    expect(attestationAccount.mentor.toBase58()).to.equal(mentor.publicKey.toBase58());

    const milestoneAccount = await program.account.milestoneRecord.fetch(milestonePda);
    expect(milestoneAccount.attestationCount).to.equal(1);

    const profileAccount = await program.account.builderProfile.fetch(profilePda);
    expect(profileAccount.totalAttestations).to.equal(1);
  });

  it("4. Rejects self-attestation attempt (Builder cannot evaluate own work)", async () => {
    const [selfAttestationPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("attestation"), milestonePda.toBuffer(), builder.publicKey.toBuffer()],
      program.programId
    );

    try {
      await program.methods
        .attestMilestone(100, "Self-praise validation test")
        .accounts({
          profile: profilePda,
          milestone: milestonePda,
          attestation: selfAttestationPda,
          mentor: builder.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Expected transaction to fail with CannotSelfAttest error");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("CannotSelfAttest");
    }
  });

  it("5. Rejects unauthorized milestone insertion under another builder's profile", async () => {
    const indexBytes = Buffer.alloc(4);
    indexBytes.writeUInt32LE(1, 0);

    const [unauthorizedMilestonePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("milestone"), profilePda.toBuffer(), indexBytes],
      program.programId
    );

    const proofBytes = Array.from(crypto.randomBytes(32));

    try {
      await program.methods
        .recordMilestone(
          "Malicious Takeover",
          "Attempting injection without authority.",
          proofBytes,
          0,
          10
        )
        .accounts({
          profile: profilePda,
          milestone: unauthorizedMilestonePda,
          authority: imposter.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([imposter])
        .rpc();
      expect.fail("Expected transaction to fail with UnauthorizedProfileOwner");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("UnauthorizedProfileOwner");
    }
  });

  it("6. Rejects out-of-range attestation scores", async () => {
    const invalidMentor = Keypair.generate();
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(invalidMentor.publicKey, anchor.web3.LAMPORTS_PER_SOL)
    );

    const [invalidAttestationPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("attestation"), milestonePda.toBuffer(), invalidMentor.publicKey.toBuffer()],
      program.programId
    );

    try {
      await program.methods
        .attestMilestone(105, "Score exceeds maximum limit of 100")
        .accounts({
          profile: profilePda,
          milestone: milestonePda,
          attestation: invalidAttestationPda,
          mentor: invalidMentor.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([invalidMentor])
        .rpc();
      expect.fail("Expected failure on score > 100");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("InvalidAttestationScore");
    }
  });
});