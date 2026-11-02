use anchor_lang::prelude::*;
use crate::state::{BuilderProfile, EndorsementAttestation, ReflectionRecord};
use crate::errors::ColosseumError;
use crate::events::ReflectionEndorsed;

#[derive(Accounts)]
pub struct EndorseReflection<'info> {
    #[account(
        mut,
        seeds = [b"builder_profile", builder.key().as_ref()],
        bump = builder_profile.bump
    )]
    pub builder_profile: Account<'info, BuilderProfile>,

    #[account(
        mut,
        seeds = [
            b"reflection",
            builder.key().as_ref(),
            &reflection.milestone_index.to_le_bytes()
        ],
        bump = reflection.bump,
        has_one = builder
    )]
    pub reflection: Account<'info, ReflectionRecord>,

    #[account(
        init,
        payer = mentor,
        space = EndorsementAttestation::LEN,
        seeds = [
            b"endorsement",
            reflection.key().as_ref(),
            mentor.key().as_ref()
        ],
        bump
    )]
    pub endorsement: Account<'info, EndorsementAttestation>,

    /// CHECK: Target builder account validated via PDA constraints
    pub builder: UncheckedAccount<'info>,

    #[account(mut)]
    pub mentor: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<EndorseReflection>,
    reputation_delta: u16,
    feedback: String,
) -> Result<()> {
    require!(
        ctx.accounts.mentor.key() != ctx.accounts.builder.key(),
        ColosseumError::SelfEndorsementForbidden
    );
    require!(
        reputation_delta >= 1 && reputation_delta <= 100,
        ColosseumError::InvalidReputationScore
    );
    require!(feedback.len() <= 256, ColosseumError::FeedbackTooLong);

    let reflection = &mut ctx.accounts.reflection;
    let builder_profile = &mut ctx.accounts.builder_profile;
    let endorsement = &mut ctx.accounts.endorsement;
    let clock = Clock::get()?;

    endorsement.mentor = ctx.accounts.mentor.key();
    endorsement.reflection = reflection.key();
    endorsement.score = reputation_delta;
    endorsement.feedback = feedback;
    endorsement.created_at = clock.unix_timestamp;
    endorsement.bump = ctx.bumps.endorsement;

    reflection.endorsement_count = reflection.endorsement_count.checked_add(1).unwrap();
    reflection.reputation_accrued = reflection
        .reputation_accrued
        .checked_add(reputation_delta as u64)
        .unwrap();

    builder_profile.cumulative_reputation = builder_profile
        .cumulative_reputation
        .checked_add(reputation_delta as u64)
        .unwrap();

    emit!(ReflectionEndorsed {
        mentor: ctx.accounts.mentor.key(),
        reflection_pda: reflection.key(),
        builder: ctx.accounts.builder.key(),
        reputation_score: reputation_delta,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}