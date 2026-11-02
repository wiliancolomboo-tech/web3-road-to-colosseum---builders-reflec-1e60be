use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::ChronicleError;
use crate::events::ReflectionCommitted;

#[derive(Accounts)]
#[instruction(sprint_number: u32)]
pub struct CommitReflection<'info> {
    #[account(
        mut,
        seeds = [b"builder", authority.key().as_ref()],
        bump = builder_profile.bump,
        has_one = authority
    )]
    pub builder_profile: Account<'info, BuilderProfile>,

    #[account(
        mut,
        seeds = [b"project", builder_profile.key().as_ref(), project_registry.project_slug.as_bytes()],
        bump = project_registry.bump,
        has_one = builder_authority
    )]
    pub project_registry: Account<'info, ProjectRegistry>,

    #[account(
        init,
        payer = authority,
        space = ReflectionRecord::LEN,
        seeds = [
            b"reflection",
            project_registry.key().as_ref(),
            &sprint_number.to_le_bytes()
        ],
        bump
    )]
    pub reflection_record: Account<'info, ReflectionRecord>,

    /// CHECK: Validated against project_registry.builder_authority
    pub builder_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CommitReflection>,
    sprint_number: u32,
    milestone_hash: [u8; 32],
    metrics_hash: [u8; 32],
    retrospective_uri: String,
    confidence_score: u8,
) -> Result<()> {
    require!(retrospective_uri.len() <= MAX_URI_LEN, ChronicleError::StringTooLong);
    require!(confidence_score >= 1 && confidence_score <= 10, ChronicleError::InvalidConfidenceScore);
    
    let project = &mut ctx.accounts.project_registry;
    require!(project.is_active, ChronicleError::ProjectConcluded);

    let expected_sprint = project.total_sprints.checked_add(1).unwrap();
    require!(sprint_number == expected_sprint, ChronicleError::InvalidSprintSequence);

    let profile = &mut ctx.accounts.builder_profile;
    let reflection = &mut ctx.accounts.reflection_record;
    let clock = Clock::get()?;

    reflection.project = project.key();
    reflection.builder_authority = ctx.accounts.authority.key();
    reflection.sprint_number = sprint_number;
    reflection.milestone_hash = milestone_hash;
    reflection.metrics_hash = metrics_hash;
    reflection.retrospective_uri = retrospective_uri.clone();
    reflection.confidence_score = confidence_score;
    reflection.total_endorsements = 0;
    reflection.bump = ctx.bumps.reflection_record;
    reflection.committed_at = clock.unix_timestamp;

    project.total_sprints = expected_sprint;
    profile.total_reflections = profile.total_reflections.checked_add(1).unwrap();
    profile.reputation_score = profile.reputation_score.checked_add(25).unwrap();

    emit!(ReflectionCommitted {
        builder_authority: ctx.accounts.authority.key(),
        project_pda: project.key(),
        reflection_pda: reflection.key(),
        sprint_number,
        milestone_hash,
        confidence_score,
        retrospective_uri,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}