use anchor_lang::prelude::*;

declare_id!("RefLecT111111111111111111111111111111111111");

pub const MAX_NAME_LEN: usize = 32;
pub const MAX_URI_LEN: usize = 128;
pub const MAX_TRACK_LEN: usize = 32;
pub const MAX_KEY_TAKEAWAY_LEN: usize = 280;

#[program]
pub mod colosseum_reflect {
    use super::*;

    pub fn initialize_builder(
        ctx: Context<InitializeBuilder>,
        handle: String,
        github_username: String,
    ) -> Result<()> {
        require!(
            handle.len() > 0 && handle.len() <= MAX_NAME_LEN,
            ChronicleError::InvalidHandleLength
        );
        require!(
            github_username.len() > 0 && github_username.len() <= MAX_NAME_LEN,
            ChronicleError::InvalidGithubLength
        );

        let builder = &mut ctx.accounts.builder_profile;
        builder.authority = ctx.accounts.authority.key();
        builder.handle = handle;
        builder.github_username = github_username;
        builder.total_projects = 0;
        builder.total_reflections = 0;
        builder.bump = ctx.bumps.builder_profile;

        emit!(BuilderRegisteredEvent {
            authority: builder.authority,
            handle: builder.handle.clone(),
            github_username: builder.github_username.clone(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn register_project(
        ctx: Context<RegisterProject>,
        project_slug: String,
        title: String,
        colosseum_track: String,
        repo_url: String,
    ) -> Result<()> {
        require!(
            project_slug.len() > 0 && project_slug.len() <= MAX_NAME_LEN,
            ChronicleError::InvalidProjectSlug
        );
        require!(
            title.len() > 0 && title.len() <= MAX_NAME_LEN,
            ChronicleError::InvalidTitleLength
        );
        require!(
            colosseum_track.len() > 0 && colosseum_track.len() <= MAX_TRACK_LEN,
            ChronicleError::InvalidTrackLength
        );
        require!(
            repo_url.len() > 0 && repo_url.len() <= MAX_URI_LEN,
            ChronicleError::InvalidUriLength
        );

        let project = &mut ctx.accounts.project_profile;
        project.builder = ctx.accounts.authority.key();
        project.project_slug = project_slug.clone();
        project.title = title.clone();
        project.colosseum_track = colosseum_track.clone();
        project.repo_url = repo_url;
        project.reflection_count = 0;
        project.bump = ctx.bumps.project_profile;

        let builder = &mut ctx.accounts.builder_profile;
        builder.total_projects = builder
            .total_projects
            .checked_add(1)
            .ok_or(ChronicleError::ArithmeticOverflow)?;

        emit!(ProjectCreatedEvent {
            builder: project.builder,
            project_slug,
            title,
            track: colosseum_track,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn submit_reflection(
        ctx: Context<SubmitReflection>,
        stage: BuildStage,
        commit_hash: [u8; 20],
        tests_passed: u32,
        tests_total: u32,
        lines_of_code: u32,
        key_takeaway: String,
        metadata_uri: String,
    ) -> Result<()> {
        require!(tests_passed <= tests_total, ChronicleError::InvalidTestCounts);
        require!(
            key_takeaway.len() > 0 && key_takeaway.len() <= MAX_KEY_TAKEAWAY_LEN,
            ChronicleError::InvalidTakeawayLength
        );
        require!(
            metadata_uri.len() <= MAX_URI_LEN,
            ChronicleError::InvalidUriLength
        );

        let clock = Clock::get()?;
        let project = &mut ctx.accounts.project_profile;
        let reflection_index = project.reflection_count;

        let reflection = &mut ctx.accounts.milestone_reflection;
        reflection.project = project.key();
        reflection.author = ctx.accounts.authority.key();
        reflection.index = reflection_index;
        reflection.stage = stage;
        reflection.commit_hash = commit_hash;
        reflection.tests_passed = tests_passed;
        reflection.tests_total = tests_total;
        reflection.lines_of_code = lines_of_code;
        reflection.key_takeaway = key_takeaway.clone();
        reflection.metadata_uri = metadata_uri.clone();
        reflection.endorsement_count = 0;
        reflection.timestamp = clock.unix_timestamp;
        reflection.bump = ctx.bumps.milestone_reflection;

        project.reflection_count = project
            .reflection_count
            .checked_add(1)
            .ok_or(ChronicleError::ArithmeticOverflow)?;

        let builder = &mut ctx.accounts.builder_profile;
        builder.total_reflections = builder
            .total_reflections
            .checked_add(1)
            .ok_or(ChronicleError::ArithmeticOverflow)?;

        emit!(MilestoneReflectedEvent {
            project: project.key(),
            author: reflection.author,
            index: reflection_index,
            stage,
            tests_passed,
            tests_total,
            commit_hash,
            key_takeaway,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    pub fn endorse_reflection(ctx: Context<EndorseReflection>) -> Result<()> {
        let reflection = &mut ctx.accounts.milestone_reflection;
        require!(
            reflection.author != ctx.accounts.endorser.key(),
            ChronicleError::SelfEndorsementForbidden
        );

        let endorsement = &mut ctx.accounts.endorsement_record;
        endorsement.reflection = reflection.key();
        endorsement.endorser = ctx.accounts.endorser.key();
        endorsement.timestamp = Clock::get()?.unix_timestamp;
        endorsement.bump = ctx.bumps.endorsement_record;

        reflection.endorsement_count = reflection
            .endorsement_count
            .checked_add(1)
            .ok_or(ChronicleError::ArithmeticOverflow)?;

        emit!(MilestoneEndorsedEvent {
            reflection: reflection.key(),
            endorser: endorsement.endorser,
            total_endorsements: reflection.endorsement_count,
            timestamp: endorsement.timestamp,
        });

        Ok(())
    }
}

// -----------------------------------------------------------------------------
// ACCOUNT STRUCTURES
// -----------------------------------------------------------------------------

#[account]
pub struct BuilderProfile {
    pub authority: Pubkey,         // 32
    pub handle: String,            // 4 + 32
    pub github_username: String,   // 4 + 32
    pub total_projects: u32,       // 4
    pub total_reflections: u32,    // 4
    pub bump: u8,                  // 1
}

impl BuilderProfile {
    pub const LEN: usize = 8 + 32 + (4 + MAX_NAME_LEN) + (4 + MAX_NAME_LEN) + 4 + 4 + 1;
}

#[account]
pub struct ProjectProfile {
    pub builder: Pubkey,           // 32
    pub project_slug: String,      // 4 + 32
    pub title: String,             // 4 + 32
    pub colosseum_track: String,   // 4 + 32
    pub repo_url: String,          // 4 + 128
    pub reflection_count: u32,     // 4
    pub bump: u8,                  // 1
}

impl ProjectProfile {
    pub const LEN: usize = 8 + 32 + (4 + MAX_NAME_LEN) + (4 + MAX_NAME_LEN) + (4 + MAX_TRACK_LEN) + (4 + MAX_URI_LEN) + 4 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum BuildStage {
    Ideation = 0,
    ArchitectureDesign = 1,
    SmartContractCore = 2,
    IntegrationTesting = 3,
    DevnetDeployment = 4,
    SecurityAuditPrep = 5,
    MainnetLaunchReady = 6,
}

#[account]
pub struct MilestoneReflection {
    pub project: Pubkey,            // 32
    pub author: Pubkey,             // 32
    pub index: u32,                 // 4
    pub stage: BuildStage,          // 1
    pub commit_hash: [u8; 20],      // 20 (git sha-1)
    pub tests_passed: u32,          // 4
    pub tests_total: u32,           // 4
    pub lines_of_code: u32,         // 4
    pub key_takeaway: String,       // 4 + 280
    pub metadata_uri: String,       // 4 + 128
    pub endorsement_count: u32,     // 4
    pub timestamp: i64,             // 8
    pub bump: u8,                   // 1
}

impl MilestoneReflection {
    pub const LEN: usize = 8 + 32 + 32 + 4 + 1 + 20 + 4 + 4 + 4 + (4 + MAX_KEY_TAKEAWAY_LEN) + (4 + MAX_URI_LEN) + 4 + 8 + 1;
}

#[account]
pub struct EndorsementRecord {
    pub reflection: Pubkey,         // 32
    pub endorser: Pubkey,           // 32
    pub timestamp: i64,             // 8
    pub bump: u8,                   // 1
}

impl EndorsementRecord {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 1;
}

// -----------------------------------------------------------------------------
// INSTRUCTION CONTEXTS
// -----------------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(handle: String, github_username: String)]
pub struct InitializeBuilder<'info> {
    #[account(
        init,
        payer = authority,
        space = BuilderProfile::LEN,
        seeds = [b"builder", authority.key().as_ref()],
        bump
    )]
    pub builder_profile: Account<'info, BuilderProfile>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(project_slug: String)]
pub struct RegisterProject<'info> {
    #[account(
        mut,
        seeds = [b"builder", authority.key().as_ref()],
        bump = builder_profile.bump,
        has_one = authority,
    )]
    pub builder_profile: Account<'info, BuilderProfile>,
    #[account(
        init,
        payer = authority,
        space = ProjectProfile::LEN,
        seeds = [b"project", authority.key().as_ref(), project_slug.as_bytes()],
        bump
    )]
    pub project_profile: Account<'info, ProjectProfile>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitReflection<'info> {
    #[account(
        mut,
        seeds = [b"builder", authority.key().as_ref()],
        bump = builder_profile.bump,
        has_one = authority,
    )]
    pub builder_profile: Account<'info, BuilderProfile>,
    #[account(
        mut,
        seeds = [b"project", authority.key().as_ref(), project_profile.project_slug.as_bytes()],
        bump = project_profile.bump,
        has_one = builder,
    )]
    pub project_profile: Account<'info, ProjectProfile>,
    #[account(
        init,
        payer = authority,
        space = MilestoneReflection::LEN,
        seeds = [
            b"reflection",
            project_profile.key().as_ref(),
            &project_profile.reflection_count.to_le_bytes()
        ],
        bump
    )]
    pub milestone_reflection: Account<'info, MilestoneReflection>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: Validated against project_profile.builder constraint
    pub builder: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct EndorseReflection<'info> {
    #[account(mut)]
    pub milestone_reflection: Account<'info, MilestoneReflection>,
    #[account(
        init,
        payer = endorser,
        space = EndorsementRecord::LEN,
        seeds = [
            b"endorsement",
            milestone_reflection.key().as_ref(),
            endorser.key().as_ref()
        ],
        bump
    )]
    pub endorsement_record: Account<'info, EndorsementRecord>,
    #[account(mut)]
    pub endorser: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// -----------------------------------------------------------------------------
// EVENTS & ERRORS
// -----------------------------------------------------------------------------

#[event]
pub struct BuilderRegisteredEvent {
    pub authority: Pubkey,
    pub handle: String,
    pub github_username: String,
    pub timestamp: i64,
}

#[event]
pub struct ProjectCreatedEvent {
    pub builder: Pubkey,
    pub project_slug: String,
    pub title: String,
    pub track: String,
    pub timestamp: i64,
}

#[event]
pub struct MilestoneReflectedEvent {
    pub project: Pubkey,
    pub author: Pubkey,
    pub index: u32,
    pub stage: BuildStage,
    pub tests_passed: u32,
    pub tests_total: u32,
    pub commit_hash: [u8; 20],
    pub key_takeaway: String,
    pub timestamp: i64,
}

#[event]
pub struct MilestoneEndorsedEvent {
    pub reflection: Pubkey,
    pub endorser: Pubkey,
    pub total_endorsements: u32,
    pub timestamp: i64,
}

#[error_code]
pub enum ChronicleError {
    #[msg("Builder handle must be between 1 and 32 characters.")]
    InvalidHandleLength,
    #[msg("GitHub username must be between 1 and 32 characters.")]
    InvalidGithubLength,
    #[msg("Project slug must be between 1 and 32 characters.")]
    InvalidProjectSlug,
    #[msg("Project title must be between 1 and 32 characters.")]
    InvalidTitleLength,
    #[msg("Colosseum track name must be between 1 and 32 characters.")]
    InvalidTrackLength,
    #[msg("URI exceeds maximum permitted length.")]
    InvalidUriLength,
    #[msg("Key takeaway reflection must be between 1 and 280 characters.")]
    InvalidTakeawayLength,
    #[msg("Tests passed cannot exceed total tests executed.")]
    InvalidTestCounts,
    #[msg("Builders cannot endorse their own milestone reflection.")]
    SelfEndorsementForbidden,
    #[msg("Math arithmetic overflow occurred.")]
    ArithmeticOverflow,
}