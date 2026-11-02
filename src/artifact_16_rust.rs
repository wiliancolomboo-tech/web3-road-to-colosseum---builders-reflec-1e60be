use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::ChronicleError;
use crate::events::ReflectionEndorsed;

#[derive(Accounts)]
pub struct EndorseReflection<'info> {
    #[account(
        mut,
        seeds = [b"builder", target_builder.authority.as_ref()],
        bump = target_builder.bump
    )]
    pub target_builder: Account<'info, BuilderProfile>,

    #[account(
        mut,
        seeds = [
            b"reflection",
            reflection_record.project.as_ref(),
            &reflection_record.sprint_number.to_le_bytes()
        ],
        bump = reflection_record.bump
    )]
    pub reflection_record: Account<'info, ReflectionRecord>,

    #[account(
        init,
        payer = mentor,
        space = EndorsementAttestation::LEN,
        seeds = [
            b"endorsement",
            reflection_record.key().as_ref(),
            mentor.key().as_ref()
        ],
        bump
    )]
    pub endorsement: Account<'info, EndorsementAttestation>,

    #[account(mut)]
    pub mentor: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<EndorseReflection>,
    feedback_hash: [u8; 32],
    rating: u8,
) -> Result<()> {
    require!(rating >= 1 && rating <= 5, ChronicleError::InvalidRating);

    let reflection = &mut ctx.accounts.reflection_record;
    let endorsement = &mut ctx.accounts.endorsement;
    let target_builder = &mut ctx.accounts.target_builder;
    let clock = Clock::get()?;

    endorsement.reflection = reflection.key();
    endorsement.mentor = ctx.accounts.mentor.key();
    endorsement.feedback_hash = feedback_hash;
    endorsement.rating = rating;
    endorsement.bump = ctx.bumps.endorsement;
    endorsement.created_at = clock.unix_timestamp;

    reflection.total_endorsements = reflection.total_endorsements.checked_add(1).unwrap();
    let bonus_reputation = (rating as u64) * 20;
    target_builder.reputation_score = target_builder.reputation_score.checked_add(bonus_reputation).unwrap();

    emit!(ReflectionEndorsed {
        mentor_authority: ctx.accounts.mentor.key(),
        reflection_pda: reflection.key(),
        endorsement_pda: endorsement.key(),
        rating,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}