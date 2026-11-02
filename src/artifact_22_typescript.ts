import http from "http";
import { ChronicleOrchestrator } from "./orchestrator";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

const PORT = process.env.PORT || 8080;
let lastHeartbeat = Date.now();

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    const isHealthy = Date.now() - lastHeartbeat < 60000;
    res.writeHead(isHealthy ? 200 : 503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: isHealthy ? "UP" : "DEGRADED", lastHeartbeat }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, async () => {
  console.log(`🚀 C3 Engine listening on port ${PORT}`);
  
  const orchestrator = new ChronicleOrchestrator();
  const dummyWallet = new Wallet(Keypair.generate());
  const connection = new Connection(process.env.RPC_HTTP_URL || "https://api.devnet.solana.com");
  const provider = new AnchorProvider(connection, dummyWallet, {});
  
  const idl: any = {
    version: "0.1.0",
    name: "colosseum_chronicle",
    events: [
      {
        name: "ReflectionLoggedEvent",
        fields: [
          { name: "builder", type: "publicKey", index: false },
          { name: "milestoneIndex", type: "u32", index: false },
          { name: "stage", type: "u8", index: false },
          { name: "track", type: "u8", index: false },
          { name: "contentHash", type: { array: ["u8", 32] }, index: false },
          { name: "keyLearningSummary", type: "string", index: false },
          { name: "metricsVelocity", type: "u32", index: false },
          { name: "isPivot", type: "bool", index: false },
          { name: "timestamp", type: "i64", index: false }
        ]
      }
    ]
  };

  const program = new Program(idl, provider);
  await orchestrator.startEventListener(program);

  setInterval(() => {
    lastHeartbeat = Date.now();
  }, 15000);
});