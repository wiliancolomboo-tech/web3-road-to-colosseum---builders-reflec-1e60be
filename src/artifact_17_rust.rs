use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("Chrnc1e111111111111111111111111111111111111");

#[program]
pub mod colosseum_chronicle {
    use super::*;

    pub fn initialize_builder(
        ctx: Context<InitializeBuilder>,
        username: String,
        github_handle: String,
    ) -> Result<()> {
        instructions::initialize_builder::handler(ctx, username, github_handle)
    }

    pub fn register_project(
        ctx: Context<RegisterProject>,
        project_slug: String,
        track: String,
        repo_url: String,
    ) -> Result<()> {
        instructions::register_project::handler(ctx, project_slug, track, repo_url)
    }

    pub fn commit_reflection(
        ctx: Context<CommitReflection>,
        sprint_number: u32,
        milestone_hash: [u8; 32],
        metrics_hash: [u8; 32],
        retrospective_uri: String,
        confidence_score: u8,
    ) -> Result<()> {
        instructions::commit_reflection::handler(
            ctx,
            sprint_number,
            milestone_hash,
            metrics_hash,
            retrospective_uri,
            confidence_score,
        )
    }

    pub fn endorse_reflection(
        ctx: Context<EndorseReflection>,
        feedback_hash: [u8; 32],
        rating: u8,
    ) -> Result<()> {
        instructions::endorse_reflection::handler(ctx, feedback_hash, rating)
    }
}