import fetch from "node-fetch";
import { CONFIG } from "../config";

export async function sendDiscordMilestoneNotification(params: {
  project: string;
  stage: string;
  title: string;
  contentCid: string;
  gitCommit: string;
  txSignature: string;
}): Promise<void> {
  if (!CONFIG.DISCORD_WEBHOOK_URL) return;

  const payload = {
    username: "Colosseum Reflection Oracle",
    avatar_url: "https://solana.com/src/img/branding/solanaLogoMark.png",
    embeds: [
      {
        title: `🚀 Milestone Logged: ${params.title}`,
        color: 0x14f195,
        fields: [
          { name: "Project PDA", value: `\`${params.project}\``, inline: false },
          { name: "Stage", value: params.stage, inline: true },
          { name: "Git Commit", value: `\`${params.gitCommit}\``, inline: true },
          { name: "IPFS Log CID", value: `[${params.contentCid}](https://ipfs.io/ipfs/${params.contentCid})`, inline: false },
          { name: "Solana Explorer", value: `[View Transaction](https://explorer.solana.com/tx/${params.txSignature}?cluster=devnet)`, inline: false }
        ],
        footer: { text: "Road to Colosseum | Builder Attestations" },
        timestamp: new Date().toISOString()
      }
    ]
  };

  try {
    const res = await fetch(CONFIG.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      console.error(`[DiscordService] Webhook rejected: ${res.statusText}`);
    }
  } catch (e) {
    console.error("[DiscordService] Webhook post failed:", e);
  }
}