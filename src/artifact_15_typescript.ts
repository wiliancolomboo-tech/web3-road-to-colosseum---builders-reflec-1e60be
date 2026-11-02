import { Resend } from "resend";
import { CONFIG } from "../config";

const resend = new Resend(CONFIG.RESEND_API_KEY);

export async function sendMentorReflectionDigest(params: {
  projectName: string;
  author: string;
  stageName: string;
  title: string;
  contentCid: string;
  gitCommitHash: string;
  reflectionPda: string;
}): Promise<void> {
  if (!CONFIG.RESEND_API_KEY) {
    console.warn("[EmailService] RESEND_API_KEY not configured. Skipping email dispatch.");
    return;
  }

  const { projectName, author, stageName, title, contentCid, gitCommitHash, reflectionPda } = params;

  try {
    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b0e14; color: #f0f6fc; padding: 24px; }
          .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 24px; max-width: 600px; margin: 0 auto; }
          .badge { background: #9945FF; color: #fff; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; text-transform: uppercase; }
          .headline { font-size: 20px; font-weight: 700; margin-top: 12px; color: #14F195; }
          .meta { color: #8b949e; font-size: 13px; margin-bottom: 16px; }
          .field { margin: 12px 0; font-size: 14px; }
          .code { font-family: monospace; background: #0d1117; padding: 3px 6px; border-radius: 4px; color: #58a6ff; }
          .footer { margin-top: 24px; font-size: 11px; color: #484f58; text-align: center; }
        </style>
      </head>
      <body>
        <div class="card">
          <span class="badge">${stageName}</span>
          <div class="headline">${title}</div>
          <div class="meta">Project: <b>${projectName}</b> | Author: <span class="code">${author.slice(0, 6)}...${author.slice(-4)}</span></div>
          <hr style="border: 0; border-top: 1px solid #30363d;" />
          <div class="field"><b>Git Snapshot:</b> <span class="code">${gitCommitHash}</span></div>
          <div class="field"><b>Decentralized Log (IPFS/Arweave):</b> <a href="https://ipfs.io/ipfs/${contentCid}" style="color: #58a6ff;">${contentCid}</a></div>
          <div class="field"><b>Attestation PDA:</b> <span class="code">${reflectionPda}</span></div>
          <p style="margin-top: 20px;">
            <a href="https://explorer.solana.com/address/${reflectionPda}?cluster=devnet" 
               style="background: #14F195; color: #000; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-weight: 600; display: inline-block;">
               View On-Chain Proof
            </a>
          </p>
          <div class="footer">Road to Colosseum - Builder Reflection Network</div>
        </div>
      </body>
      </html>
    `;

    await resend.emails.send({
      from: CONFIG.RESEND_FROM_EMAIL,
      to: CONFIG.MENTOR_NOTIFICATION_LIST,
      subject: `[Colosseum Builder Update] ${projectName} reached: ${title}`,
      html: htmlBody,
    });
    console.log(`[EmailService] Reflection alert delivered successfully to ${CONFIG.MENTOR_NOTIFICATION_LIST.length} recipients.`);
  } catch (err) {
    console.error("[EmailService] Failed to dispatch via Resend:", err);
  }
}