import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ColosseumReflect } from "../target/types/colosseum_reflect";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccountIdempotent,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";
import * as crypto from "crypto";

describe("colosseum_reflect integration tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ColosseumReflect as Program<ColosseumReflect>;

  const admin = Keypair.generate();
  const treasury = Keypair.generate();
  const builder = Keypair.generate();
  const peerValidator = Keypair.generate();

  let globalConfigPda: PublicKey;
  let projectPda: PublicKey;
  let milestone0Pda: PublicKey;
  let attestationPda: PublicKey;
  let escrowVaultPda: PublicKey;
  let badgeMint: PublicKey;
  let builderBadgeAccount: PublicKey;

  const mockRepoHash = crypto.createHash("sha256").update("https://github.com/solana-foundation/solana").digest();
  const mockCommitRoot = crypto.createHash("sha256").update("commit-abc-123456").digest();
  const mockDeliverableHash = crypto.createHash("sha256").update("build-release-v1.0.0").digest();

  before(async () => {
    // Airdrop SOL to test actors
    for (const actor of [admin, builder, peerValidator]) {
      const sig = await provider.connection.requestAirdrop(actor.publicKey, 10 * LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig, "confirmed");
    }

    [globalConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );

    [projectPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("project"), builder.publicKey.toBuffer()],
      program.programId
    );

    [milestone0Pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("milestone"), projectPda.toBuffer(), new anchor.BN(0).toArrayLike(Buffer, "le", 4)],
      program.programId
    );

    [attestationPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("attestation"), milestone0Pda.toBuffer(), peerValidator.publicKey.toBuffer()],
      program.programId
    );

    [escrowVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), projectPda.toBuffer()],
      program.programId
    );
  });

  it("1. Initializes global protocol configuration", async () => {
    const slashingBps = 1500; // 15%
    const halfLife = 86400; // 1 day

    await program.methods
      .initializeProtocol(slashingBps, new anchor.BN(halfLife))
      .accounts({
        globalConfig: globalConfigPda,
        authority: admin.publicKey,
        treasury: treasury.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    const configAccount = await program.account.globalConfig.fetch(globalConfigPda);
    expect(configAccount.authority.toBase58()).to.equal(admin.publicKey.toBase58());
    expect(configAccount.slashingPenaltyBps).to.equal(1500);
    expect(configAccount.totalProjects.toNumber()).to.equal(0);
  });

  it("2. Registers a new hackathon project profile", async () => {
    const slug = "road-to-colosseum-agent";

    await program.methods
      .initializeProject(slug, Array.from(mockRepoHash))
      .accounts({
        globalConfig: globalConfigPda,
        project: projectPda,
        authority: builder.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([builder])
      .rpc();

    const projectAccount = await program.account.project.fetch(projectPda);
    expect(projectAccount.authority.toBase58()).to.equal(builder.publicKey.toBase58());
    expect(projectAccount.projectSlug).to.equal(slug);
    expect(projectAccount.milestoneCount).to.equal(0);
  });

  it("3. Submits sequential milestone reflection", async () => {
    const reflectionUri = "ipfs://QmZtmD2qt8fJpq3CLHzJLHusSiPXZvW25pZ96bYqD4bEgZ";

    await program.methods
      .submitMilestone(
        0,
        Array.from(mockCommitRoot),
        reflectionUri,
        Array.from(mockDeliverableHash)
      )
      .accounts({
        project: projectPda,
        milestone: milestone0Pda,
        authority: builder.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([builder])
      .rpc();

    const milestoneAccount = await program.account.milestone.fetch(milestone0Pda);
    expect(milestoneAccount.milestoneIndex).to.equal(0);
    expect(milestoneAccount.reflectionUri).to.equal(reflectionUri);
    expect(milestoneAccount.convictionScore.toNumber()).to.equal(0);
  });

  it("4. Prevents self-attestation exploit", async () => {
    try {
      await program.methods
        .attestPeerMilestone(new anchor.BN(1 * LAMPORTS_PER_SOL))
        .accounts({
          globalConfig: globalConfigPda,
          project: projectPda,
          milestone: milestone0Pda,
          attestation: attestationPda,
          escrowVault: escrowVaultPda,
          peer: builder.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([builder])
        .rpc();
      expect.fail("Should have thrown SelfAttestationForbidden error");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("SelfAttestationForbidden");
    }
  });

  it("5. Allows peer builder to attest with stake & conviction scaling", async () => {
    const stakeAmount = new anchor.BN(1 * LAMPORTS_PER_SOL);

    const tx = await program.methods
      .attestPeerMilestone(stakeAmount)
      .accounts({
        globalConfig: globalConfigPda,
        project: projectPda,
        milestone: milestone0Pda,
        attestation: attestationPda,
        escrowVault: escrowVaultPda,
        peer: peerValidator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([peerValidator])
      .rpc();

    const milestoneAccount = await program.account.milestone.fetch(milestone0Pda);
    const attestationAccount = await program.account.attestation.fetch(attestationPda);

    expect(milestoneAccount.totalStakedLamports.toNumber()).to.equal(stakeAmount.toNumber());
    expect(attestationAccount.stakedLamports.toNumber()).to.equal(stakeAmount.toNumber());
    expect(milestoneAccount.convictionScore.toNumber()).to.be.greaterThanOrEqual(1_000_000_000);
  });

  it("6. Finalizes milestone and mints Token-2022 Soulbound Proof Badge", async () => {
    // Create Token-2022 mint owned by the project PDA
    badgeMint = await createMint(
      provider.connection,
      builder,
      projectPda,
      null,
      0,
      Keypair.generate(),
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    builderBadgeAccount = await createAssociatedTokenAccountIdempotent(
      provider.connection,
      builder,
      badgeMint,
      builder.publicKey,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    await program.methods
      .finalizeMilestone()
      .accounts({
        project: projectPda,
        milestone: milestone0Pda,
        badgeMint: badgeMint,
        builderTokenAccount: builderBadgeAccount,
        token2022Program: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    const tokenAcc = await getAccount(
      provider.connection,
      builderBadgeAccount,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(Number(tokenAcc.amount)).to.equal(1);

    const updatedMilestone = await program.account.milestone.fetch(milestone0Pda);
    expect(JSON.stringify(updatedMilestone.status)).to.include("verified");
  });
});