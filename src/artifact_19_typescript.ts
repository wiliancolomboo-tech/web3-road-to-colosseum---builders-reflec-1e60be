import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ColosseumReflectEngine } from "../target/types/colosseum_reflect_engine";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { assert, expect } from "chai";

describe("colosseum_reflect_engine test matrix", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ColosseumReflectEngine as Program<ColosseumReflectEngine>;

  const builder = Keypair.generate();
  const peerMentor = Keypair.generate();

  const projectName = "zk-colosseum-aggregator";
  const projectDesc = "Zero knowledge verifiable state proofs on Solana.";
  const repoUrl = "https://github.com/solana-builders/zk-colosseum";

  let projectPda: PublicKey;
  let projectBump: number;

  before(async () => {
    // Airdrop SOL to builder and peer mentor
    const sig1 = await provider.connection.requestAirdrop(builder.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    const sig2 = await provider.connection.requestAirdrop(peerMentor.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig1);
    await provider.connection.confirmTransaction(sig2);

    [projectPda, projectBump] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("project_profile"),
        builder.publicKey.toBuffer(),
        Buffer.from(projectName),
      ],
      program.programId
    );
  });

  it("1. Successfully initializes a builder project profile PDA", async () => {
    await program.methods
      .initializeProject(projectName, projectDesc, repoUrl)
      .accounts({
        projectProfile: projectPda,
        authority: builder.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([builder])
      .rpc();

    const account = await program.account.projectProfile.fetch(projectPda);
    assert.equal(account.authority.toBase58(), builder.publicKey.toBase58());
    assert.equal(account.name, projectName);
    assert.equal(account.description, projectDesc);
    assert.equal(account.repoUrl, repoUrl);
    assert.equal(account.reflectionCount.toNumber(), 0);
    assert.equal(account.totalEndorsements.toNumber(), 0);
  });

  it("2. Rejects project creation if name exceeds 32 bytes limit", async () => {
    const invalidName = "ThisProjectNameIsWayTooLongAndExceedsThirtyTwoBytesLimit";
    const [invalidPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("project_profile"), builder.publicKey.toBuffer(), Buffer.from(invalidName)],
      program.programId
    );

    try {
      await program.methods
        .initializeProject(invalidName, projectDesc, repoUrl)
        .accounts({
          projectProfile: invalidPda,
          authority: builder.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([builder])
        .rpc();
      assert.fail("Should have failed with ProjectNameTooLong error");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("ProjectNameTooLong");
    }
  });

  it("3. Successfully logs a sequential reflection entry", async () => {
    const reflectionIndex = new anchor.BN(1);
    const [reflectionPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("reflection"),
        projectPda.toBuffer(),
        reflectionIndex.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const title = "Implemented Poseidon Hash Compression";
    const cid = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
    const commitHash = "e2c8a16f9f302b11e2f7b881335b2e9a7e6b0142"; // 40 chars

    await program.methods
      .postReflection(
        { corePrototype: {} },
        title,
        cid,
        commitHash
      )
      .accounts({
        projectProfile: projectPda,
        reflectionEntry: reflectionPda,
        authority: builder.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([builder])
      .rpc();

    const reflectionAccount = await program.account.reflectionEntry.fetch(reflectionPda);
    assert.equal(reflectionAccount.project.toBase58(), projectPda.toBase58());
    assert.equal(reflectionAccount.author.toBase58(), builder.publicKey.toBase58());
    assert.equal(reflectionAccount.index.toNumber(), 1);
    assert.equal(reflectionAccount.title, title);
    assert.equal(reflectionAccount.contentCid, cid);
    assert.equal(reflectionAccount.endorsementsCount, 0);

    const projectAccount = await program.account.projectProfile.fetch(projectPda);
    assert.equal(projectAccount.reflectionCount.toNumber(), 1);
  });

  it("4. Rejects reflection if git commit hash is not 40 bytes", async () => {
    const reflectionIndex = new anchor.BN(2);
    const [reflectionPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("reflection"),
        projectPda.toBuffer(),
        reflectionIndex.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    try {
      await program.methods
        .postReflection(
          { devnetLive: {} },
          "Deployed to Devnet",
          "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
          "short-hash" // Invalid: length < 40
        )
        .accounts({
          projectProfile: projectPda,
          reflectionEntry: reflectionPda,
          authority: builder.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([builder])
        .rpc();
      assert.fail("Should have failed with InvalidCommitHashLength");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("InvalidCommitHashLength");
    }
  });

  it("5. Allows peer mentor to endorse a builder's reflection", async () => {
    const reflectionIndex = new anchor.BN(1);
    const [reflectionPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("reflection"),
        projectPda.toBuffer(),
        reflectionIndex.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const [endorsementPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("endorsement"),
        reflectionPda.toBuffer(),
        peerMentor.publicKey.toBuffer(),
      ],
      program.programId
    );

    const feedback = "Excellent cryptographic proof architecture. Verified locally on testbench.";

    await program.methods
      .endorseReflection(feedback)
      .accounts({
        projectProfile: projectPda,
        reflectionEntry: reflectionPda,
        endorsementRecord: endorsementPda,
        endorser: peerMentor.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([peerMentor])
      .rpc();

    const endorsementAccount = await program.account.endorsementRecord.fetch(endorsementPda);
    assert.equal(endorsementAccount.endorser.toBase58(), peerMentor.publicKey.toBase58());
    assert.equal(endorsementAccount.comment, feedback);

    const reflectionAccount = await program.account.reflectionEntry.fetch(reflectionPda);
    assert.equal(reflectionAccount.endorsementsCount, 1);

    const projectAccount = await program.account.projectProfile.fetch(projectPda);
    assert.equal(projectAccount.totalEndorsements.toNumber(), 1);
  });

  it("6. Prevents self-endorsement by the author", async () => {
    const reflectionIndex = new anchor.BN(1);
    const [reflectionPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("reflection"),
        projectPda.toBuffer(),
        reflectionIndex.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const [selfEndorsementPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("endorsement"),
        reflectionPda.toBuffer(),
        builder.publicKey.toBuffer(),
      ],
      program.programId
    );

    try {
      await program.methods
        .endorseReflection("Self endorsing my own work!")
        .accounts({
          projectProfile: projectPda,
          reflectionEntry: reflectionPda,
          endorsementRecord: selfEndorsementPda,
          endorser: builder.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([builder])
        .rpc();
      assert.fail("Self endorsement must fail");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("SelfEndorsementNotAllowed");
    }
  });
});