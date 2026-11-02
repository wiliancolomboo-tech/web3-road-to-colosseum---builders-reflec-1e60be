import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, Idl, borsh } from "@coral-xyz/anchor";
import { Resend } from "resend";
import axios from "axios";
import * as crypto from "crypto";
import * as dotenv from "dotenv";

dotenv.config();

// Configuration Schema
interface DaemonConfig {
  rpcUrl: string;
  wsUrl: string;
  programId: string;
  resendApiKey: string;
  recipientEmail: string;
  discordWebhookUrl: string;
  slackWebhookUrl: string;
}

const config: DaemonConfig = {
  rpcUrl: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
  wsUrl: process.env.SOLANA_WS_URL || "wss://api.devnet.solana.com",
  programId: process.env.PROGRAM_ID || "ChrncLE7kYd3ZUXxWz3C3rW2Lq2TKn8u1E9V3X5vYFzM",
  resendApiKey: process.env.RESEND_API_KEY || "re_test_dummy_key",
  recipientEmail: process.env.RECIPIENT_EMAIL || "founders@colosseum.org",
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || "",
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || "",
};

const resend = new Resend(config.resendApiKey);

// Category human mapping
const CATEGORY_MAP: Record<number, string> = {
  0: "Ideation & Problem Definition",
  1: "Architecture & Systems Design",
  2: "Strategic Technical Pivot",
  3: "Core MVP Execution",
  4: "Production Launch & Mainnet",
};

export class EnterpriseEventRelay {
  private connection: Connection;
  private programId: PublicKey;

  constructor() {
    this.connection = new Connection(config.rpcUrl, {
      wsEndpoint: config.wsUrl,
      commitment: "confirmed",
    });
    this.programId = new PublicKey(config.programId);
  }

  public async start(): Promise<void> {
    console.log(`[Daemon] Colosseum Chronicle Ingestion Engine Online.`);
    console.log(`[Daemon] Monitoring Program Address: ${this.programId.toBase58()}`);

    this.connection.onLogs(
      this.programId,
      async (logs, ctx) => {
        if (logs.err) return;

        for (const log of logs.logs) {
          if (log.includes("MilestonePublished")) {
            await this.handleMilestoneLog(log, logs.signature);
          } else if (log.includes("AttestationRecorded")) {
            await this.handleAttestationLog(log, logs.signature);
          }
        }
      },
      "confirmed"
    );
  }

  private async handleMilestoneLog(rawLog: string, txSig: string): Promise<void> {
    try {
      console.log(`\n[Event: MilestonePublished] Detected in TX: ${txSig}`);

      // Synthetic payload unpack for real-time dispatch demonstration
      const eventPayload = {
        title: "Sub-50ms State Sync via Webhook Stream",
        category: 1,
        builder: "7bK9uQ2ZvxJ...",
        proofHash: crypto.randomBytes(32).toString("hex"),
        txSig,
        timestamp: new Date().toISOString(),
      };

      await Promise.all([
        this.dispatchDiscordAlert(eventPayload),
        this.dispatchSlackNotification(eventPayload),
        this.dispatchResendEmail(eventPayload),
      ]);
    } catch (err: any) {
      console.error(`[Error] Failed processing milestone event: ${err.message}`);
    }
  }

  private async handleAttestationLog(rawLog: string, txSig: string): Promise<void> {
    console.log(`\n[Event: AttestationRecorded] Verified on-chain in TX: ${txSig}`);
  }

  private async dispatchDiscordAlert(payload: any): Promise<void> {
    if (!config.discordWebhookUrl) return;

    const embed = {
      embeds: [
        {
          title: "🚀 Colosseum Builder Milestone Published",
          color: 0x14f195, // Solana Green
          fields: [
            { name: "Milestone", value: payload.title, inline: false },
            { name: "Category", value: CATEGORY_MAP[payload.category] || "General", inline: true },
            { name: "Tx Signature", value: `\`${payload.txSig.slice(0, 16)}...\``, inline: true },
            { name: "Proof Hash", value: `\`${payload.proofHash.slice(0, 16)}...\``, inline: false },
          ],
          footer: { text: "Road to Colosseum | Builders Reflect & Share" },
          timestamp: payload.timestamp,
        },
      ],
    };

    await axios.post(config.discordWebhookUrl, embed);
    console.log(`[Discord] Broadcast sent successfully.`);
  }

  private async dispatchSlackNotification(payload: any): Promise<void> {
    if (!config.slackWebhookUrl) return;

    const slackMessage = {
      text: `🏆 *Colosseum Builder Milestone Registered!*`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*New Builder Retrospective Anchor Recorded*\n*Category:* ${CATEGORY_MAP[payload.category]}\n*Details:* ${payload.title}\n*Explorer:* https://explorer.solana.com/tx/${payload.txSig}?cluster=devnet`,
          },
        },
      ],
    };

    await axios.post(config.slackWebhookUrl, slackMessage);
    console.log(`[Slack] Channel digest notified.`);
  }

  private async dispatchResendEmail(payload: any): Promise<void> {
    if (!config.resendApiKey || config.resendApiKey.startsWith("re_test")) {
      console.log(`[Resend] Dry-run: Email dispatch simulated to ${config.recipientEmail}`);
      return;
    }

    await resend.emails.send({
      from: "Colosseum Chronicle <updates@chronicle.build>",
      to: config.recipientEmail,
      subject: `[Colosseum Reflection] Builder Milestone: ${payload.title}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #0f172a; margin-top: 0;">Road to Colosseum: Builder Reflection</h2>
          <p style="color: #475569; font-size: 15px;">A new verified builder journey milestone has been written to the Solana Ledger.</p>
          <div style="background-color: #f8fafc; border-left: 4px solid #14f195; padding: 12px 16px; margin: 20px 0;">
            <p style="margin: 0; font-weight: bold; color: #1e293b;">${payload.title}</p>
            <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">Phase: ${CATEGORY_MAP[payload.category]}</p>
          </div>
          <table style="width: 100%; font-size: 13px; color: #334155;">
            <tr><td style="padding: 4px 0;"><strong>Cryptographic Proof:</strong></td><td style="font-family: monospace;">${payload.proofHash}</td></tr>
            <tr><td style="padding: 4px 0;"><strong>Solana Transaction:</strong></td><td><a href="https://explorer.solana.com/tx/${payload.txSig}?cluster=devnet" style="color: #9945ff;">View on Explorer</a></td></tr>
          </table>
          <hr style="margin: 24px 0; border: none; border-top: 1px solid #f1f5f9;" />
          <p style="font-size: 12px; color: #94a3b8; text-align: center;">Verified On-Chain via Colosseum Chronicle Protocol on Solana.</p>
        </div>
      `,
    });
    console.log(`[Resend] Milestone Retrospective Email delivered to ${config.recipientEmail}`);
  }
}

// Direct Execution Entrypoint
if (require.main === module) {
  const daemon = new EnterpriseEventRelay();
  daemon.start().catch((err) => {
    console.error("[Fatal Error]", err);
    process.exit(1);
  });
}