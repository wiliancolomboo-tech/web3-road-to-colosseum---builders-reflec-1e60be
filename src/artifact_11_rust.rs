use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;
use state::ProjectStage;

declare_id!("Ref1ect111111111111111111111111111111111111");

#[program]
pub mod colosseum_reflect_engine {
    use super::*;

    pub fn initialize_project(
        ctx: Context<InitializeProject>,
        name: String,
        description: String,
        repo_url: String,
    ) -> Result<()> {
        instructions::initialize_project::handler(ctx, name, description, repo_url)
    }

    pub fn post_reflection(
        ctx: Context<PostReflection>,
        stage: ProjectStage,
        title: String,
        content_cid: String,
        git_commit_hash: String,
    ) -> Result<()> {
        instructions::post_reflection::handler(ctx, stage, title, content_cid, git_commit_hash)
    }

    pub fn endorse_reflection(
        ctx: Context<EndorseReflection>,
        comment: String,
    ) -> Result<()> {
        instructions::endorse_reflection::handler(ctx, comment)
    }
}