use anchor_lang::prelude::*;
use anchor_spl::token_interface::{mint_to, MintTo, Token2022, TokenAccount, Mint};

declare_id!("RefL7vP6dZ3m14fWw5F8pGjUuYk2B4x9s8VnMqQk7X1");

pub const MAX_METADATA_LEN: usize = 128;
pub const MAX_HASH_LEN: usize = 32;
pub const CONVICTION_SCALE: u64 = 1_000_000;
pub const MIN_ATTESTATION_STAKE: u64 = 50_000_000; // 0.05 SOL

#[program]
pub mod colosseum_reflect {
    use super::*;

    /// Initialize the global protocol parameters and fee destination
    pub fn initialize_protocol(
        ctx: Context<InitializeProtocol>,
        slashing_penalty_bps: u16,
        conviction_halflife_seconds: i64,
    ) -> Result<()> {
        require!(slashing_penalty_bps <= 10_000, ReflectError::InvalidBps);
        require!(conviction_halflife_seconds > 0, ReflectError::InvalidHalfLife);

        let config = &mut ctx.accounts.global_config;
        config.authority = ctx.accounts.authority.key();
        config.treasury = ctx.accounts.treasury.key();
        config.slashing_penalty_bps = slashing_penalty_bps;
        config.conviction_halflife_seconds = conviction_halflife_seconds;
        config.total_projects = 0;
        config.bump = ctx.bumps.global_config;

        emit!(ProtocolInitializedEvent {
            authority: config.authority,
            slashing_penalty_bps,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Register a hackathon project profile
    pub fn initialize_project(
        ctx: Context<InitializeProject>,
        project_slug: String,
        repo_hash: [u8; 32],
    ) -> Result<()> {
        require!(project_slug.len() <= 32, ReflectError::SlugTooLong);

        let project = &mut ctx.accounts.project;
        project.authority = ctx.accounts.authority.key();
        project.project_slug = project_slug.clone();
        project.repo_hash = repo_hash;
        project.milestone_count = 0;
        project.total_accumulated_conviction = 0;
        project.bump = ctx.bumps.project;

        let config = &mut ctx.accounts.global_config;
        config.total_projects = config.total_projects.checked_add(1).ok_or(ReflectError::MathOverflow)?;

        emit!(ProjectRegisteredEvent {
            project_key: project.key(),
            authority: project.authority,
            slug: project_slug,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Builder submits a concrete milestone reflection and git commit root
    pub fn submit_milestone(
        ctx: Context<SubmitMilestone>,
        milestone_index: u32,
        commit_root: [u8; 32],
        reflection_uri: String,
        expected_deliverable_hash: [u8; 32],
    ) -> Result<()> {
        require!(reflection_uri.len() <= MAX_METADATA_LEN, ReflectError::UriTooLong);
        
        let project = &mut ctx.accounts.project;
        require_keys_eq!(project.authority, ctx.accounts.authority.key(), ReflectError::Unauthorized);
        require_eq!(milestone_index, project.milestone_count, ReflectError::InvalidMilestoneSequence);

        let milestone = &mut ctx.accounts.milestone;
        milestone.project = project.key();
        milestone.milestone_index = milestone_index;
        milestone.commit_root = commit_root;
        milestone.expected_deliverable_hash = expected_deliverable_hash;
        milestone.reflection_uri = reflection_uri.clone();
        milestone.submission_timestamp = Clock::get()?.unix_timestamp;
        milestone.conviction_score = 0;
        milestone.total_staked_lamports = 0;
        milestone.status = MilestoneStatus::Submitted;
        milestone.bump = ctx.bumps.milestone;

        project.milestone_count = project.milestone_count.checked_add(1).ok_or(ReflectError::MathOverflow)?;

        emit!(MilestoneSubmittedEvent {
            project: project.key(),
            milestone_index,
            commit_root,
            reflection_uri,
            timestamp: milestone.submission_timestamp,
        });

        Ok(())
    }

    /// Peer builder stakes SOL to attest to milestone veracity and technical excellence
    pub fn attest_peer_milestone(
        ctx: Context<AttestPeerMilestone>,
        stake_lamports: u64,
    ) -> Result<()> {
        require!(stake_lamports >= MIN_ATTESTATION_STAKE, ReflectError::InsufficientStake);
        
        let project = &ctx.accounts.project;
        let peer = ctx.accounts.peer.key();
        require_keys_neq!(project.authority, peer, ReflectError::SelfAttestationForbidden);

        let milestone = &mut ctx.accounts.milestone;
        require!(milestone.status == MilestoneStatus::Submitted, ReflectError::MilestoneNotActive);

        // CPI: Transfer stake lamports to escrow vault PDA
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.peer.to_account_info(),
                to: ctx.accounts.escrow_vault.to_account_info(),
            },
        );
        anchor_lang::system_program::transfer(cpi_context, stake_lamports)?;

        // Calculate conviction based on time delta from submission
        let now = Clock::get()?.unix_timestamp;
        let elapsed = (now - milestone.submission_timestamp).max(0);
        
        // Linearized exponential conviction approximation: Conviction = Stake * (1 + elapsed / half_life)
        let half_life = ctx.accounts.global_config.conviction_halflife_seconds;
        let decay_weight = (elapsed as u128)
            .checked_mul(CONVICTION_SCALE as u128)
            .ok_or(ReflectError::MathOverflow)?
            .checked_div(half_life as u128)
            .ok_or(ReflectError::MathOverflow)?
            .min(CONVICTION_SCALE as u128 * 5); // Capped maximum multiplier

        let added_conviction = (stake_lamports as u128)
            .checked_mul(CONVICTION_SCALE as u128 + decay_weight)
            .ok_or(ReflectError::MathOverflow)?
            .checked_div(CONVICTION_SCALE as u128)
            .ok_or(ReflectError::MathOverflow)? as u64;

        let attestation = &mut ctx.accounts.attestation;
        attestation.milestone = milestone.key();
        attestation.peer = peer;
        attestation.staked_lamports = attestation.staked_lamports.checked_add(stake_lamports).ok_or(ReflectError::MathOverflow)?;
        attestation.conviction_weight = attestation.conviction_weight.checked_add(added_conviction).ok_or(ReflectError::MathOverflow)?;
        attestation.timestamp = now;
        attestation.is_slashed = false;
        attestation.bump = ctx.bumps.attestation;

        milestone.conviction_score = milestone.conviction_score.checked_add(added_conviction).ok_or(ReflectError::MathOverflow)?;
        milestone.total_staked_lamports = milestone.total_staked_lamports.checked_add(stake_lamports).ok_or(ReflectError::MathOverflow)?;

        emit!(PeerAttestationEvent {
            milestone: milestone.key(),
            peer,
            staked_lamports: stake_lamports,
            conviction_added: added_conviction,
            timestamp: now,
        });

        Ok(())
    }

    /// Finalize milestone and mint an immutable, soulbound Token-2022 proof to the builder
    pub fn finalize_milestone(ctx: Context<FinalizeMilestone>) -> Result<()> {
        let milestone = &mut ctx.accounts.milestone;
        require!(milestone.status == MilestoneStatus::Submitted, ReflectError::MilestoneNotActive);
        
        let project = &mut ctx.accounts.project;
        
        // Minimum conviction requirement for automated graduation
        let conviction_threshold: u64 = 100_000_000; // 100M units
        require!(milestone.conviction_score >= conviction_threshold, ReflectError::ThresholdNotMet);

        milestone.status = MilestoneStatus::Verified;
        project.total_accumulated_conviction = project.total_accumulated_conviction
            .checked_add(milestone.conviction_score)
            .ok_or(ReflectError::MathOverflow)?;

        // Execute CPI to Token-2022 to mint 1 Soulbound Proof Badge to the builder
        let project_key = project.key();
        let seeds = &[
            b"project".as_ref(),
            project.authority.as_ref(),
            &[project.bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = MintTo {
            mint: ctx.accounts.badge_mint.to_account_info(),
            to: ctx.accounts.builder_token_account.to_account_info(),
            authority: project.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_2022_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        mint_to(cpi_ctx, 1)?;

        emit!(MilestoneFinalizedEvent {
            project: project_key,
            milestone: milestone.key(),
            final_conviction: milestone.conviction_score,
            badge_mint: ctx.accounts.badge_mint.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Slashes bad-faith milestone entries and penalizes colluding peer accounts
    pub fn slash_fraudulent_milestone(
        ctx: Context<SlashMilestone>,
        reason: String,
    ) -> Result<()> {
        require_keys_eq!(ctx.accounts.authority.key(), ctx.accounts.global_config.authority, ReflectError::Unauthorized);
        
        let milestone = &mut ctx.accounts.milestone;
        milestone.status = MilestoneStatus::Slashed;

        let total_vault_lamports = ctx.accounts.escrow_vault.to_account_info().lamports();
        let slash_bps = ctx.accounts.global_config.slashing_penalty_bps as u64;
        let penalty_amount = (total_vault_lamports as u128)
            .checked_mul(slash_bps as u128)
            .ok_or(ReflectError::MathOverflow)?
            .checked_div(10_000)
            .ok_or(ReflectError::MathOverflow)? as u64;

        if penalty_amount > 0 {
            **ctx.accounts.escrow_vault.to_account_info().try_borrow_mut_lamports()? = ctx
                .accounts
                .escrow_vault
                .to_account_info()
                .lamports()
                .checked_sub(penalty_amount)
                .ok_or(ReflectError::MathOverflow)?;

            **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? = ctx
                .accounts
                .treasury
                .to_account_info()
                .lamports()
                .checked_add(penalty_amount)
                .ok_or(ReflectError::MathOverflow)?;
        }

        emit!(MilestoneSlashedEvent {
            milestone: milestone.key(),
            slashed_amount: penalty_amount,
            reason,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

// -----------------------------------------------------------------------------
// ACCOUNT VALIDATION STRUCTS
// -----------------------------------------------------------------------------

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + GlobalConfig::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub global_config: Account<'info, GlobalConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: Safe treasury address receiving slashed penalties
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(project_slug: String)]
pub struct InitializeProject<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = global_config.bump
    )]
    pub global_config: Account<'info, GlobalConfig>,
    #[account(
        init,
        payer = authority,
        space = 8 + Project::INIT_SPACE,
        seeds = [b"project", authority.key().as_ref()],
        bump
    )]
    pub project: Account<'info, Project>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(milestone_index: u32)]
pub struct SubmitMilestone<'info> {
    #[account(
        mut,
        seeds = [b"project", authority.key().as_ref()],
        bump = project.bump,
        has_one = authority @ ReflectError::Unauthorized
    )]
    pub project: Account<'info, Project>,
    #[account(
        init,
        payer = authority,
        space = 8 + Milestone::INIT_SPACE,
        seeds = [b"milestone", project.key().as_ref(), &milestone_index.to_le_bytes()],
        bump
    )]
    pub milestone: Account<'info, Milestone>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AttestPeerMilestone<'info> {
    #[account(
        seeds = [b"config"],
        bump = global_config.bump
    )]
    pub global_config: Account<'info, GlobalConfig>,
    #[account(
        seeds = [b"project", project.authority.as_ref()],
        bump = project.bump
    )]
    pub project: Account<'info, Project>,
    #[account(
        mut,
        seeds = [b"milestone", project.key().as_ref(), &milestone.milestone_index.to_le_bytes()],
        bump = milestone.bump
    )]
    pub milestone: Account<'info, Milestone>,
    #[account(
        init_if_needed,
        payer = peer,
        space = 8 + Attestation::INIT_SPACE,
        seeds = [b"attestation", milestone.key().as_ref(), peer.key().as_ref()],
        bump
    )]
    pub attestation: Account<'info, Attestation>,
    #[account(
        mut,
        seeds = [b"vault", project.key().as_ref()],
        bump
    )]
    pub escrow_vault: SystemAccount<'info>,
    #[account(mut)]
    pub peer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FinalizeMilestone<'info> {
    #[account(
        mut,
        seeds = [b"project", project.authority.as_ref()],
        bump = project.bump
    )]
    pub project: Account<'info, Project>,
    #[account(
        mut,
        seeds = [b"milestone", project.key().as_ref(), &milestone.milestone_index.to_le_bytes()],
        bump = milestone.bump,
        has_one = project @ ReflectError::InvalidProjectLink
    )]
    pub milestone: Account<'info, Milestone>,
    #[account(
        mut,
        mint::authority = project.key(),
        mint::token_program = token_2022_program
    )]
    pub badge_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        token::mint = badge_mint,
        token::authority = project.authority,
        token::token_program = token_2022_program
    )]
    pub builder_token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_2022_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct SlashMilestone<'info> {
    #[account(
        seeds = [b"config"],
        bump = global_config.bump
    )]
    pub global_config: Account<'info, GlobalConfig>,
    #[account(
        mut,
        seeds = [b"project", project.authority.as_ref()],
        bump = project.bump
    )]
    pub project: Account<'info, Project>,
    #[account(
        mut,
        seeds = [b"milestone", project.key().as_ref(), &milestone.milestone_index.to_le_bytes()],
        bump = milestone.bump
    )]
    pub milestone: Account<'info, Milestone>,
    #[account(
        mut,
        seeds = [b"vault", project.key().as_ref()],
        bump
    )]
    pub escrow_vault: SystemAccount<'info>,
    #[account(mut)]
    /// CHECK: Treasury verified against global config
    pub treasury: AccountInfo<'info>,
    pub authority: Signer<'info>,
}

// -----------------------------------------------------------------------------
// STATE SCHEMAS
// -----------------------------------------------------------------------------

#[account]
#[derive(InitSpace)]
pub struct GlobalConfig {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub slashing_penalty_bps: u16,
    pub conviction_halflife_seconds: i64,
    pub total_projects: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Project {
    pub authority: Pubkey,
    #[max_len(32)]
    pub project_slug: String,
    pub repo_hash: [u8; 32],
    pub milestone_count: u32,
    pub total_accumulated_conviction: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Milestone {
    pub project: Pubkey,
    pub milestone_index: u32,
    pub commit_root: [u8; 32],
    pub expected_deliverable_hash: [u8; 32],
    #[max_len(128)]
    pub reflection_uri: String,
    pub submission_timestamp: i64,
    pub conviction_score: u64,
    pub total_staked_lamports: u64,
    pub status: MilestoneStatus,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Attestation {
    pub milestone: Pubkey,
    pub peer: Pubkey,
    pub staked_lamports: u64,
    pub conviction_weight: u64,
    pub timestamp: i64,
    pub is_slashed: bool,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum MilestoneStatus {
    Submitted,
    Verified,
    Slashed,
}

// -----------------------------------------------------------------------------
// EVENTS
// -----------------------------------------------------------------------------

#[event]
pub struct ProtocolInitializedEvent {
    pub authority: Pubkey,
    pub slashing_penalty_bps: u16,
    pub timestamp: i64,
}

#[event]
pub struct ProjectRegisteredEvent {
    pub project_key: Pubkey,
    pub authority: Pubkey,
    pub slug: String,
    pub timestamp: i64,
}

#[event]
pub struct MilestoneSubmittedEvent {
    pub project: Pubkey,
    pub milestone_index: u32,
    pub commit_root: [u8; 32],
    pub reflection_uri: String,
    pub timestamp: i64,
}

#[event]
pub struct PeerAttestationEvent {
    pub milestone: Pubkey,
    pub peer: Pubkey,
    pub staked_lamports: u64,
    pub conviction_added: u64,
    pub timestamp: i64,
}

#[event]
pub struct MilestoneFinalizedEvent {
    pub project: Pubkey,
    pub milestone: Pubkey,
    pub final_conviction: u64,
    pub badge_mint: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct MilestoneSlashedEvent {
    pub milestone: Pubkey,
    pub slashed_amount: u64,
    pub reason: String,
    pub timestamp: i64,
}

// -----------------------------------------------------------------------------
// ERROR DEFINITIONS
// -----------------------------------------------------------------------------

#[error_code]
pub enum ReflectError {
    #[msg("Slashing basis points must be <= 10,000")]
    InvalidBps,
    #[msg("Conviction half-life must be greater than zero")]
    InvalidHalfLife,
    #[msg("Slug length exceeds maximum limit of 32 bytes")]
    SlugTooLong,
    #[msg("Reflection URI exceeds maximum limit of 128 bytes")]
    UriTooLong,
    #[msg("Unauthorized signer for project operations")]
    Unauthorized,
    #[msg("Milestones must be submitted sequentially")]
    InvalidMilestoneSequence,
    #[msg("Self-attestation on own milestone is strictly forbidden")]
    SelfAttestationForbidden,
    #[msg("Milestone is not active or has already been finalized/slashed")]
    MilestoneNotActive,
    #[msg("Stake amount is below the minimum required 0.05 SOL")]
    InsufficientStake,
    #[msg("Conviction threshold not met for graduation and SBT mint")]
    ThresholdNotMet,
    #[msg("Milestone is not linked to this project")]
    InvalidProjectLink,
    #[msg("Arithmetic overflow or underflow detected")]
    MathOverflow,
}