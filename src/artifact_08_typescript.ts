import { Command } from "commander";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as crypto from "crypto";

const program = new Command();
const PROGRAM_ID = new PublicKey("ColoM1rr0r1111111111111111111111111111111111");

function getProvider(keypairPath: string, rpcUrl: string): anchor.AnchorProvider {
  const secret = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));
  const connection = new Connection(rpcUrl, "confirmed");
  const wallet = new anchor.Wallet(keypair);
  return new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
}

program
  .name("colomirror-cli")
  .description("Official CLI for Colosseum Builders to publish reflections on Solana")
  .version("1.0.0");

program
  .command("init")
  .requiredOption("-k, --keypair <path>", "Path to authority keypair")
  .option("-r, --rpc <url>", "Solana RPC URL", "https://api.devnet.solana.com")
  .action(async (options) => {
    const provider = getProvider(options.keypair, options.rpc);
    const idl = require("./idls/colosseum_chronicles.json");
    const contract = new anchor.Program(idl, provider);

    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("chronicle_config")],
      PROGRAM_ID
    );

    console.log(`Initializing ColoMirror Protocol at Config PDA: ${configPda.toBase58()}...`);
    const tx = await contract.methods
      .initializeProtocol(500)
      .accounts({
        config: configPda,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log(`Protocol initialized successfully! Tx Signature: ${tx}`);
  });

program
  .command("register")
  .requiredOption("-k, --keypair <path>", "Path to builder keypair")
  .requiredOption("-u, --handle <handle>", "Builder GitHub / Discord handle")
  .requiredOption("-t, --track <track>", "Hackathon Track (DeFi, DePIN, AI, Infrastructure, Gaming, Consumer, Payments)")
  .option("-r, --rpc <url>", "Solana RPC URL", "https://api.devnet.solana.com")
  .action(async (options) => {
    const provider = getProvider(options.keypair, options.rpc);
    const idl = require("./idls/colosseum_chronicles.json");
    const contract = new anchor.Program(idl, provider);

    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("chronicle_config")], PROGRAM_ID);
    const [builderPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("builder"), provider.wallet.publicKey.toBuffer()],
      PROGRAM_ID
    );

    console.log(`Registering builder ${options.handle} on track ${options.track}...`);
    const trackPayload = { [options.track]: {} };

    const tx = await contract.methods
      .registerBuilder(options.handle, trackPayload)
      .accounts({
        config: configPda,
        builderProfile: builderPda,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log(`Builder registered! PDA: ${builderPda.toBase58()}`);
    console.log(`Tx: ${tx}`);
  });

program
  .command("reflect")
  .requiredOption("-k, --keypair <path>", "Path to builder keypair")
  .requiredOption("-t, --title <title>", "Milestone Title")
  .requiredOption("-c, --cid <cid>", "IPFS / Arweave CID containing retrospective markdown")
  .requiredOption("-g, --git-commit <sha>", "Git commit SHA-1 or SHA-256 for proof of iteration")
  .option("-r, --rpc <url>", "Solana RPC URL", "https://api.devnet.solana.com")
  .action(async (options) => {
    const provider = getProvider(options.keypair, options.rpc);
    const idl = require("./idls/colosseum_chronicles.json");
    const contract = new anchor.Program(idl, provider);

    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("chronicle_config")], PROGRAM_ID);
    const [builderPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("builder"), provider.wallet.publicKey.toBuffer()],
      PROGRAM_ID
    );

    const builderAccount: any = await (contract.account as any).builderProfile.fetch(builderPda);
    const nextIndex: number = builderAccount.reflectionCount;

    const indexBuffer = Buffer.alloc(4);
    indexBuffer.writeUInt32LE(nextIndex, 0);

    const [reflectionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("reflection"), builderPda.toBuffer(), indexBuffer],
      PROGRAM_ID
    );

    // Format commit hash to 32 bytes
    const hash = crypto.createHash("sha256").update(options.gitCommit).digest();
    const commitHashArray = Array.from(hash);

    console.log(`Publishing Reflection #${nextIndex}: "${options.title}"...`);
    const tx = await contract.methods
      .logReflection(options.cid, commitHashArray, nextIndex, options.title)
      .accounts({
        config: configPda,
        builderProfile: builderPda,
        reflection: reflectionPda,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("Milestone successfully confirmed on Solana!");
    console.log(`Reflection PDA: ${reflectionPda.toBase58()}`);
    console.log(`Transaction Signature: ${tx}`);
  });

program.parse(process.argv);