//! The contract half of the Mosaec error catalog.
//!
//! Each variant panics with its stable code as the message prefix (`E_CAP: ...`), so the SDK, the
//! API and the web app decode a failed receipt by code alone. The TypeScript catalog mirrors this
//! enum one to one; a CI test fails when either side has a code the other lacks.

use core::fmt;

use near_sdk::FunctionError;

/// Result alias used by every fallible contract and helper function.
pub type MosaecResult<T> = Result<T, MosaecError>;

/// Every refusal a Mosaec contract can return.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MosaecError {
    /// The pack holds a verifier public key.
    Keys,
    /// Predecessor authentication is disabled for the pack at the verifier.
    PredAuthOff,
    /// The verifier has locked the pack.
    VerifierLocked,
    /// The pack's balances differ from the committed contents.
    Contents,
    /// The terms in the message differ from the offer, or fall outside the allowed range.
    Terms,
    /// A decision chain or NFT transfer on this token is still in flight.
    Pending,
    /// The offer or the term has passed.
    Expired,
    /// The caller is not the direct owner of the required Title or Ticket.
    Holder,
    /// The pack is in a state that refuses this call.
    State,
    /// A token amount is above its per-pack cap.
    Cap,
    /// The predecessor is not the NEAR Intents verifier.
    NotVerifier,
    /// The predecessor is not a pack of this registry.
    NotPack,
    /// The predecessor is not the pack's registry.
    NotRegistry,
    /// The token is not on the allowlist for this role.
    Token,
    /// An amount is zero or differs from the required value.
    Amount,
    /// The transfer message could not be parsed.
    Msg,
    /// The attached deposit does not cover the required storage.
    Storage,
    /// A home-chain withdrawal is below the bridge minimum.
    MinWithdraw,
    /// More tokens than the verifier moves in one batch, or a repeated token.
    Batch,
    /// The taker is the maker.
    SelfFill,
    /// The prepaid gas cannot cover the whole chain.
    Gas,
    /// A recorded disruption keeps the position open until the grace deadline.
    Grace,
    /// New positions are paused.
    Paused,
    /// The caller is not the guardian.
    NotGuardian,
}

impl MosaecError {
    /// Every variant, in catalog order. Used by the catalog parity test.
    pub const ALL: [Self; 24] = [
        Self::Keys,
        Self::PredAuthOff,
        Self::VerifierLocked,
        Self::Contents,
        Self::Terms,
        Self::Pending,
        Self::Expired,
        Self::Holder,
        Self::State,
        Self::Cap,
        Self::NotVerifier,
        Self::NotPack,
        Self::NotRegistry,
        Self::Token,
        Self::Amount,
        Self::Msg,
        Self::Storage,
        Self::MinWithdraw,
        Self::Batch,
        Self::SelfFill,
        Self::Gas,
        Self::Grace,
        Self::Paused,
        Self::NotGuardian,
    ];

    /// The stable code shared with the off-chain catalog.
    #[must_use]
    pub const fn code(self) -> &'static str {
        match self {
            Self::Keys => "E_KEYS",
            Self::PredAuthOff => "E_PRED_AUTH_OFF",
            Self::VerifierLocked => "E_VERIFIER_LOCKED",
            Self::Contents => "E_CONTENTS",
            Self::Terms => "E_TERMS",
            Self::Pending => "E_PENDING",
            Self::Expired => "E_EXPIRED",
            Self::Holder => "E_HOLDER",
            Self::State => "E_STATE",
            Self::Cap => "E_CAP",
            Self::NotVerifier => "E_NOT_VERIFIER",
            Self::NotPack => "E_NOT_PACK",
            Self::NotRegistry => "E_NOT_REGISTRY",
            Self::Token => "E_TOKEN",
            Self::Amount => "E_AMOUNT",
            Self::Msg => "E_MSG",
            Self::Storage => "E_STORAGE",
            Self::MinWithdraw => "E_MIN_WITHDRAW",
            Self::Batch => "E_BATCH",
            Self::SelfFill => "E_SELF_FILL",
            Self::Gas => "E_GAS",
            Self::Grace => "E_GRACE",
            Self::Paused => "E_PAUSED",
            Self::NotGuardian => "E_NOT_GUARDIAN",
        }
    }

    /// A short English reason for explorers and logs. User-facing copy lives off-chain.
    #[must_use]
    pub const fn reason(self) -> &'static str {
        match self {
            Self::Keys => "pack holds a verifier public key",
            Self::PredAuthOff => "predecessor authentication is disabled for the pack",
            Self::VerifierLocked => "pack is locked by the verifier",
            Self::Contents => "pack balances differ from the committed contents",
            Self::Terms => "terms differ from the offer or are out of range",
            Self::Pending => "a transfer or decision on this token is in flight",
            Self::Expired => "offer or term has passed",
            Self::Holder => "caller is not the direct owner of the required token",
            Self::State => "pack state refuses this call",
            Self::Cap => "amount is above the per-pack cap",
            Self::NotVerifier => "predecessor is not the verifier",
            Self::NotPack => "predecessor is not a pack of this registry",
            Self::NotRegistry => "predecessor is not the pack's registry",
            Self::Token => "token is not allowed here",
            Self::Amount => "amount is zero or wrong",
            Self::Msg => "message could not be parsed",
            Self::Storage => "attached deposit does not cover storage",
            Self::MinWithdraw => "withdrawal is below the bridge minimum",
            Self::Batch => "too many or repeated tokens",
            Self::SelfFill => "taker is the maker",
            Self::Gas => "prepaid gas cannot cover the chain",
            Self::Grace => "grace window is active",
            Self::Paused => "new positions are paused",
            Self::NotGuardian => "caller is not the guardian",
        }
    }
}

impl fmt::Display for MosaecError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code(), self.reason())
    }
}

impl FunctionError for MosaecError {
    fn panic(&self) -> ! {
        near_sdk::env::panic_str(&self.to_string())
    }
}

/// Returns `Ok(())` when `condition` holds, otherwise `Err(error)`.
///
/// # Errors
/// Returns `error` when `condition` is false.
pub const fn ensure(condition: bool, error: MosaecError) -> MosaecResult<()> {
    if condition { Ok(()) } else { Err(error) }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::MosaecError;

    #[test]
    fn codes_are_unique_and_prefixed() {
        let codes: HashSet<_> = MosaecError::ALL.iter().map(|e| e.code()).collect();
        assert_eq!(codes.len(), MosaecError::ALL.len());
        assert!(codes.iter().all(|c| c.starts_with("E_")));
    }

    #[test]
    fn display_starts_with_code() {
        assert_eq!(
            MosaecError::Cap.to_string(),
            "E_CAP: amount is above the per-pack cap"
        );
    }
}
