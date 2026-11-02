use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("Chrnc1e111111111111111111111111111111111111");

#[program]
pub mod chronicle {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>) -> Result<()> {
        instructions::initialize_config::handler(ctx)
    }

    pub fn register_builder(ctx: Context<RegisterBuilder>, github_handle: String) -> Result<()> {
        instructions::register_builder::handler(ctx, github_handle)
    }

    pub fn register_project(
        ctx: Context<RegisterProject>,
        project_slug: String,
        title: String,
        repository_url: String,
    ) -> Result<()> {
        instructions::register_project::handler(ctx, project_slug, title, repository_url)
    }

    pub fn post_reflection(
        ctx: Context<PostReflection>,
        git_commit_hash: String,
        milestone_title: String,
        ipfs_or_arweave_cid: String,
        short_summary: String,
        sprint_rating: u8,
    ) -> Result<()> {
        instructions::post_reflection::handler(
            ctx,
            git_commit_hash,
            milestone_title,
            ipfs_or_arweave_cid,
            short_summary,
            sprint_rating,
        )
    }
}