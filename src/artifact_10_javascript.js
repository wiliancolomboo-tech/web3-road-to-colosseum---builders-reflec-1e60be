const { Connection, PublicKey } = require("@solana/web3.js");
const { Program, AnchorProvider } = require("@coral-xyz/anchor");
const fs = require("fs");
const dotenv = require("dotenv");
const { EnterpriseNotificationRelay } = require("./notifier");

dotenv.config();

const RPC_WSS = process.env.SOLANA_RPC_WSS || "wss://api.devnet.solana.com";
const RPC_HTTP = process.env.SOLANA_RPC_HTTP || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("7xKXtg2CW87d97TXJSDpbD5jBkheT32a6nC6JqJ7e6hS");
const idl = JSON.parse(fs.readFileSync("./src/idls/colosseum_reflex.json", "utf8"));

async function startOracleDaemon() {
  console.log("⚡ [CRP Service] Initializing Colosseum Reflex Ingestion Daemon...");
  const connection = new Connection(RPC_HTTP, {
    commitment: "confirmed",
    wsEndpoint: RPC_WSS
  });

  // Read-only dummy wallet for AnchorProvider
  const dummyWallet = {
    publicKey: PublicKey.default,
    signTransaction: async (tx) => tx,
    signAllTransactions: async (txs) => txs,
  };

  const provider = new AnchorProvider(connection, dummyWallet, { commitment: "confirmed" });
  const program = new Program(idl, provider);
  const relay = new EnterpriseNotificationRelay();

  console.log(`🎯 Subscribing to Reflection Events for Program: ${PROGRAM_ID.toBase58()}...`);

  program.addEventListener("ReflectionCommittedEvent", async (event, slot) => {
    console.log(`\n🔔 [New Event on Slot ${slot}] Milestone Committed by: ${event.builder.toBase58()}`);

    const gitHashHex = Buffer.from(event.gitCommitRoot).toString("hex");

    const alert = {
      builder: event.builder.toBase58(),
      projectName: event.projectName,
      title: event.title,
      milestoneIndex: event.milestoneIndex.toNumber(),
      uri: event.technicalNarrativeUri,
      gitCommitHash: gitHashHex,
      difficulty: event.difficulty,
      timestamp: event.timestamp.toNumber(),
    };

    console.log("Dispatching real-time notifications to enterprise integrations...");
    await relay.dispatchAll(alert);
    console.log("✅ Dispatch completed.");
  });

  // Healthcheck heartbeat
  setInterval(() => {
    console.log(`💓 [Heartbeat] Daemon healthy. Listening at slot: ${connection.getSlot()}`);
  }, 30000);
}

startOracleDaemon().catch((err) => {
  console.error("Fatal Daemon Error:", err);
  process.exit(1);
});