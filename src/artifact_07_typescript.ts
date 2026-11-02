import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { SyndicationEngine, MilestonePayload } from "./syndication";
import * as dotenv from "dotenv";

dotenv.config();

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || "ColoM1rr0r1111111111111111111111111111111111"
);

async function startWorker() {
  console.log("======================================================");
  console.log("  ColoMirror Reactive Syndication Worker Running     ");
  console.log(`  RPC: ${RPC_URL}`);
  console.log(`  Target Program: ${PROGRAM_ID.toBase58()}`);
  console.log("======================================================");

  const connection = new Connection(RPC_URL, {
    commitment: "confirmed",
    wsEndpoint: RPC_URL.replace("https://", "wss://").replace("http://", "ws://"),
  });

  const idl = require("./idls/colosseum_chronicles.json");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(anchor.web3.Keypair.generate()),
    { commitment: "confirmed" }
  );

  const program = new anchor.Program(idl, provider);
  const processedSignatures = new Set<string>();

  // Subscribe to Program MilestoneLogged Event
  program.addEventListener("MilestoneLogged", async (event: any, slot: number, signature: string) => {
    if (processedSignatures.has(signature)) {
      return;
    }
    processedSignatures.add(signature);

    console.log(`\n[Event Detected] Slot: ${slot} | Sig: ${signature}`);

    const commitHex = Buffer.from(event.commitHash).toString("hex");
    const payload: MilestonePayload = {
      builder: event.builder.toBase58(),
      reflectionPda: event.reflection.toBase58(),
      index: event.index,
      metadataCid: event.metadataCid,
      commitHashHex: commitHex,
      title: event.title,
      timestamp: event.timestamp.toNumber(),
    };

    console.log(`[Event Parsed] Reflection: "${payload.title}" by ${payload.builder}`);

    // Trigger enterprise syndication pipeline in parallel
    await Promise.allSettled([
      SyndicationEngine.broadcastToDiscord(payload),
      SyndicationEngine.dispatchMentorDigest(payload),
    ]);
  });

  console.log("[Worker] Subscribed to program events. Waiting for milestone reflections...");
}

if (require.main === module) {
  startWorker().catch((err) => {
    console.error("[Worker Fatal Error]:", err);
    process.exit(1);
  });
}