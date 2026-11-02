use anchor_lang::prelude::*;

declare_id!("Chrnc1e111111111111111111111111111111111111");

#[program]
pub mod colosseum_chronicle {
    use super::*;

    /// Initialize a builder profile representing a project or team competing in the hackathon.
    pub fn initialize_builder(
        ctx: Context<InitializeBuilder>,
        handle: String,
        team_name: String,
        project_name: String,
        repo_url: String,
    ) -> Result<()> {
        require!(handle.len() >= 3 && handle.len() <= 32, ChronicleError::InvalidHandleLength);
        require!(team_name.len() <= 48, ChronicleError::StringTooLong);
        require!(project_name.len() <= 48, ChronicleError::StringTooLong);
        require!(repo_url.len() <= 128, ChronicleError::StringTooLong);

        let profile = &mut ctx.accounts.builder_profile;
        let clock = Clock::get()?;

        profile.authority = ctx.accounts.authority.key();
        profile.handle = handle.clone();
        profile.team_name = team_name.clone();
        profile.project_name = project_name.clone();
        profile.repo_url = repo_url;
        profile.total_reflections = 0;
        profile.reputation_score = 100; // Baseline entry score
        profile.registered_at = clock.unix_timestamp;
        profile.bump = ctx.bumps.builder_profile;

        emit!(BuilderRegisteredEvent {
            builder: profile.authority,
            handle,
            team_name,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Commit a milestone reflection with cryptographic hashes of code commits and extended notes.
    pub fn publish_reflection(
        ctx: Context<PublishReflection>,
        stage: MilestoneStage,
        content_hash: [u8; 32],      // SHA-256 hash of decentralized write-up (Arweave/IPFS)
        commit_hash: [u8; 20],       // Git commit hash (20 bytes SHA-1 binary)
        hours_spent: u16,
        blockers_encountered: bool,
        metrics_summary: String,
    ) -> Result<()> {
        require!(metrics_summary.len() <= 160, ChronicleError::StringTooLong);

        let clock = Clock::get()?;
        let profile = &mut ctx.accounts.builder_profile;
        let reflection = &mut ctx.accounts.reflection;

        let current_index = profile.total_reflections;

        reflection.builder = profile.authority;
        reflection.profile = profile.key();
        reflection.reflection_index = current_index;
        reflection.stage = stage;
        reflection.content_hash = content_hash;
        reflection.commit_hash = commit_hash;
        reflection.hours_spent = hours_spent;
        reflection.blockers_encountered = blockers_encountered;
        reflection.metrics_summary = metrics_summary.clone();
        reflection.endorsement_count = 0;
        reflection.published_at = clock.unix_timestamp;
        reflection.bump = ctx.bumps.reflection;

        // Increment builder stats
        profile.total_reflections = profile
            .total_reflections
            .checked_add(1)
            .ok_or(ChronicleError::ArithmeticOverflow)?;
        profile.reputation_score = profile
            .reputation_score
            .checked_add(25) // Dynamic reward for verified shipping
            .ok_or(ChronicleError::ArithmeticOverflow)?;

        emit!(ReflectionPublishedEvent {
            builder: profile.authority,
            reflection_index: current_index,
            stage,
            content_hash,
            commit_hash,
            hours_spent,
            published_at: clock.unix_timestamp,
            metrics_summary,
        });

        Ok(())
    }

    /// Mentors, accelerator judges, or verified peers attest and endorse a published milestone.
    pub fn endorse_reflection(
        ctx: Context<EndorseReflection>,
        endorsement_type: EndorsementType,
        attestation_hash: [u8; 32], // Optional encrypted review or mentor signature hash
    ) -> Result<()> {
        let clock = Clock::get()?;
        let endorser_key = ctx.accounts.endorser.key();
        let reflection = &mut ctx.accounts.reflection;
        let profile = &mut ctx.accounts.builder_profile;
        let endorsement = &mut ctx.accounts.endorsement;

        // Ensure endorser is not endorsing their own reflection
        require!(
            profile.authority != endorser_key,
            ChronicleError::SelfEndorsementForbidden
        );

        endorsement.endorser = endorser_key;
        endorsement.reflection = reflection.key();
        endorsement.endorsement_type = endorsement_type;
        endorsement.attestation_hash = attestation_hash;
        endorsement.timestamp = clock.unix_timestamp;
        endorsement.bump = ctx.bumps.endorsement;

        // Update reflection and builder metadata
        reflection.endorsement_count = reflection
            .endorsement_count
            .checked_add(1)
            .ok_or(ChronicleError::ArithmeticOverflow)?;

        let score_bonus = match endorsement_type {
            EndorsementType::Mentor => 50,
            EndorsementType::Judge => 100,
            EndorsementType::PeerBuilder => 15,
        };

        profile.reputation_score = profile
            .reputation_score
            .checked_add(score_bonus)
            .ok_or(ChronicleError::ArithmeticOverflow)?;

        emit!(ReflectionEndorsedEvent {
            reflection: reflection.key(),
            endorser: endorser_key,
            endorsement_type,
            new_reputation: profile.reputation_score,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }
}

// -----------------------------------------------------------------------------
// DATA STRUCTURES & ACCOUNTS
// -----------------------------------------------------------------------------

#[account]
#[derive(Default)]
pub struct BuilderProfile {
    pub authority: Pubkey,        // 32
    pub handle: String,           // 4 + 32
    pub team_name: String,        // 4 + 48
    pub project_name: String,     // 4 + 48
    pub repo_url: String,         // 4 + 128
    pub total_reflections: u64,   // 8
    pub reputation_score: u64,    // 8
    pub registered_at: i64,       // 8
    pub bump: u8,                 // 1
}

impl BuilderProfile {
    pub const LEN: usize = 8 + 32 + (4 + 32) + (4 + 48) + (4 + 48) + (4 + 128) + 8 + 8 + 8 + 1;
}

#[account]
pub struct MilestoneReflection {
    pub builder: Pubkey,          // 32
    pub profile: Pubkey,          // 32
    pub reflection_index: u64,    // 8
    pub stage: MilestoneStage,    // 1
    pub content_hash: [u8; 32],   // 32
    pub commit_hash: [u8; 20],    // 20
    pub hours_spent: u16,         // 2
    pub blockers_encountered: bool, // 1
    pub metrics_summary: String,  // 4 + 160
    pub endorsement_count: u32,   // 4
    pub published_at: i64,        // 8
    pub bump: u8,                 // 1
}

impl MilestoneReflection {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 1 + 32 + 20 + 2 + 1 + (4 + 160) + 4 + 8 + 1;
}

#[account]
pub struct PeerEndorsement {
    pub endorser: Pubkey,                     // 32
    pub reflection: Pubkey,                   // 32
    pub endorsement_type: EndorsementType,    // 1
    pub attestation_hash: [u8; 32],           // 32
    pub timestamp: i64,                       // 8
    pub bump: u8,                             // 1
}

impl PeerEndorsement {
    pub const LEN: usize = 8 + 32 + 32 + 1 + 32 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum MilestoneStage {
    IdeationAndArchitecture,
    CoreSmartContractDraft,
    DevnetDeployment,
    FrontendAndRpcIntegration,
    SecurityAuditAndQA,
    TestnetStressTest,
    MainnetLaunchpad,
    ColosseumPitchDemo,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum EndorsementType {
    Mentor,
    Judge,
    PeerBuilder,
}

// -----------------------------------------------------------------------------
// INSTRUCTION CONTEXTS
// -----------------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(handle: String)]
pub struct InitializeBuilder<'info> {
    #[account(
        init,
        payer = authority,
        space = BuilderProfile::LEN,
        seeds = [b"builder_profile", authority.key().as_ref()],
        bump
    )]
    pub builder_profile: Account<'info, BuilderProfile>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PublishReflection<'info> {
    #[account(
        mut,
        has_one = authority @ ChronicleError::UnauthorizedProfileOwner,
        seeds = [b"builder_profile", authority.key().as_ref()],
        bump = builder_profile.bump
    )]
    pub builder_profile: Account<'info, BuilderProfile>,

    #[account(
        init,
        payer = authority,
        space = MilestoneReflection::LEN,
        seeds = [
            b"milestone_reflection",
            builder_profile.key().as_ref(),
            &builder_profile.total_reflections.to_le_bytes()
        ],
        bump
    )]
    pub reflection: Account<'info, MilestoneReflection>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct EndorseReflection<'info> {
    #[account(
        mut,
        seeds = [b"builder_profile", builder_profile.authority.as_ref()],
        bump = builder_profile.bump
    )]
    pub builder_profile: Account<'info, BuilderProfile>,

    #[account(
        mut,
        has_one = profile @ ChronicleError::ProfileMismatch,
        seeds = [
            b"milestone_reflection",
            builder_profile.key().as_ref(),
            &reflection.reflection_index.to_le_bytes()
        ],
        bump = reflection.bump
    )]
    pub reflection: Account<'info, MilestoneReflection>,

    #[account(
        init,
        payer = endorser,
        space = PeerEndorsement::LEN,
        seeds = [
            b"endorsement",
            reflection.key().as_ref(),
            endorser.key().as_ref()
        ],
        bump
    )]
    pub endorsement: Account<'info, PeerEndorsement>,

    #[account(mut)]
    pub endorser: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// -----------------------------------------------------------------------------
// EVENTS & ERRORS
// -----------------------------------------------------------------------------

#[event]
pub struct BuilderRegisteredEvent {
    pub builder: Pubkey,
    pub handle: String,
    pub team_name: String,
    pub timestamp: i64,
}

#[event]
pub struct ReflectionPublishedEvent {
    pub builder: Pubkey,
    pub reflection_index: u64,
    pub stage: MilestoneStage,
    pub content_hash: [u8; 32],
    pub commit_hash: [u8; 20],
    pub hours_spent: u16,
    pub published_at: i64,
    pub metrics_summary: String,
}

#[event]
pub struct ReflectionEndorsedEvent {
    pub reflection: Pubkey,
    pub endorser: Pubkey,
    pub endorsement_type: EndorsementType,
    pub new_reputation: u64,
    pub timestamp: i64,
}

#[error_code]
pub enum ChronicleError {
    #[msg("Profile handle must be between 3 and 32 characters.")]
    InvalidHandleLength,
    #[msg("Input string exceeds maximum allowed byte allocation.")]
    StringTooLong,
    #[msg("Math calculation resulted in arithmetic overflow.")]
    ArithmeticOverflow,
    #[msg("Signer does not have authority to modify this builder profile.")]
    UnauthorizedProfileOwner,
    #[msg("Builders cannot endorse their own milestone reflection.")]
    SelfEndorsementForbidden,
    #[msg("Reflection does not match provided builder profile PDA.")]
    ProfileMismatch,
}