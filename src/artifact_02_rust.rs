use anchor_lang::prelude::*;

declare_id!("Echo111111111111111111111111111111111111111");

pub const MAX_TRACK_LEN: usize = 32;
pub const MAX_PROJECT_NAME_LEN: usize = 64;
pub const MAX_URI_LEN: usize = 128;
pub const CONTENT_HASH_LEN: usize = 32;
pub const MAX_ATTESTATIONS: usize = 10;

#[program]
pub mod colosseum_echo {
    use super::*;

    /// Initialize a new builder reflection for a given hackathon track.
    pub fn initialize_reflection(
        ctx: Context<InitializeReflection>,
        track: String,
        project_name: String,
        metadata_uri: String,
        content_hash: [u8; CONTENT_HASH_LEN],
        lessons_count: u16,
    ) -> Result<()> {
        require!(
            track.as_bytes().len() <= MAX_TRACK_LEN,
            EchoError::TrackNameTooLong
        );
        require!(
            project_name.as_bytes().len() <= MAX_PROJECT_NAME_LEN,
            EchoError::ProjectNameTooLong
        );
        require!(
            metadata_uri.as_bytes().len() <= MAX_URI_LEN,
            EchoError::UriTooLong
        );

        let reflection = &mut ctx.accounts.reflection;
        let clock = Clock::get()?;

        reflection.author = ctx.accounts.author.key();
        reflection.track = track.clone();
        reflection.project_name = project_name.clone();
        reflection.metadata_uri = metadata_uri.clone();
        reflection.content_hash = content_hash;
        reflection.lessons_count = lessons_count;
        reflection.attestation_count = 0;
        reflection.attestations = [Pubkey::default(); MAX_ATTESTATIONS];
        reflection.created_at = clock.unix_timestamp;
        reflection.updated_at = clock.unix_timestamp;
        reflection.bump = ctx.bumps.reflection;

        emit!(ReflectionSubmitted {
            author: reflection.author,
            track,
            project_name,
            metadata_uri,
            content_hash,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Add a cryptographic peer attestation from a co-builder or mentor.
    pub fn attest_reflection(ctx: Context<AttestReflection>) -> Result<()> {
        let reflection = &mut ctx.accounts.reflection;
        let peer = ctx.accounts.peer.key();

        require!(
            peer != reflection.author,
            EchoError::SelfAttestationForbidden
        );

        let count = reflection.attestation_count as usize;
        require!(count < MAX_ATTESTATIONS, EchoError::MaxAttestationsReached);

        for i in 0..count {
            require!(
                reflection.attestations[i] != peer,
                EchoError::DuplicateAttestation
            );
        }

        reflection.attestations[count] = peer;
        reflection.attestation_count = (count + 1) as u8;
        reflection.updated_at = Clock::get()?.unix_timestamp;

        emit!(PeerAttestationAdded {
            reflection: reflection.key(),
            peer,
            attestation_count: reflection.attestation_count,
            timestamp: reflection.updated_at,
        });

        Ok(())
    }

    /// Close the reflection account and reclaim rent (author only).
    pub fn close_reflection(_ctx: Context<CloseReflection>) -> Result<()> {
        Ok(())
    }
}

// -----------------------------------------------------------------------------
// Account Contexts
// -----------------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(track: String, project_name: String)]
pub struct InitializeReflection<'info> {
    #[account(
        init,
        payer = author,
        space = 8 + ReflectionAccount::LEN,
        seeds = [
            b"colosseum_reflection",
            author.key().as_ref(),
            track.as_bytes()
        ],
        bump
    )]
    pub reflection: Account<'info, ReflectionAccount>,

    #[account(mut)]
    pub author: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AttestReflection<'info> {
    #[account(
        mut,
        seeds = [
            b"colosseum_reflection",
            reflection.author.as_ref(),
            reflection.track.as_bytes()
        ],
        bump = reflection.bump
    )]
    pub reflection: Account<'info, ReflectionAccount>,

    #[account(mut)]
    pub peer: Signer<'info>,
}

#[derive(Accounts)]
pub struct CloseReflection<'info> {
    #[account(
        mut,
        seeds = [
            b"colosseum_reflection",
            reflection.author.as_ref(),
            reflection.track.as_bytes()
        ],
        bump = reflection.bump,
        has_one = author @ EchoError::UnauthorizedAuthor,
        close = author
    )]
    pub reflection: Account<'info, ReflectionAccount>,

    #[account(mut)]
    pub author: Signer<'info>,
}

// -----------------------------------------------------------------------------
// State Structs
// -----------------------------------------------------------------------------

#[account]
pub struct ReflectionAccount {
    pub author: Pubkey,                         // 32
    pub track: String,                          // 4 + 32
    pub project_name: String,                   // 4 + 64
    pub metadata_uri: String,                   // 4 + 128
    pub content_hash: [u8; CONTENT_HASH_LEN],   // 32
    pub lessons_count: u16,                     // 2
    pub attestation_count: u8,                  // 1
    pub attestations: [Pubkey; MAX_ATTESTATIONS],// 32 * 10 = 320
    pub created_at: i64,                        // 8
    pub updated_at: i64,                        // 8
    pub bump: u8,                               // 1
}

impl ReflectionAccount {
    pub const LEN: usize = 32 + (4 + MAX_TRACK_LEN) + (4 + MAX_PROJECT_NAME_LEN)
        + (4 + MAX_URI_LEN) + CONTENT_HASH_LEN + 2 + 1 + (32 * MAX_ATTESTATIONS) + 8 + 8 + 1;
}

// -----------------------------------------------------------------------------
// Events
// -----------------------------------------------------------------------------

#[event]
pub struct ReflectionSubmitted {
    pub author: Pubkey,
    pub track: String,
    pub project_name: String,
    pub metadata_uri: String,
    pub content_hash: [u8; CONTENT_HASH_LEN],
    pub timestamp: i64,
}

#[event]
pub struct PeerAttestationAdded {
    pub reflection: Pubkey,
    pub peer: Pubkey,
    pub attestation_count: u8,
    pub timestamp: i64,
}

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

#[error_code]
pub enum EchoError {
    #[msg("Track name exceeds the maximum length of 32 bytes.")]
    TrackNameTooLong,
    #[msg("Project name exceeds the maximum length of 64 bytes.")]
    ProjectNameTooLong,
    #[msg("Metadata URI exceeds the maximum length of 128 bytes.")]
    UriTooLong,
    #[msg("You cannot peer-attest to your own retrospective.")]
    SelfAttestationForbidden,
    #[msg("Maximum attestation capacity (10) reached for this retrospective.")]
    MaxAttestationsReached,
    #[msg("Peer has already attested to this retrospective.")]
    DuplicateAttestation,
    #[msg("Only the initial author can close this retrospective.")]
    UnauthorizedAuthor,
}