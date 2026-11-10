//! The pack's own view of its lifecycle and every transition it accepts. Pure functions only: the
//! contract reads the block time and predecessor, passes them in, and stores what comes back.
//!
//! The pack enforces its encumbrance without trusting the registry's clock: a registry command can
//! drop the encumbrance only after the exercise deadline the pack computes itself.

use std::collections::HashSet;

use mosaec_shared::constants::DISRUPTING_PAUSE_KEYS;
use mosaec_shared::error::ensure;
use mosaec_shared::terms::{check_exercise_time, check_expire_time, in_disruption_window};
use mosaec_shared::types::Encumbrance;
use mosaec_shared::{MosaecError, MosaecResult};
use near_sdk::json_types::U128;
use near_sdk::{AccountId, near};

/// Lifecycle as the pack enforces it.
#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, PartialEq, Eq)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum Phase {
    /// No live Ticket. Outbound value moves only on the registry's command.
    Free,
    /// A Ticket is live; the recorded contents are frozen.
    Written {
        /// What the Ticket may take, for what, until when.
        encumbrance: Encumbrance,
        /// Block time a disruption was recorded inside the window, if any.
        disrupted_at_ns: Option<u64>,
    },
    /// An exercise was decided; the recorded contents are owed to `owed_to`.
    Releasing {
        /// The contents and terms that were exercised.
        encumbrance: Encumbrance,
        /// The Ticket holder at decision time.
        owed_to: AccountId,
    },
}

impl Phase {
    /// Stores the registry's encumbrance. Repeating the same encumbrance is a no-op, so the
    /// registry's `sync_encumbrance` retry is safe.
    ///
    /// # Errors
    /// `E_STATE` unless the pack is `Free` or already holds this exact encumbrance.
    pub fn encumber(self, encumbrance: Encumbrance) -> MosaecResult<Self> {
        match self {
            Self::Free => Ok(Self::Written {
                encumbrance,
                disrupted_at_ns: None,
            }),
            Self::Written {
                encumbrance: ref held,
                ..
            } if *held == encumbrance => Ok(self),
            _ => Err(MosaecError::State),
        }
    }

    /// Drops an expired encumbrance. A `Free` pack stays `Free`, so retries are safe.
    ///
    /// # Errors
    /// `E_STATE` while releasing or at or before `T`; `E_GRACE` during a recorded grace window.
    pub fn unencumber(self, now_ns: u64) -> MosaecResult<Self> {
        match self {
            Self::Free => Ok(Self::Free),
            Self::Written {
                encumbrance,
                disrupted_at_ns,
            } => {
                check_expire_time(now_ns, encumbrance.expires_at_ns, disrupted_at_ns)?;
                Ok(Self::Free)
            }
            Self::Releasing { .. } => Err(MosaecError::State),
        }
    }

    /// Checks an incoming exercise payment and returns the repayment amount it carries.
    ///
    /// # Errors
    /// `E_STATE` unless `Written`; `E_TOKEN` or `E_AMOUNT` unless the payment is exactly `K` in
    /// the repayment token; `E_EXPIRED` after the exercise deadline.
    pub fn check_exercise(
        &self,
        token_ids: &[String],
        amounts: &[U128],
        now_ns: u64,
    ) -> MosaecResult<U128> {
        let Self::Written {
            encumbrance,
            disrupted_at_ns,
        } = self
        else {
            return Err(MosaecError::State);
        };
        let ([token_id], [amount]) = (token_ids, amounts) else {
            return Err(MosaecError::Batch);
        };
        ensure(*token_id == encumbrance.k_token, MosaecError::Token)?;
        ensure(*amount == encumbrance.k_amount, MosaecError::Amount)?;
        check_exercise_time(now_ns, encumbrance.expires_at_ns, *disrupted_at_ns)?;
        Ok(*amount)
    }

    /// Records the exercise decision.
    ///
    /// # Errors
    /// `E_STATE` unless `Written`.
    pub fn decide_exercise(self, owed_to: AccountId) -> MosaecResult<Self> {
        match self {
            Self::Written { encumbrance, .. } => Ok(Self::Releasing {
                encumbrance,
                owed_to,
            }),
            _ => Err(MosaecError::State),
        }
    }

    /// Completes a delivered release.
    ///
    /// # Errors
    /// `E_STATE` unless `Releasing`.
    pub fn finish_release(self) -> MosaecResult<Self> {
        match self {
            Self::Releasing { .. } => Ok(Self::Free),
            _ => Err(MosaecError::State),
        }
    }

    /// Checks that a disruption may be recorded at `now_ns`.
    ///
    /// # Errors
    /// `E_STATE` unless `Written` with no record yet and `now_ns` inside `[T - GRACE, T]`.
    pub fn check_disruption_window(&self, now_ns: u64) -> MosaecResult<()> {
        match self {
            Self::Written {
                encumbrance,
                disrupted_at_ns: None,
            } if in_disruption_window(now_ns, encumbrance.expires_at_ns) => Ok(()),
            _ => Err(MosaecError::State),
        }
    }

    /// Stores a disruption observed at `now_ns`.
    ///
    /// # Errors
    /// As [`Phase::check_disruption_window`].
    pub fn record_disruption(self, now_ns: u64) -> MosaecResult<Self> {
        self.check_disruption_window(now_ns)?;
        match self {
            Self::Written { encumbrance, .. } => Ok(Self::Written {
                encumbrance,
                disrupted_at_ns: Some(now_ns),
            }),
            _ => Err(MosaecError::State),
        }
    }

    /// Checks that the registry may move value out on the Title holder's command.
    ///
    /// # Errors
    /// `E_STATE` unless `Free`.
    pub const fn check_withdraw(&self) -> MosaecResult<()> {
        ensure(matches!(self, Self::Free), MosaecError::State)
    }
}

/// True when the verifier state stops an exercise from reaching the pack.
#[must_use]
pub fn is_disruption(paused: Option<&HashSet<String>>, locked: bool) -> bool {
    locked || paused.is_some_and(|keys| DISRUPTING_PAUSE_KEYS.iter().any(|k| keys.contains(*k)))
}

#[cfg(test)]
mod tests {
    use mosaec_shared::constants::{CapProfile, DAY_NS, GRACE_NS, USDC, ZEC};
    use mosaec_shared::contents::{ContentLine, Contents};

    use super::*;

    const T: u64 = 500 * DAY_NS;
    const K: u128 = 107_500_000;

    fn encumbrance() -> Encumbrance {
        Encumbrance {
            k_token: USDC.into(),
            k_amount: U128(K),
            expires_at_ns: T,
            contents: Contents::new(
                vec![ContentLine {
                    token_id: ZEC.into(),
                    amount: U128(50_000_000),
                }],
                CapProfile::Production,
            )
            .unwrap(),
        }
    }

    fn written(disrupted_at_ns: Option<u64>) -> Phase {
        Phase::Written {
            encumbrance: encumbrance(),
            disrupted_at_ns,
        }
    }

    fn alice() -> AccountId {
        "alice.near".parse().unwrap()
    }

    #[test]
    fn encumber_is_idempotent_and_refuses_a_second_set() {
        let phase = Phase::Free.encumber(encumbrance()).unwrap();
        assert_eq!(phase.clone().encumber(encumbrance()), Ok(phase.clone()));
        let mut other = encumbrance();
        other.k_amount = U128(1);
        assert_eq!(phase.encumber(other), Err(MosaecError::State));
    }

    #[test]
    fn early_unencumber_refused() {
        assert_eq!(written(None).unencumber(T), Err(MosaecError::State));
        assert_eq!(written(None).unencumber(T + 1), Ok(Phase::Free));
        assert_eq!(Phase::Free.unencumber(0), Ok(Phase::Free));
    }

    #[test]
    fn grace_blocks_unencumber() {
        let phase = written(Some(T - 1));
        assert_eq!(phase.clone().unencumber(T + 1), Err(MosaecError::Grace));
        assert_eq!(phase.unencumber(T + GRACE_NS + 1), Ok(Phase::Free));
    }

    #[test]
    fn releasing_pack_cannot_be_unencumbered_or_withdrawn() {
        let releasing = written(None).decide_exercise(alice()).unwrap();
        assert_eq!(releasing.clone().unencumber(T * 2), Err(MosaecError::State));
        assert_eq!(releasing.check_withdraw(), Err(MosaecError::State));
    }

    #[test]
    fn exercise_requires_exact_k_in_time() {
        let phase = written(None);
        let usdc = vec![USDC.to_string()];
        assert_eq!(phase.check_exercise(&usdc, &[U128(K)], T), Ok(U128(K)));
        assert_eq!(
            phase.check_exercise(&usdc, &[U128(K - 1)], T),
            Err(MosaecError::Amount)
        );
        assert_eq!(
            phase.check_exercise(&usdc, &[U128(K + 1)], T),
            Err(MosaecError::Amount)
        );
        assert_eq!(
            phase.check_exercise(&[ZEC.to_string()], &[U128(K)], T),
            Err(MosaecError::Token)
        );
        assert_eq!(
            phase.check_exercise(&usdc, &[U128(K)], T + 1),
            Err(MosaecError::Expired)
        );
        assert_eq!(
            phase.check_exercise(&[USDC.into(), ZEC.into()], &[U128(K), U128(1)], T),
            Err(MosaecError::Batch)
        );
        assert_eq!(
            Phase::Free.check_exercise(&usdc, &[U128(K)], T),
            Err(MosaecError::State)
        );
    }

    #[test]
    fn grace_keeps_exercise_open() {
        let phase = written(Some(T - GRACE_NS));
        let usdc = vec![USDC.to_string()];
        assert!(
            phase
                .check_exercise(&usdc, &[U128(K)], T + GRACE_NS)
                .is_ok()
        );
    }

    #[test]
    fn release_cycle_returns_to_free() {
        let phase = written(None).decide_exercise(alice()).unwrap();
        assert!(matches!(phase, Phase::Releasing { .. }));
        assert_eq!(phase.finish_release(), Ok(Phase::Free));
        assert_eq!(Phase::Free.finish_release(), Err(MosaecError::State));
    }

    #[test]
    fn disruption_only_inside_window_and_once() {
        assert_eq!(
            written(None).record_disruption(T - GRACE_NS - 1),
            Err(MosaecError::State)
        );
        assert_eq!(
            written(None).record_disruption(T + 1),
            Err(MosaecError::State)
        );
        let recorded = written(None).record_disruption(T - 10).unwrap();
        assert_eq!(recorded, written(Some(T - 10)));
        assert_eq!(recorded.record_disruption(T - 5), Err(MosaecError::State));
        assert_eq!(Phase::Free.record_disruption(T), Err(MosaecError::State));
    }

    #[test]
    fn disruption_detection() {
        let keys = |k: &[&str]| k.iter().map(|s| (*s).to_string()).collect::<HashSet<_>>();
        assert!(is_disruption(None, true));
        assert!(!is_disruption(None, false));
        assert!(is_disruption(Some(&keys(&["ALL"])), false));
        assert!(is_disruption(Some(&keys(&["mt_transfer"])), false));
        assert!(is_disruption(Some(&keys(&["intents"])), false));
        assert!(!is_disruption(Some(&keys(&["ft_withdraw"])), false));
    }

    #[test]
    fn withdraw_only_when_free() {
        assert!(Phase::Free.check_withdraw().is_ok());
        assert_eq!(written(None).check_withdraw(), Err(MosaecError::State));
    }
}
