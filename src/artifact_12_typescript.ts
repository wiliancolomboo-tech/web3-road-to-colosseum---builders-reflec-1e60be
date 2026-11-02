import { Command } from "commander";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const program = new Command();

function loadKeypair(keypairPath: string): Keypair {
  const resolved = path.resolve(keypairPath);
  const raw = JSON.parse(fs.readFileSync(resolved, "utf-8"));
  return Keypair.fromSecretKey(new Uint8Array(raw));
}

program
  .name("colosseum-reflect")
  .description("CLI to initialize, log, and reflect on Colosseum hackathon builds")
  .version("1.0.0");

program
  .command("init-builder")
  .requiredOption("-k, --keypair <path>", "Path to authority keypair")
  .requiredOption("-h, --handle <handle>", "Builder handle / name")
  .requiredOption("-g, --github <username>", "GitHub username")
  .option("-r, --rpc <url>", "Solana RPC URL", "https://api.devnet.solana.com")
  .action(async (opts) => {
    const keypair = loadKeypair(opts.keypair);
    const connection = new Connection(opts.rpc, "confirmed");
    const wallet = new Wallet(keypair);
    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

    const programId = new PublicKey("RefLecT111111111111111111111111111111111111");
    const idl = await Program.fetchIdl(programId, provider);
    if (!idl) throw new Error("IDL not found on-chain");

    const chronicleProgram = new Program(idl, programId, provider);
    const [builderPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("builder"), keypair.publicKey.toBuffer()],
      programId
    );

    console.log(`Registering builder on-chain: ${opts.handle} (@${opts.github})...`);
    const tx = await chronicleProgram.methods
      .initializeBuilder(opts.handle, opts.github)
      .accounts({
        builderProfile: builderPda,
        authority: keypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log(`Builder initialized successfully! Tx Signature: ${tx}`);
    console.log(`Builder Profile PDA: ${builderPda.toBase58()}`);
  });

program
  .command("register-project")
  .requiredOption("-k, --keypair <path>", "Path to authority keypair")
  .requiredOption("-s, --slug <slug>", "Unique project slug")
  .requiredOption("-t, --title <title>", "Project title")
  .requiredOption("--track <track>", "Colosseum Track (e.g., DePIN, DeFi, Infra)")
  .requiredOption("--repo <url>", "Repository URL")
  .option("-r, --rpc <url>", "Solana RPC URL", "https://api.devnet.solana.com")
  .action(async (opts) => {
    const keypair = loadKeypair(opts.keypair);
    const connection = new Connection(opts.rpc, "confirmed");
    const wallet = new Wallet(keypair);
    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

    const programId = new PublicKey("RefLecT111111111111111111111111111111111111");
    const idl = await Program.fetchIdl(programId, provider);
    if (!idl) throw new Error("IDL not found on-chain");

    const chronicleProgram = new Program(idl, programId, provider);
    const [builderPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("builder"), keypair.publicKey.toBuffer()],
      programId
    );
    const [projectPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("project"), keypair.publicKey.toBuffer(), Buffer.from(opts.slug)],
      programId
    );

    console.log(`Registering project: ${opts.title} (${opts.slug})...`);
    const tx = await chronicleProgram.methods
      .registerProject(opts.slug, opts.title, opts.track, opts.repo)
      .accounts({
        builderProfile: builderPda,
        projectProfile: projectPda,
        authority: keypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log(`Project registered successfully! Tx Signature: ${tx}`);
    console.log(`Project PDA: ${projectPda.toBase58()}`);
  });

program
  .command("submit-reflection")
  .requiredOption("-k, --keypair <path>", "Path to authority keypair")
  .requiredOption("-s, --slug <slug>", "Project slug")
  .requiredOption("--stage <stageNumber>", "Stage enum (0=Ideation, 2=Core, 4=Devnet, 6=Mainnet)", "2")
  .requiredOption("--git-commit <sha1>", "20-byte git SHA1 hash (40 hex chars)")
  .requiredOption("--tests-passed <passed>", "Passing unit tests", "10")
  .requiredOption("--tests-total <total>", "Total unit tests", "10")
  .requiredOption("--loc <loc>", "Lines of code written", "850")
  .requiredOption("--reflection <text>", "Architectural reflection / learning")
  .option("--uri <uri>", "Metadata URI (Arweave/IPFS)", "https://arweave.net/reflection-sample")
  .option("-r, --rpc <url>", "Solana RPC URL", "https://api.devnet.solana.com")
  .action(async (opts) => {
    const keypair = loadKeypair(opts.keypair);
    const connection = new Connection(opts.rpc, "confirmed");
    const wallet = new Wallet(keypair);
    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

    const programId = new PublicKey("RefLecT111111111111111111111111111111111111");
    const idl = await Program.fetchIdl(programId, provider);
    if (!idl) throw new Error("IDL not found on-chain");

    const chronicleProgram = new Program(idl, programId, provider);
    const [builderPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("builder"), keypair.publicKey.toBuffer()],
      programId
    );
    const [projectPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("project"), keypair.publicKey.toBuffer(), Buffer.from(opts.slug)],
      programId
    );

    const projectAccount: any = await chronicleProgram.account["projectProfile"].fetch(projectPda);
    const nextIndex = projectAccount.reflectionCount;

    const indexBuffer = Buffer.alloc(4);
    indexBuffer.writeUInt32LE(nextIndex, 0);

    const [reflectionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("reflection"), projectPda.toBuffer(), indexBuffer],
      programId
    );

    const commitBuffer = Buffer.from(opts.gitCommit.replace(/^0x/, ""), "hex");
    if (commitBuffer.length !== 20) {
      throw new Error("Git commit hash must be exactly 20 bytes (40 hex characters)");
    }

    const stageNum = parseInt(opts.stage, 10);
    const stageObj = [
      { ideation: {} },
      { architectureDesign: {} },
      { smartContractCore: {} },
      { integrationTesting: {} },
      { devnetDeployment: {} },
      { securityAuditPrep: {} },
      { mainnetLaunchReady: {} },
    ][stageNum] || { smartContractCore: {} };

    console.log(`Submitting milestone reflection #${nextIndex} for project ${opts.slug}...`);

    const tx = await chronicleProgram.methods
      .submitReflection(
        stageObj,
        Array.from(commitBuffer),
        parseInt(opts.testsPassed, 10),
        parseInt(opts.testsTotal, 10),
        parseInt(opts.loc, 10),
        opts.reflection,
        opts.uri
      )
      .accounts({
        builderProfile: builderPda,
        projectProfile: projectPda,
        milestoneReflection: reflectionPda,
        authority: keypair.publicKey,
        builder: keypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log(`Milestone reflection attested! Tx: ${tx}`);
    console.log(`Reflection PDA: ${reflectionPda.toBase58()}`);
  });

program.parse(process.argv);