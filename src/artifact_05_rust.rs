use anchor_lang::prelude::*;

#[error_code]
pub enum ReflectError {
    #[msg("Project name exceeds maximum length of 32 bytes.")]
    ProjectNameTooLong,
    #[msg("Project description exceeds maximum length of 256 bytes.")]
    ProjectDescriptionTooLong,
    #[msg("Git repository URL exceeds maximum length of 128 bytes.")]
    RepoUrlTooLong,
    #[msg("Title exceeds maximum length of 64 bytes.")]
    TitleTooLong,
    #[msg("Reflection body CID exceeds maximum length of 64 bytes.")]
    CidTooLong,
    #[msg("Commit hash must be exactly 40 hex characters.")]
    InvalidCommitHashLength,
    #[msg("Reflection sequence out of order.")]
    InvalidSequence,
    #[msg("Builder cannot endorse their own reflection.")]
    SelfEndorsementNotAllowed,
    #[msg("Endorsement comment exceeds maximum length of 140 bytes.")]
    EndorsementCommentTooLong,
}