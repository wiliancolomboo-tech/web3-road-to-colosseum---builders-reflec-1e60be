import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ColosseumReflect } from "../target/types/colosseum_reflect";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

describe("colosseum_reflect integration test suite", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ColosseumReflect as Program<ColosseumReflect>;

  const builderWallet = Keypair.generate();
  const mentorWallet = Keypair.generate();

  const handle = "turbobuilder";
  const github = "solanadev";
  const projectSlug = "zk-compression-dex";
  const projectTitle = "Zero-Knowledge DEX";
  const track = "DeFi";
  const repoUrl = "https://github.com/solanadev/zk-compression-dex";

  before(async () => {
    // Airdrop SOL to test builder and mentor wallets
    const airdropBuilder = await provider.connection.requestAirdrop(
      builderWallet.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    const airdropMentor = await provider.connection.requestAirdrop(
      mentorWallet.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );

    const latestBlockhash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      signature: airdropBuilder,
      ...latestBlockhash,
    });
    await provider.connection.confirmTransaction({
      signature: airdropMentor,
      ...latestBlockhash,
    });
  });

  it("1. Successfully initializes a builder profile", async () => {
    const [builderPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("builder"), builderWallet.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .initializeBuilder(handle, github)
      .accounts({
        builderProfile: builderPda,
        authority: builderWallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([builderWallet])
      .rpc();

    const account = await program.account.builderProfile.fetch(builderPda);
    expect(account.authority.toBase58()).to.equal(builderWallet.publicKey.toBase58());
    expect(account.handle).to.equal(handle);
    expect(account.githubUsername).to.equal(github);
    expect(account.totalProjects).to.equal(0);
    expect(account.totalReflections).to.equal(0);
  });

  it("2. Successfully registers a Colosseum project", async () => {
    const [builderPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("builder"), builderWallet.publicKey.toBuffer()],
      program.programId
    );

    const [projectPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("project"), builderWallet.publicKey.toBuffer(), Buffer.from(projectSlug)],
      program.programId
    );

    await program.methods
      .registerProject(projectSlug, projectTitle, track, repoUrl)
      .accounts({
        builderProfile: builderPda,
        projectProfile: projectPda,
        authority: builderWallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([builderWallet])
      .rpc();

    const projectAcc = await program.account.projectProfile.fetch(projectPda);
    expect(projectAcc.builder.toBase58()).to.equal(builderWallet.publicKey.toBase58());
    expect(projectAcc.projectSlug).to.equal(projectSlug);
    expect(projectAcc.title).to.equal(projectTitle);
    expect(projectAcc.colosseumTrack).to.equal(track);
    expect(projectAcc.reflectionCount).to.equal(0);

    const builderAcc = await program.account.builderProfile.fetch(builderPda);
    expect(builderAcc.totalProjects).to.equal(1);
  });

  it("3. Logs milestone reflection and asserts state transitions", async () => {
    const [builderPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("builder"), builderWallet.publicKey.toBuffer()],
      program.programId
    );

    const [projectPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("project"), builderWallet.publicKey.toBuffer(), Buffer.from(projectSlug)],
      program.programId
    );

    const indexBuffer = Buffer.alloc(4);
    indexBuffer.writeUInt32LE(0, 0);

    const [reflectionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("reflection"), projectPda.toBuffer(), indexBuffer],
      program.programId
    );

    // Dummy 20-byte SHA-1 hash
    const fakeGitCommit = new Array(20).fill(7);
    const reflectionNote = "Refactored Anchor CPI accounts to optimize compute unit budget down to 14k CU.";
    const metadataUri = "https://arweave.net/tx-chronicle-sample";

    await program.methods
      .submitReflection(
        { smartContractCore: {} },
        fakeGitCommit,
        42,
        42,
        1250,
        reflectionNote,
        metadataUri
      )
      .accounts({
        builderProfile: builderPda,
        projectProfile: projectPda,
        milestoneReflection: reflectionPda,
        authority: builderWallet.publicKey,
        builder: builderWallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([builderWallet])
      .rpc();

    const reflectionAcc = await program.account.milestoneReflection.fetch(reflectionPda);
    expect(reflectionAcc.author.toBase58()).to.equal(builderWallet.publicKey.toBase58());
    expect(reflectionAcc.testsPassed).to.equal(42);
    expect(reflectionAcc.testsTotal).to.equal(42);
    expect(reflectionAcc.linesOfCode).to.equal(1250);
    expect(reflectionAcc.keyTakeaway).to.equal(reflectionNote);
    expect(reflectionAcc.endorsementCount).to.equal(0);

    const projectAcc = await program.account.projectProfile.fetch(projectPda);
    expect(projectAcc.reflectionCount).to.equal(1);
  });

  it("4. Allows peer/mentor to endorse reflection", async () => {
    const [projectPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("project"), builderWallet.publicKey.toBuffer(), Buffer.from(projectSlug)],
      program.programId
    );

    const indexBuffer = Buffer.alloc(4);
    indexBuffer.writeUInt32LE(0, 0);

    const [reflectionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("reflection"), projectPda.toBuffer(), indexBuffer],
      program.programId
    );

    const [endorsementPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("endorsement"),
        reflectionPda.toBuffer(),
        mentorWallet.publicKey.toBuffer(),
      ],
      program.programId
    );

    await program.methods
      .endorseReflection()
      .accounts({
        milestoneReflection: reflectionPda,
        endorsementRecord: endorsementPda,
        endorser: mentorWallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([mentorWallet])
      .rpc();

    const reflectionAcc = await program.account.milestoneReflection.fetch(reflectionPda);
    expect(reflectionAcc.endorsementCount).to.equal(1);

    const endorsementAcc = await program.account.endorsementRecord.fetch(endorsementPda);
    expect(endorsementAcc.endorser.toBase58()).to.equal(mentorWallet.publicKey.toBase58());
    expect(endorsementAcc.reflection.toBase58()).to.equal(reflectionPda.toBase58());
  });

  it("5. Rejects self-endorsement with SelfEndorsementForbidden error", async () => {
    const [projectPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("project"), builderWallet.publicKey.toBuffer(), Buffer.from(projectSlug)],
      program.programId
    );

    const indexBuffer = Buffer.alloc(4);
    indexBuffer.writeUInt32LE(0, 0);

    const [reflectionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("reflection"), projectPda.toBuffer(), indexBuffer],
      program.programId
    );

    const [endorsementPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("endorsement"),
        reflectionPda.toBuffer(),
        builderWallet.publicKey.toBuffer(),
      ],
      program.programId
    );

    try {
      await program.methods
        .endorseReflection()
        .accounts({
          milestoneReflection: reflectionPda,
          endorsementRecord: endorsementPda,
          endorser: builderWallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([builderWallet])
        .rpc();
      expect.fail("Self endorsement should have thrown error");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("SelfEndorsementForbidden");
    }
  });

  it("6. Rejects reflection with tests_passed > tests_total", async () => {
    const [builderPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("builder"), builderWallet.publicKey.toBuffer()],
      program.programId
    );

    const [projectPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("project"), builderWallet.publicKey.toBuffer(), Buffer.from(projectSlug)],
      program.programId
    );

    const indexBuffer = Buffer.alloc(4);
    indexBuffer.writeUInt32LE(1, 0);

    const [reflectionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("reflection"), projectPda.toBuffer(), indexBuffer],
      program.programId
    );

    const fakeGitCommit = new Array(20).fill(1);

    try {
      await program.methods
        .submitReflection(
          { integrationTesting: {} },
          fakeGitCommit,
          100, // passed
          50,  // total (invalid)
          300,
          "Attempting invalid test count",
          "https://arweave.net/invalid"
        )
        .accounts({
          builderProfile: builderPda,
          projectProfile: projectPda,
          milestoneReflection: reflectionPda,
          authority: builderWallet.publicKey,
          builder: builderWallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([builderWallet])
        .rpc();
      expect.fail("Should have failed on tests_passed > tests_total");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("InvalidTestCounts");
    }
  });
});