use anchor_lang::prelude::*;
use crate::state::ProjectProfile;
use crate::errors::ReflectError;

#[derive(Accounts)]
#[instruction(name: String)]
pub struct InitializeProject<'info> {
    #[account(
        init,
        payer = authority,
        space = ProjectProfile::LEN,
        seeds = [
            b"project_profile",
            authority.key().as_ref(),
            name.as_bytes()
        ],
        bump
    )]
    pub project_profile: Account<'info, ProjectProfile>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializeProject>,
    name: String,
    description: String,
    repo_url: String,
) -> Result<()> {
    require!(name.len() <= 32, ReflectError::ProjectNameTooLong);
    require!(description.len() <= 256, ReflectError::ProjectDescriptionTooLong);
    require!(repo_url.len() <= 128, ReflectError::RepoUrlTooLong);

    let clock = Clock::get()?;
    let project = &mut ctx.accounts.project_profile;

    project.authority = ctx.accounts.authority.key();
    project.project_index = 0;
    project.reflection_count = 0;
    project.total_endorsements = 0;
    project.created_at = clock.unix_timestamp;
    project.name = name;
    project.description = description;
    project.repo_url = repo_url;
    project.bump = ctx.bumps.project_profile;

    Ok(())
}