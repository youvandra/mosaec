//! Rules for terms and the clock: what an offer may ask for, when `T` falls, and when the grace
//! window keeps an exercise open. Pure functions of their inputs; callers pass the block time.

use near_sdk::json_types::U128;

use crate::constants::{GRACE_NS, Network, TokenRole, token_rule};
use crate::error::{MosaecError, MosaecResult, ensure};
use crate::types::Terms;

/// Checks a settlement amount (principal or repayment) under `network`.
///
/// # Errors
/// `E_TOKEN` unless `token_id` is the settlement token, `E_AMOUNT` for zero, `E_CAP` above the cap.
pub fn check_settlement(token_id: &str, amount: U128, network: Network) -> MosaecResult<()> {
    let rule = token_rule(network, token_id).ok_or(MosaecError::Token)?;
    ensure(rule.role == TokenRole::Settlement, MosaecError::Token)?;
    ensure(amount.0 > 0, MosaecError::Amount)?;
    ensure(amount.0 <= rule.cap, MosaecError::Cap)
}

/// Checks the terms and the principal of a new offer.
///
/// # Errors
/// As [`check_settlement`] for both amounts; `E_TERMS` when the principal is in a different token
/// from the repayment, the repayment is below the principal, the term is outside
/// the network's term bounds, or the offer has already expired at `now_ns`.
pub fn check_offer(
    terms: &Terms,
    pay_token: &str,
    price: U128,
    offer_expires_at_ns: u64,
    now_ns: u64,
    network: Network,
) -> MosaecResult<()> {
    check_settlement(&terms.k_token, terms.k_amount, network)?;
    check_settlement(pay_token, price, network)?;
    ensure(pay_token == terms.k_token, MosaecError::Terms)?;
    ensure(terms.k_amount.0 >= price.0, MosaecError::Terms)?;
    let (shortest, longest) = network.term_bounds();
    ensure(
        (shortest..=longest).contains(&terms.term_ns),
        MosaecError::Terms,
    )?;
    ensure(offer_expires_at_ns > now_ns, MosaecError::Expired)
}

/// `T` for a pawn filled at `filled_at_ns`.
///
/// # Errors
/// `E_TERMS` if the sum overflows.
pub fn expiry(filled_at_ns: u64, term_ns: u64) -> MosaecResult<u64> {
    filled_at_ns.checked_add(term_ns).ok_or(MosaecError::Terms)
}

/// True while `now_ns` is inside `[T - GRACE_NS, T]`, the window in which a disruption counts.
#[must_use]
pub const fn in_disruption_window(now_ns: u64, expires_at_ns: u64) -> bool {
    now_ns >= expires_at_ns.saturating_sub(GRACE_NS) && now_ns <= expires_at_ns
}

/// Last block time an exercise is accepted: `T`, or `T + GRACE_NS` when a disruption was recorded
/// inside the window.
#[must_use]
pub const fn exercise_deadline(expires_at_ns: u64, disrupted_at_ns: Option<u64>) -> u64 {
    match disrupted_at_ns {
        Some(at) if in_disruption_window(at, expires_at_ns) => {
            expires_at_ns.saturating_add(GRACE_NS)
        }
        _ => expires_at_ns,
    }
}

/// Checks that an exercise at `now_ns` is in time.
///
/// # Errors
/// `E_EXPIRED` after the exercise deadline.
pub const fn check_exercise_time(
    now_ns: u64,
    expires_at_ns: u64,
    disrupted_at_ns: Option<u64>,
) -> MosaecResult<()> {
    ensure(
        now_ns <= exercise_deadline(expires_at_ns, disrupted_at_ns),
        MosaecError::Expired,
    )
}

/// Checks that `expire` may run at `now_ns`.
///
/// # Errors
/// `E_STATE` at or before `T`; `E_GRACE` after `T` while a recorded disruption keeps the
/// exercise open.
pub const fn check_expire_time(
    now_ns: u64,
    expires_at_ns: u64,
    disrupted_at_ns: Option<u64>,
) -> MosaecResult<()> {
    if now_ns <= expires_at_ns {
        return Err(MosaecError::State);
    }
    ensure(
        now_ns > exercise_deadline(expires_at_ns, disrupted_at_ns),
        MosaecError::Grace,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants::{DAY_NS, DEFAULT_TERM_NS, USDC, ZEC};

    const T: u64 = 1_000 * DAY_NS;

    fn terms(k: u128, term_ns: u64) -> Terms {
        Terms {
            k_token: USDC.into(),
            k_amount: U128(k),
            term_ns,
        }
    }

    #[test]
    fn offer_checks() {
        let p = Network::Mainnet;
        let ok = terms(107_500_000, DEFAULT_TERM_NS);
        assert!(check_offer(&ok, USDC, U128(100_000_000), 10, 5, p).is_ok());
        assert_eq!(
            check_offer(&ok, USDC, U128(200_000_000), 10, 5, p),
            Err(MosaecError::Terms)
        );
        assert_eq!(
            check_offer(&terms(1, DAY_NS), USDC, U128(1), 10, 5, p),
            Err(MosaecError::Terms)
        );
        assert_eq!(
            check_offer(&ok, USDC, U128(100_000_000), 5, 5, p),
            Err(MosaecError::Expired)
        );
        assert_eq!(
            check_offer(&ok, ZEC, U128(1), 10, 5, p),
            Err(MosaecError::Token)
        );
        assert_eq!(
            check_offer(
                &terms(1_000_000_001, DEFAULT_TERM_NS),
                USDC,
                U128(1),
                10,
                5,
                p
            ),
            Err(MosaecError::Cap)
        );
    }

    #[test]
    fn term_bounds_follow_the_network() {
        let ten_minutes = terms(1, 10 * crate::constants::MINUTE_NS);
        let testnet_usdc = crate::constants::TESTNET_USDC;
        let mut testnet_terms = ten_minutes.clone();
        testnet_terms.k_token = testnet_usdc.into();
        assert!(
            check_offer(
                &testnet_terms,
                testnet_usdc,
                U128(1),
                10,
                5,
                Network::Testnet
            )
            .is_ok()
        );
        assert_eq!(
            check_offer(&ten_minutes, USDC, U128(1), 10, 5, Network::Mainnet),
            Err(MosaecError::Terms)
        );
        assert_eq!(
            check_offer(&ten_minutes, USDC, U128(1), 10, 5, Network::Testnet),
            Err(MosaecError::Token)
        );
    }

    #[test]
    fn expiry_overflow_refused() {
        assert_eq!(expiry(u64::MAX, 1), Err(MosaecError::Terms));
        assert_eq!(expiry(10, DEFAULT_TERM_NS), Ok(10 + DEFAULT_TERM_NS));
    }

    #[test]
    fn no_disruption_means_t_is_final() {
        assert!(check_exercise_time(T, T, None).is_ok());
        assert_eq!(
            check_exercise_time(T + 1, T, None),
            Err(MosaecError::Expired)
        );
        assert_eq!(check_expire_time(T, T, None), Err(MosaecError::State));
        assert!(check_expire_time(T + 1, T, None).is_ok());
    }

    #[test]
    fn disruption_in_window_extends_by_grace() {
        let at = Some(T - GRACE_NS);
        assert!(check_exercise_time(T + GRACE_NS, T, at).is_ok());
        assert_eq!(
            check_exercise_time(T + GRACE_NS + 1, T, at),
            Err(MosaecError::Expired)
        );
        assert_eq!(check_expire_time(T + 1, T, at), Err(MosaecError::Grace));
        assert!(check_expire_time(T + GRACE_NS + 1, T, at).is_ok());
    }

    #[test]
    fn disruption_outside_window_does_not_count() {
        let early = Some(T - GRACE_NS - 1);
        assert_eq!(exercise_deadline(T, early), T);
        assert_eq!(exercise_deadline(T, Some(T + 1)), T);
    }
}
