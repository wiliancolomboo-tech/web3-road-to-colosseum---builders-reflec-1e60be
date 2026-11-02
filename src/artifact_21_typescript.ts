import http from "http";
import dotenv from "dotenv";
import { Connection, PublicKey } from "@solana/web3.js";
import { ChronicleTelemetryService } from "./telemetry";

dotenv.config();

const PORT = process.env.PORT || 8080;
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID || "Chr0n1c1eBui1d111111111111111111111111111111");

const telemetry = new ChronicleTelemetryService({
  resendApiKey: process.env.RESEND_API_KEY,
  scoutNotificationEmail: process.env.SCOUT_NOTIFICATION_EMAIL,
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
});

const connection = new Connection(RPC_URL, {
  commitment: "confirmed",
  wsEndpoint: process.env.SOLANA_WS_URL,
});

// Setup on-chain program log listener
console.log(`[DAEMON] Subscribing to program logs for: ${PROGRAM_ID.toBase58()}...`);

connection.onLogs(
  PROGRAM_ID,
  (logsContext) => {
    if (logsContext.err) return;
    console.log(`[SVM EVENT] Instruction executed. Signature: ${logsContext.signature}`);
    // Parse emitted MilestoneLoggedEvent logs and forward via telemetry
  },
  "confirmed"
);

// Enterprise HTTP Healthcheck server
const server = http.createServer((req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "HEALTHY",
      uptime: process.uptime(),
      timestamp: Date.now(),
      rpcConnected: connection.rpcEndpoint,
    }));
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`[DAEMON] Server running and healthy on port ${PORT}`);
});