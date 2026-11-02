import axios from "axios";
import { Resend } from "resend";
import { MilestoneReflectedPayload, STAGE_LABELS } from "./types";

export class EnterpriseNotifier {
  private resendClient: Resend | null = null;
  private discordWebhookUrl: string | null = null;
  private slackWebhookUrl: string | null = null;
  private mentorNotificationEmail: string | null = null;

  constructor() {
    if (process.env.RESEND_API_KEY) {
      this.resendClient = new Resend(process.env.RESEND_API_KEY);
    }
    this.discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL || null;
    this.slackWebhookUrl = process.env.SLACK_WEBHOOK_URL || null;
    this.mentorNotificationEmail = process.env.MENTOR_NOTIFICATION_EMAIL || null;
  }

  public async broadcastMilestone(payload: MilestoneReflectedPayload): Promise<void> {
    const stageName = STAGE_LABELS[payload.stage] || "Unknown Stage";
    const passPercentage =
      payload.testsTotal > 0
        ? Math.round((payload.testsPassed / payload.testsTotal) * 100)
        : 100;

    await Promise.allSettled([
      this.sendDiscordWebhook(payload, stageName, passPercentage),
      this.sendSlackWebhook(payload, stageName, passPercentage),
      this.sendMentorEmail(payload, stageName, passPercentage),
    ]);
  }

  private async sendDiscordWebhook(
    payload: MilestoneReflectedPayload,
    stageName: string,
    passPercentage: number
  ): Promise<void> {
    if (!this.discordWebhookUrl) return;

    const embed = {
      title: `Colosseum Chronicle | New Milestone Logged #${payload.index}`,
      color: 0x14f195, // Solana Emerald Green
      fields: [
        { name: "Stage", value: stageName, inline: true },
        { name: "Test Coverage", value: `${payload.testsPassed}/${payload.testsTotal} passed (${passPercentage}%)`, inline: true },
        { name: "Git Commit SHA", value: `\`${payload.commitHash}\``, inline: false },
        { name: "Reflection & Learnings", value: payload.keyTakeaway, inline: false },
        { name: "Author Pubkey", value: `\`${payload.author.toBase58()}\``, inline: false },
      ],
      footer: { text: "Verified on Solana Devnet | Colosseum Radar" },
      timestamp: new Date(payload.timestamp * 1000).toISOString(),
    };

    try {
      await axios.post(this.discordWebhookUrl, { embeds: [embed] });
      console.log(`[DISCORD] Dispatched reflection #${payload.index}`);
    } catch (err: any) {
      console.error("[DISCORD] Delivery failed:", err.message);
    }
  }

  private async sendSlackWebhook(
    payload: MilestoneReflectedPayload,
    stageName: string,
    passPercentage: number
  ): Promise<void> {
    if (!this.slackWebhookUrl) return;

    const blockKitBody = {
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `Colosseum Build Milestone Logged: #${payload.index}`,
            emoji: true,
          },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Stage:*\n${stageName}` },
            { type: "mrkdwn", text: `*Test Status:*\n${payload.testsPassed}/${payload.testsTotal} passed (${passPercentage}%)` },
            { type: "mrkdwn", text: `*Commit SHA:*\n\`${payload.commitHash}\`` },
            { type: "mrkdwn", text: `*Author:*\n\`${payload.author.toBase58().substring(0, 8)}...\`` },
          ],
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Reflection & Architectural Learning:*\n>${payload.keyTakeaway}`,
          },
        },
      ],
    };

    try {
      await axios.post(this.slackWebhookUrl, blockKitBody);
      console.log(`[SLACK] Dispatched reflection #${payload.index}`);
    } catch (err: any) {
      console.error("[SLACK] Delivery failed:", err.message);
    }
  }

  private async sendMentorEmail(
    payload: MilestoneReflectedPayload,
    stageName: string,
    passPercentage: number
  ): Promise<void> {
    if (!this.resendClient || !this.mentorNotificationEmail) return;

    try {
      await this.resendClient.emails.send({
        from: "Colosseum Chronicle <onboarding@resend.dev>",
        to: this.mentorNotificationEmail,
        subject: `[Colosseum Milestone] ${stageName} - Project Progress Attestation`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
            <h2 style="color: #111; margin-bottom: 8px;">Colosseum Builder Reflection Attestation</h2>
            <p style="color: #666; font-size: 14px;">An on-chain verifiable milestone was recorded by team <code>${payload.author.toBase58()}</code>.</p>
            
            <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold;">Milestone Stage:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${stageName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold;">Test Passing Rate:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${payload.testsPassed}/${payload.testsTotal} (${passPercentage}%)</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold;">Verified Git SHA:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;"><code>${payload.commitHash}</code></td>
              </tr>
            </table>

            <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-left: 4px solid #14f195; border-radius: 4px;">
              <p style="margin: 0; font-style: italic; color: #333;">"${payload.keyTakeaway}"</p>
            </div>

            <p style="font-size: 12px; color: #999; margin-top: 24px;">Automated attestation dispatched by Colosseum Chronicle Protocol on Solana Devnet.</p>
          </div>
        `,
      });
      console.log(`[RESEND] Sent email update to ${this.mentorNotificationEmail}`);
    } catch (err: any) {
      console.error("[RESEND] Email delivery failed:", err.message);
    }
  }
}