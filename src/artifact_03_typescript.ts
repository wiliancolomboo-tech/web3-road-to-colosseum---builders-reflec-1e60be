import * as anchor from "@coral-xyz/anchor";
import { Program, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import axios from "axios";
import * as crypto from "crypto";
import * as fs from "fs";
import { execSync } from "child_process";

// Target program ID
const PROGRAM_ID = new PublicKey("ChrncLE7Vn1V7R1x2qUvZgP9rKq4x7y8Q1Z3A4bC5dE");

export interface ConfigOptions {
    solanaRpcUrl: string;
    discordWebhookUrl?: string;
    resendApiKey?: string;
    notificationEmail?: string;
    payerKeypairPath: string;
}

export class ColosseumChronicleClient {
    private connection: Connection;
    private wallet: Wallet;
    private provider: anchor.AnchorProvider;
    private program: Program;
    private discordWebhook?: string;
    private resendApiKey?: string;
    private notificationEmail?: string;

    constructor(config: ConfigOptions, idl: any) {
        this.connection = new Connection(config.solanaRpcUrl, "confirmed");
        const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(config.payerKeypairPath, "utf-8")));
        const keypair = Keypair.fromSecretKey(secretKey);
        this.wallet = new Wallet(keypair);

        this.provider = new anchor.AnchorProvider(this.connection, this.wallet, {
            preflightCommitment: "confirmed",
            commitment: "confirmed",
        });

        this.program = new Program(idl, this.provider);
        this.discordWebhook = config.discordWebhookUrl;
        this.resendApiKey = config.resendApiKey;
        this.notificationEmail = config.notificationEmail;
    }

    /**
     * Compute Profile PDA
     */
    public getProfilePda(authority: PublicKey): [PublicKey, number] {
        return PublicKey.findProgramAddressSync(
            [Buffer.from("profile"), authority.toBuffer()],
            PROGRAM_ID
        );
    }

    /**
     * Compute Reflection PDA
     */
    public getReflectionPda(profilePda: PublicKey, index: number): [PublicKey, number] {
        const indexBuf = Buffer.alloc(4);
        indexBuf.writeUInt32LE(index, 0);
        return PublicKey.findProgramAddressSync(
            [Buffer.from("reflection"), profilePda.toBuffer(), indexBuf],
            PROGRAM_ID
        );
    }

    /**
     * Helper to obtain local git head commit hash as a 20-byte buffer
     */
    public static getGitCommitHash(): Buffer {
        try {
            const rawHash = execSync("git rev-parse HEAD").toString().trim();
            return Buffer.from(rawHash, "hex");
        } catch {
            return Buffer.alloc(20, 0xab); // fallback deterministic mock hash
        }
    }

    /**
     * Submit an on-chain reflection
     */
    public async postReflection(params: {
        title: string;
        summary: string;
        hoursInvested: number;
        sentimentScore: number;
        detailedNotes: string;
    }): Promise<string> {
        const [profilePda] = this.getProfilePda(this.wallet.publicKey);
        const profileAccount: any = await this.program.account["builderProfile"].fetch(profilePda);
        const nextIndex = profileAccount.milestoneCount;

        const [reflectionPda] = this.getReflectionPda(profilePda, nextIndex);
        const commitHash = ColosseumChronicleClient.getGitCommitHash();
        const contentHash = crypto.createHash("sha256").update(params.detailedNotes).digest();

        const tx = await this.program.methods
            .logMilestoneReflection(
                Array.from(commitHash),
                Array.from(contentHash),
                params.title,
                params.summary,
                params.hoursInvested,
                params.sentimentScore
            )
            .accounts({
                builderProfile: profilePda,
                milestoneReflection: reflectionPda,
                authority: this.wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc();

        // Trigger enterprise alert pipelines
        await this.dispatchEnterpriseAlerts({
            project: profileAccount.projectName,
            builder: profileAccount.username,
            title: params.title,
            summary: params.summary,
            hours: params.hoursInvested,
            sentiment: params.sentimentScore,
            commit: commitHash.toString("hex"),
            txSignature: tx,
        });

        return tx;
    }

    /**
     * Real-Time Enterprise Dispatcher (Discord & Resend API)
     */
    private async dispatchEnterpriseAlerts(payload: {
        project: string;
        builder: string;
        title: string;
        summary: string;
        hours: number;
        sentiment: number;
        commit: string;
        txSignature: string;
    }): Promise<void> {
        // 1. Post to Discord Webhook
        if (this.discordWebhook) {
            try {
                await axios.post(this.discordWebhook, {
                    username: "Colosseum Chronicle Bot",
                    avatar_url: "https://arena.colosseum.org/favicon.ico",
                    embeds: [
                        {
                            title: `🚀 Milestone Logged: ${payload.project}`,
                            description: payload.summary,
                            color: payload.sentiment >= 0 ? 0x14f195 : 0xe93d82, // Solana Green vs Pivot Pink
                            fields: [
                                { name: "Milestone", value: payload.title, inline: true },
                                { name: "Author", value: payload.builder, inline: true },
                                { name: "Hours Logged", value: `${payload.hours}h`, inline: true },
                                { name: "Sentiment Index", value: `${payload.sentiment}/100`, inline: true },
                                { name: "Commit Hash", value: `\`${payload.commit.substring(0, 7)}\``, inline: true },
                                {
                                    name: "Solana Explorer",
                                    value: `[View Transaction](https://explorer.solana.com/tx/${payload.txSignature}?cluster=devnet)`,
                                    inline: false,
                                },
                            ],
                            footer: { text: "Colosseum Hackathon | Road to Colosseum Verification" },
                            timestamp: new Date().toISOString(),
                        },
                    ],
                });
            } catch (err: any) {
                console.error("[Chronicle Service] Discord alert failed:", err.message);
            }
        }

        // 2. Dispatch Email through Resend API
        if (this.resendApiKey && this.notificationEmail) {
            try {
                await axios.post(
                    "https://api.resend.com/emails",
                    {
                        from: "chronicle@colosseum-updates.dev",
                        to: [this.notificationEmail],
                        subject: `[Colosseum Radar] ${payload.builder} logged a milestone: ${payload.title}`,
                        html: `
                            <h2>New Colosseum Builder Reflection</h2>
                            <p><strong>Project:</strong> ${payload.project}</p>
                            <p><strong>Builder:</strong> ${payload.builder}</p>
                            <p><strong>Milestone:</strong> ${payload.title}</p>
                            <p><strong>Summary:</strong> ${payload.summary}</p>
                            <hr/>
                            <p><em>Commit:</em> <code>${payload.commit}</code></p>
                            <p><a href="https://explorer.solana.com/tx/${payload.txSignature}?cluster=devnet">View On Solana Explorer</a></p>
                        `,
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${this.resendApiKey}`,
                            "Content-Type": "application/json",
                        },
                    }
                );
            } catch (err: any) {
                console.error("[Chronicle Service] Resend email dispatch failed:", err.message);
            }
        }
    }
}