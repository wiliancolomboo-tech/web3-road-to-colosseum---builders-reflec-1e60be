use anchor_lang::prelude::*;
use crate::state::{ProjectProfile, ReflectionEntry, ProjectStage};
use crate::errors::ReflectError;

#[event]
pub struct ReflectionPublished {
    pub project: Pubkey,
    pub reflection: Pubkey,
    pub author: Pubkey,
    pub index: u64,
    pub stage: u8,
    pub title: String,
    pub content_cid: String,
    pub git_commit_hash: [u8; 40],
    pub timestamp: i64,
}

#[derive(Accounts)]
pub struct PostReflection<'info> {
    #[account(
        mut,
        has_one = authority,
    )]
    pub project_profile: Account<'info, ProjectProfile>,

    #[account(
        init,
        payer = authority,
        space = ReflectionEntry::LEN,
        seeds = [
            b"reflection",
            project_profile.key().as_ref(),
            &(project_profile.reflection_count + 1).to_le_bytes()
        ],
        bump
    )]
    pub reflection_entry: Account<'info, ReflectionEntry>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<PostReflection>,
    stage: ProjectStage,
    title: String,
    content_cid: String,
    git_commit_hash_str: String,
) -> Result<()> {
    require!(title.len() <= 64, ReflectError::TitleTooLong);
    require!(content_cid.len() <= 64, ReflectError::CidTooLong);
    require!(git_commit_hash_str.len() == 40, ReflectError::InvalidCommitHashLength);

    let mut git_bytes = [0u8; 40];
    git_bytes.copy_from_slice(git_commit_hash_str.as_bytes());

    let clock = Clock::get()?;
    let project = &mut ctx.accounts.project_profile;
    let next_index = project.reflection_count.checked_add(1).ok_or(ReflectError::InvalidSequence)?;

    let reflection = &mut ctx.accounts.reflection_entry;
    reflection.project = project.key();
    reflection.index = next_index;
    reflection.author = ctx.accounts.authority.key();
    reflection.stage = stage;
    reflection.title = title.clone();
    reflection.content_cid = content_cid.clone();
    reflection.git_commit_hash = git_bytes;
    reflection.timestamp = clock.unix_timestamp;
    reflection.endorsements_count = 0;
    reflection.bump = ctx.bumps.reflection_entry;

    project.reflection_count = next_index;

    emit!(ReflectionPublished {
        project: project.key(),
        reflection: reflection.key(),
        author: ctx.accounts.authority.key(),
        index: next_index,
        stage: stage as u8,
        title,
        content_cid,
        git_commit_hash: git_bytes,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}