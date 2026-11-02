use anchor_lang::prelude::*;

declare_id!("ChrncLE7kYd3ZUXxWz3C3rW2Lq2TKn8u1E9V3X5vYFzM");

pub const MAX_NAME_LEN: usize = 64;
pub const MAX_PROJECT_LEN: usize = 64;
pub const MAX_URI_LEN: usize = 128;
pub const MAX_SUMMARY_LEN: usize = 280;

#[program]
pub mod colosseum_chronicle {
    use super::*;

    /// Initializes a builder's root profile on-chain.
    pub fn initialize_builder_profile(
        ctx: Context<InitializeBuilderProfile>,
        name: String,
        project_name: String,
        metadata_uri: String,
    ) -> Result<()> {
        require!(name.len() > 0 && name.len() <= MAX_NAME_LEN, ChronicleError::StringOutOfBounds);
        require!(project_name.len() > 0 && project_name.len() <= MAX_PROJECT_LEN, ChronicleError::StringOutOfBounds);
        require!(metadata_uri.len() <= MAX_URI_LEN, ChronicleError::StringOutOfBounds);

        let profile = &mut ctx.accounts.profile;
        let clock = Clock::get()?;

        profile.authority = ctx.accounts.authority.key();
        profile.name = name;
        profile.project_name = project_name;
        profile.metadata_uri = metadata_uri;
        profile.milestone_count = 0;
        profile.total_attestations = 0;
        profile.created_at = clock.unix_timestamp;
        profile.bump = ctx.bumps.profile;

        emit!(BuilderProfileInitialized {
            builder: profile.authority,
            project_name: profile.project_name.clone(),
            timestamp: profile.created_at,
        });

        Ok(())
    }

    /// Records an immutable retrospective milestone with cryptographic proof hashes.
    pub fn record_milestone(
        ctx: Context<RecordMilestone>,
        title: String,
        summary: String,
        proof_hash: [u8; 32],
        category: u8,
        hours_invested: u16,
    ) -> Result<()> {
        require!(title.len() > 0 && title.len() <= MAX_NAME_LEN, ChronicleError::StringOutOfBounds);
        require!(summary.len() > 0 && summary.len() <= MAX_SUMMARY_LEN, ChronicleError::StringOutOfBounds);
        require!(category <= 4, ChronicleError::InvalidMilestoneCategory);

        let profile = &mut ctx.accounts.profile;
        let milestone = &mut ctx.accounts.milestone;
        let clock = Clock::get()?;

        milestone.profile = profile.key();
        milestone.index = profile.milestone_count;
        milestone.title = title;
        milestone.summary = summary;
        milestone.proof_hash = proof_hash;
        milestone.category = category;
        milestone.hours_invested = hours_invested;
        milestone.attestation_count = 0;
        milestone.created_at = clock.unix_timestamp;
        milestone.bump = ctx.bumps.milestone;

        profile.milestone_count = profile
            .milestone_count
            .checked_add(1)
            .ok_or(ChronicleError::NumericalOverflow)?;

        emit!(MilestonePublished {
            builder: profile.authority,
            profile: profile.key(),
            milestone_index: milestone.index,
            proof_hash,
            category,
            timestamp: milestone.created_at,
        });

        Ok(())
    }

    /// Mentors or peers evaluate and attest to a recorded retrospective milestone.
    pub fn attest_milestone(
        ctx: Context<AttestMilestone>,
        score: u8,
        feedback: String,
    ) -> Result<()> {
        require!(score >= 1 && score <= 100, ChronicleError::InvalidAttestationScore);
        require!(feedback.len() <= MAX_SUMMARY_LEN, ChronicleError::StringOutOfBounds);
        require!(
            ctx.accounts.profile.authority != ctx.accounts.mentor.key(),
            ChronicleError::CannotSelfAttest
        );

        let profile = &mut ctx.accounts.profile;
        let milestone = &mut ctx.accounts.milestone;
        let attestation = &mut ctx.accounts.attestation;
        let clock = Clock::get()?;

        attestation.milestone = milestone.key();
        attestation.mentor = ctx.accounts.mentor.key();
        attestation.score = score;
        attestation.feedback = feedback;
        attestation.timestamp = clock.unix_timestamp;
        attestation.bump = ctx.bumps.attestation;

        milestone.attestation_count = milestone
            .attestation_count
            .checked_add(1)
            .ok_or(ChronicleError::NumericalOverflow)?;

        profile.total_attestations = profile
            .total_attestations
            .checked_add(1)
            .ok_or(ChronicleError::NumericalOverflow)?;

        emit!(AttestationRecorded {
            milestone: milestone.key(),
            mentor: attestation.mentor,
            score,
            timestamp: attestation.timestamp,
        });

        Ok(())
    }
}

// -----------------------------------------------------------------------------
// ACCOUNT VALIDATION STRUCTS
// -----------------------------------------------------------------------------

#[derive(Accounts)]
pub struct InitializeBuilderProfile<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + BuilderProfile::INIT_SPACE,
        seeds = [b"profile", authority.key().as_ref()],
        bump
    )]
    pub profile: Account<'info, BuilderProfile>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordMilestone<'info> {
    #[account(
        mut,
        has_one = authority @ ChronicleError::UnauthorizedProfileOwner,
        seeds = [b"profile", authority.key().as_ref()],
        bump = profile.bump,
    )]
    pub profile: Account<'info, BuilderProfile>,

    #[account(
        init,
        payer = authority,
        space = 8 + MilestoneRecord::INIT_SPACE,
        seeds = [
            b"milestone",
            profile.key().as_ref(),
            &profile.milestone_count.to_le_bytes()
        ],
        bump
    )]
    pub milestone: Account<'info, MilestoneRecord>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AttestMilestone<'info> {
    #[account(
        mut,
        seeds = [b"profile", profile.authority.as_ref()],
        bump = profile.bump,
    )]
    pub profile: Account<'info, BuilderProfile>,

    #[account(
        mut,
        seeds = [
            b"milestone",
            profile.key().as_ref(),
            &milestone.index.to_le_bytes()
        ],
        bump = milestone.bump,
    )]
    pub milestone: Account<'info, MilestoneRecord>,

    #[account(
        init,
        payer = mentor,
        space = 8 + AttestationRecord::INIT_SPACE,
        seeds = [
            b"attestation",
            milestone.key().as_ref(),
            mentor.key().as_ref()
        ],
        bump
    )]
    pub attestation: Account<'info, AttestationRecord>,

    #[account(mut)]
    pub mentor: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// -----------------------------------------------------------------------------
// STATE SCHEMAS
// -----------------------------------------------------------------------------

#[account]
#[derive(InitSpace)]
pub struct BuilderProfile {
    pub authority: Pubkey,                   // 32
    #[max_len(64)]
    pub name: String,                        // 4 + 64
    #[max_len(64)]
    pub project_name: String,                // 4 + 64
    #[max_len(128)]
    pub metadata_uri: String,                // 4 + 128
    pub milestone_count: u32,                // 4
    pub total_attestations: u32,             // 4
    pub created_at: i64,                     // 8
    pub bump: u8,                            // 1
}

#[account]
#[derive(InitSpace)]
pub struct MilestoneRecord {
    pub profile: Pubkey,                     // 32
    pub index: u32,                          // 4
    #[max_len(64)]
    pub title: String,                       // 4 + 64
    #[max_len(280)]
    pub summary: String,                     // 4 + 280
    pub proof_hash: [u8; 32],                // 32
    pub category: u8,                        // 1 (0: Ideation, 1: Arch, 2: Pivot, 3: MVP, 4: Launch)
    pub hours_invested: u16,                 // 2
    pub attestation_count: u16,              // 2
    pub created_at: i64,                     // 8
    pub bump: u8,                            // 1
}

#[account]
#[derive(InitSpace)]
pub struct AttestationRecord {
    pub milestone: Pubkey,                   // 32
    pub mentor: Pubkey,                      // 32
    pub score: u8,                           // 1 (1 - 100)
    #[max_len(280)]
    pub feedback: String,                    // 4 + 280
    pub timestamp: i64,                      // 8
    pub bump: u8,                            // 1
}

// -----------------------------------------------------------------------------
// EVENTS & ERRORS
// -----------------------------------------------------------------------------

#[event]
pub struct BuilderProfileInitialized {
    pub builder: Pubkey,
    pub project_name: String,
    pub timestamp: i64,
}

#[event]
pub struct MilestonePublished {
    pub builder: Pubkey,
    pub profile: Pubkey,
    pub milestone_index: u32,
    pub proof_hash: [u8; 32],
    pub category: u8,
    pub timestamp: i64,
}

#[event]
pub struct AttestationRecorded {
    pub milestone: Pubkey,
    pub mentor: Pubkey,
    pub score: u8,
    pub timestamp: i64,
}

#[error_code]
pub enum ChronicleError {
    #[msg("String provided exceeds authorized size constraint.")]
    StringOutOfBounds,
    #[msg("Math calculation resulted in numerical overflow.")]
    NumericalOverflow,
    #[msg("Provided milestone category integer is invalid.")]
    InvalidMilestoneCategory,
    #[msg("Score must range between 1 and 100 inclusive.")]
    InvalidAttestationScore,
    #[msg("Builders are strictly prohibited from self-attesting to milestones.")]
    CannotSelfAttest,
    #[msg("Signer is not authorized to mutate this builder profile.")]
    UnauthorizedProfileOwner,
}