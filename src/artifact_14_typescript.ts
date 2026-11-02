import dotenv from "dotenv";
dotenv.config();

export const CONFIG = {
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
  SOLANA_WS_URL: process.env.SOLANA_WS_URL || "wss://api.devnet.solana.com",
  PROGRAM_ID: process.env.PROGRAM_ID || "Ref1ect111111111111111111111111111111111111",
  RESEND_API_KEY: process.env.RESEND_API_KEY || "",
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL || "updates@colosseum-reflect.io",
  MENTOR_NOTIFICATION_LIST: (process.env.MENTOR_NOTIFICATION_LIST || "judges@colosseum.org,mentors@solana.org").split(","),
  DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL || "",
  SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL || "",
};