import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import * as crypto from "crypto";

describe("colosseum_chronicles integration tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Cast program to dynamic interface to satisfy anchor type resolution
  const program = anchor.workspace.ColosseumChronicles as Program<any>;

  const admin = (provider.wallet as anchor.Wallet).payer;
  const builderAlice = Keypair.generate();
  const mentorBob = Keypair.generate();

  let configPda: PublicKey;
  let configBump: number;
  let aliceProfilePda: PublicKey;
  let reflection0Pda: PublicKey;

  before(async () => {
    // Airdrop test wallets
    const airdropAlice = await provider.connection.requestAirdrop(builderAlice.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    const airdropBob = await provider.connection.requestAirdrop(mentorBob.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(airdropAlice);
    await provider.connection.confirmTransaction(airdropBob);

    [configPda, configBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("chronicle_config")],
      program.programId
    );

    [aliceProfilePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("builder"), builderAlice.publicKey.toBuffer()],
      program.programId
    );

    const idxBuffer = Buffer.alloc(4);
    idxBuffer.writeUInt32LE(0, 0);
    [reflection0Pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("reflection"), aliceProfilePda.toBuffer(), idxBuffer],
      program.programId
    );
  });

  it("1. Initializes protocol configuration successfully", async () => {
    await program.methods
      .initializeProtocol(250) // 2.5% protocol fee basis points
      .accounts({
        config: configPda,
        authority: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    const configAccount = await program.account.chronicleConfig.fetch(configPda);
    expect(configAccount.authority.toBase58()).to.equal(admin.publicKey.toBase58());
    expect(configAccount.totalBuilders.toNumber()).to.equal(0);
    expect(configAccount.totalReflections.toNumber()).to.equal(0);
    expect(configAccount.feeBasisPoints).to.equal(250);
  });

  it("2. Fails to initialize if fee exceeds maximum (1000 bps)", async () => {
    const dummyKeypair = Keypair.generate();
    const [dummyConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from("chronicle_config_invalid")],
      program.programId
    );

    try {
      await program.methods
        .initializeProtocol(1001)
        .accounts({
          config: dummyConfig,
          authority: dummyKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([dummyKeypair])
        .rpc();
      expect.fail("Expected fee check failure");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("FeeExceedsMaximum");
    }
  });

  it("3. Registers a new builder profile for Alice", async () => {
    await program.methods
      .registerBuilder("alice_sol", { deFi: {} })
      .accounts({
        config: configPda,
        builderProfile: aliceProfilePda,
        authority: builderAlice.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([builderAlice])
      .rpc();

    const profile = await program.account.builderProfile.fetch(aliceProfilePda);
    expect(profile.authority.toBase58()).to.equal(builderAlice.publicKey.toBase58());
    expect(profile.handle).to.equal("alice_sol");
    expect(profile.reflectionCount).to.equal(0);
    expect(profile.endorsementScore.toNumber()).to.equal(0);

    const config = await program.account.chronicleConfig.fetch(configPda);
    expect(config.totalBuilders.toNumber()).to.equal(1);
  });

  it("4. Publishes Milestone Reflection #0 with cryptographic commit hash", async () => {
    const rawHash = crypto.createHash("sha256").update("git_commit_init_core_engine").digest();
    const commitHashArray = Array.from(rawHash);
    const ipfsCid = "QmZtmD2qt8fJv32FNbd4LZbMD8j8pxVqcxnvjbYR4eb4n4";
    const title = "Sprint 1: AMM Math Invariant Implemented & Benchmarked";

    await program.methods
      .logReflection(ipfsCid, commitHashArray, 0, title)
      .accounts({
        config: configPda,
        builderProfile: aliceProfilePda,
        reflection: reflection0Pda,
        authority: builderAlice.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([builderAlice])
      .rpc();

    const reflection = await program.account.milestoneReflection.fetch(reflection0Pda);
    expect(reflection.builder.toBase58()).to.equal(aliceProfilePda.toBase58());
    expect(reflection.builderAuthority.toBase58()).to.equal(builderAlice.publicKey.toBase58());
    expect(reflection.index).to.equal(0);
    expect(reflection.metadataCid).to.equal(ipfsCid);
    expect(reflection.title).to.equal(title);
    expect(Buffer.from(reflection.commitHash).toString("hex")).to.equal(rawHash.toString("hex"));

    const updatedProfile = await program.account.builderProfile.fetch(aliceProfilePda);
    expect(updatedProfile.reflectionCount).to.equal(1);

    const updatedConfig = await program.account.chronicleConfig.fetch(configPda);
    expect(updatedConfig.totalReflections.toNumber()).to.equal(1);
  });

  it("5. Rejects out-of-order milestone index to preserve sequential integrity", async () => {
    const rawHash = crypto.createHash("sha256").update("invalid_sequence").digest();
    const commitHashArray = Array.from(rawHash);
    const idxBuffer = Buffer.alloc(4);
    idxBuffer.writeUInt32LE(5, 0); // Out-of-order index (expected: 1)

    const [invalidReflectionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("reflection"), aliceProfilePda.toBuffer(), idxBuffer],
      program.programId
    );

    try {
      await program.methods
        .logReflection("QmInvalidCidExample1111111111111111111111111111", commitHashArray, 5, "Skipped Sprint")
        .accounts({
          config: configPda,
          builderProfile: aliceProfilePda,
          reflection: invalidReflectionPda,
          authority: builderAlice.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([builderAlice])
        .rpc();
      expect.fail("Should have failed due to out-of-order milestone index");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("SequentialIndexMismatch");
    }
  });

  it("6. Allows peer/mentor Bob to endorse Alice's milestone", async () => {
    await program.methods
      .endorseReflection()
      .accounts({
        builderProfile: aliceProfilePda,
        reflection: reflection0Pda,
        endorser: mentorBob.publicKey,
      })
      .signers([mentorBob])
      .rpc();

    const reflection = await program.account.milestoneReflection.fetch(reflection0Pda);
    expect(reflection.endorsements.toNumber()).to.equal(1);

    const profile = await program.account.builderProfile.fetch(aliceProfilePda);
    expect(profile.endorsementScore.toNumber()).to.equal(1);
  });

  it("7. Forbids Alice from self-endorsing her own reflection", async () => {
    try {
      await program.methods
        .endorseReflection()
        .accounts({
          builderProfile: aliceProfilePda,
          reflection: reflection0Pda,
          endorser: builderAlice.publicKey,
        })
        .signers([builderAlice])
        .rpc();
      expect.fail("Alice should not be able to self-endorse");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("SelfEndorsementForbidden");
    }
  });
});