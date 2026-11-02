use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("Ref1ectColosseum111111111111111111111111111");

#[program]
pub mod colosseum_reflect {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        min_peer_stake_lamports: u64,
        protocol_fee_bps: u16,
    ) -> Result<()> {
        instructions::initialize_config::handler(ctx, min_peer_stake_lamports, protocol_fee_bps)
    }

    pub fn register_builder(
        ctx: Context<RegisterBuilder>,
        github_handle: String,
    ) -> Result<()> {
        instructions::register_builder::handler(ctx, github_handle)
    }

    pub fn initialize_reflection(
        ctx: Context<InitializeReflection>,
        project_id: u64,
        project_name: String,
        ipfs_metadata_uri: String,
        review_window_seconds: i64,
        initial_escrow_deposit: u64,
    ) -> Result<()> {
        instructions::initialize_reflection::handler(
            ctx,
            project_id,
            project_name,
            ipfs_metadata_uri,
            review_window_seconds,
            initial_escrow_deposit,
        )
    }

    pub fn log_milestone(
        ctx: Context<LogMilestone>,
        milestone_index: u16,
        compute_units_consumed: u64,
        mainnet_tx_signature: [u8; 64],
        artifact_sha256: [u8; 32],
        pivot_category: u8,
    ) -> Result<()> {
        instructions::log_milestone::handler(
            ctx,
            milestone_index,
            compute_units_consumed,
            mainnet_tx_signature,
            artifact_sha256,
            pivot_category,
        )
    }

    pub fn submit_peer_review(
        ctx: Context<SubmitPeerReview>,
        stake_lamports: u64,
        tech_score: u8,
        arch_score: u8,
        resilience_score: u8,
        is_positive: bool,
        review_cid: String,
    ) -> Result<()> {
        instructions::submit_peer_review::handler(
            ctx,
            stake_lamports,
            tech_score,
            arch_score,
            resilience_score,
            is_positive,
            review_cid,
        )
    }

    pub fn settle_reflection(ctx: Context<SettleReflection>) -> Result<()> {
        instructions::settle_reflection::handler(ctx)
    }
}