use anchor_lang::prelude::*;
use crate::state::{ProjectProfile, ReflectionEntry, EndorsementRecord};
use crate::errors::ReflectError;

#[event]
pub struct EndorsementLogged {
    pub reflection: Pubkey,
    pub project: Pubkey,
    pub endorser: Pubkey,
    pub comment: String,
    pub timestamp: i64,
}

#[derive(Accounts)]
pub struct EndorseReflection<'info> {
    #[account(
        mut,
        constraint = project_profile.key() == reflection_entry.project
    )]
    pub project_profile: Account<'info, ProjectProfile>,

    #[account(mut)]
    pub reflection_entry: Account<'info, ReflectionEntry>,

    #[account(
        init,
        payer = endorser,
        space = EndorsementRecord::LEN,
        seeds = [
            b"endorsement",
            reflection_entry.key().as_ref(),
            endorser.key().as_ref()
        ],
        bump
    )]
    pub endorsement_record: Account<'info, EndorsementRecord>,

    #[account(mut)]
    pub endorser: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<EndorseReflection>,
    comment: String,
) -> Result<()> {
    require!(comment.len() <= 140, ReflectError::EndorsementCommentTooLong);
    require!(
        ctx.accounts.reflection_entry.author != ctx.accounts.endorser.key(),
        ReflectError::SelfEndorsementNotAllowed
    );

    let clock = Clock::get()?;
    let endorsement = &mut ctx.accounts.endorsement_record;
    endorsement.reflection = ctx.accounts.reflection_entry.key();
    endorsement.endorser = ctx.accounts.endorser.key();
    endorsement.comment = comment.clone();
    endorsement.timestamp = clock.unix_timestamp;
    endorsement.bump = ctx.bumps.endorsement_record;

    let reflection = &mut ctx.accounts.reflection_entry;
    reflection.endorsements_count = reflection.endorsements_count.saturating_add(1);

    let project = &mut ctx.accounts.project_profile;
    project.total_endorsements = project.total_endorsements.saturating_add(1);

    emit!(EndorsementLogged {
        reflection: reflection.key(),
        project: project.key(),
        endorser: ctx.accounts.endorser.key(),
        comment,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}