import fetch from "node-fetch";
import { CONFIG } from "../config";

export async function sendSlackMilestoneNotification(params: {
  title: string;
  project: string;
  stage: string;
  gitCommit: string;
}): Promise<void> {
  if (!CONFIG.SLACK_WEBHOOK_URL) return;

  const payload = {
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*⚡ New Colosseum Builder Reflection Logged!*\n*Milestone:* ${params.title}\n*Stage:* ${params.stage}\n*Git Commit:* \`${params.gitCommit}\`\n*Project:* \`${params.project}\``
        }
      }
    ]
  };

  try {
    await fetch(CONFIG.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error("[SlackService] Failed to post slack update:", err);
  }
}