//! The contents vector: which collateral a pack commits at offer, freezes at fill and releases on
//! exercise. Always canonical (sorted by token id, no repeats, no zero lines), so its hash is a
//! stable commitment that the taker can recompute off-chain.

use near_sdk::json_types::U128;
use near_sdk::{env, near};

use crate::constants::{BATCH_MAX_TOKENS, Network, TokenRole, token_rule};
use crate::error::{MosaecError, MosaecResult, ensure};

/// One token and amount in a pack's contents.
#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct ContentLine {
    /// Verifier token id.
    pub token_id: String,
    /// Amount in the token's smallest unit.
    pub amount: U128,
}

/// A validated, canonical contents vector.
#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, PartialEq, Eq)]
#[serde(transparent)]
pub struct Contents(Vec<ContentLine>);

impl Contents {
    /// Validates `lines` as pawn collateral under `network` and puts them in canonical order.
    ///
    /// # Errors
    /// `E_BATCH` for an empty set, more than the verifier batch limit, or a repeated token;
    /// `E_TOKEN` for a token that is not allowlisted collateral; `E_AMOUNT` for a zero line;
    /// `E_CAP` for an amount above the token's per-pack cap.
    pub fn new(mut lines: Vec<ContentLine>, network: Network) -> MosaecResult<Self> {
        ensure(
            !lines.is_empty() && lines.len() <= BATCH_MAX_TOKENS,
            MosaecError::Batch,
        )?;
        lines.sort();
        ensure(
            lines.windows(2).all(|w| w[0].token_id != w[1].token_id),
            MosaecError::Batch,
        )?;
        for line in &lines {
            check_line(line, network)?;
        }
        Ok(Self(lines))
    }

    /// Pairs `token_ids` with the balances the verifier returned for them, in the same order.
    ///
    /// # Errors
    /// `E_CONTENTS` when the two lists differ in length; otherwise as [`Contents::new`].
    pub fn from_balances(
        token_ids: Vec<String>,
        balances: &[U128],
        network: Network,
    ) -> MosaecResult<Self> {
        ensure(token_ids.len() == balances.len(), MosaecError::Contents)?;
        let lines = token_ids
            .into_iter()
            .zip(balances)
            .map(|(token_id, amount)| ContentLine {
                token_id,
                amount: *amount,
            })
            .collect();
        Self::new(lines, network)
    }

    /// The lines in canonical order.
    #[must_use]
    pub fn lines(&self) -> &[ContentLine] {
        &self.0
    }

    /// Token ids in canonical order, as `mt_batch_balance_of` and `mt_batch_transfer` take them.
    #[must_use]
    pub fn token_ids(&self) -> Vec<String> {
        self.0.iter().map(|l| l.token_id.clone()).collect()
    }

    /// Amounts in canonical order.
    #[must_use]
    pub fn amounts(&self) -> Vec<U128> {
        self.0.iter().map(|l| l.amount).collect()
    }

    /// Hex sha256 over the canonical encoding: line count as u32 LE, then per line the token id
    /// length as u32 LE, the token id bytes and the amount as u128 LE. This equals the borsh
    /// encoding of the lines, so off-chain code can reproduce it with any borsh library.
    #[must_use]
    pub fn hash_hex(&self) -> String {
        let mut bytes = Vec::new();
        push_len(&mut bytes, self.0.len());
        for line in &self.0 {
            push_len(&mut bytes, line.token_id.len());
            bytes.extend_from_slice(line.token_id.as_bytes());
            bytes.extend_from_slice(&line.amount.0.to_le_bytes());
        }
        hex_lower(&env::sha256_array(&bytes))
    }

    /// True when every line is still fully held according to `balances` (same order as
    /// [`Contents::token_ids`]). Extra balance of a listed token, such as dust, is allowed.
    #[must_use]
    pub fn covered_by(&self, balances: &[U128]) -> bool {
        balances.len() == self.0.len()
            && self
                .0
                .iter()
                .zip(balances)
                .all(|(line, held)| held.0 >= line.amount.0)
    }
}

fn check_line(line: &ContentLine, network: Network) -> MosaecResult<()> {
    let rule = token_rule(network, &line.token_id).ok_or(MosaecError::Token)?;
    ensure(rule.role == TokenRole::Collateral, MosaecError::Token)?;
    ensure(line.amount.0 > 0, MosaecError::Amount)?;
    ensure(line.amount.0 <= rule.cap, MosaecError::Cap)
}

/// Lengths here are bounded by `BATCH_MAX_TOKENS` and the verifier's 127-byte token id limit.
fn push_len(out: &mut Vec<u8>, len: usize) {
    let len = u32::try_from(len).unwrap_or(u32::MAX);
    out.extend_from_slice(&len.to_le_bytes());
}

fn hex_lower(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(char::from(DIGITS[usize::from(b >> 4)]));
        out.push(char::from(DIGITS[usize::from(b & 0x0f)]));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants::{BTC, SOL, USDC, ZEC};

    fn line(token: &str, amount: u128) -> ContentLine {
        ContentLine {
            token_id: token.into(),
            amount: U128(amount),
        }
    }

    #[test]
    fn order_does_not_change_the_hash() {
        let a = Contents::new(vec![line(ZEC, 5), line(BTC, 7)], Network::Mainnet).unwrap();
        let b = Contents::new(vec![line(BTC, 7), line(ZEC, 5)], Network::Mainnet).unwrap();
        assert_eq!(a, b);
        assert_eq!(a.hash_hex(), b.hash_hex());
        assert_eq!(a.hash_hex().len(), 64);
    }

    #[test]
    fn hash_equals_borsh_encoding() {
        let c = Contents::new(vec![line(ZEC, 5), line(BTC, 7)], Network::Mainnet).unwrap();
        let borsh = near_sdk::borsh::to_vec(c.lines()).unwrap();
        assert_eq!(c.hash_hex(), hex_lower(&env::sha256_array(&borsh)));
    }

    #[test]
    fn amount_changes_the_hash() {
        let a = Contents::new(vec![line(ZEC, 5)], Network::Mainnet).unwrap();
        let b = Contents::new(vec![line(ZEC, 6)], Network::Mainnet).unwrap();
        assert_ne!(a.hash_hex(), b.hash_hex());
    }

    #[test]
    fn refuses_bad_sets() {
        let p = Network::Mainnet;
        assert_eq!(Contents::new(vec![], p), Err(MosaecError::Batch));
        assert_eq!(
            Contents::new(vec![line(ZEC, 1), line(ZEC, 2)], p),
            Err(MosaecError::Batch)
        );
        assert_eq!(
            Contents::new(vec![line(ZEC, 0)], p),
            Err(MosaecError::Amount)
        );
        assert_eq!(
            Contents::new(vec![line("nep141:wrap.near", 1)], p),
            Err(MosaecError::Token)
        );
        assert_eq!(
            Contents::new(vec![line(USDC, 1)], p),
            Err(MosaecError::Token)
        );
        let eleven = (0..11).map(|i| line(&format!("nep141:t{i}"), 1)).collect();
        assert_eq!(Contents::new(eleven, p), Err(MosaecError::Batch));
    }

    #[test]
    fn caps_and_ids_follow_the_network() {
        let one_zec = vec![line(ZEC, 100_000_000)];
        assert!(Contents::new(one_zec.clone(), Network::Mainnet).is_ok());
        assert_eq!(
            Contents::new(one_zec, Network::Testnet),
            Err(MosaecError::Token)
        );
        let test_zec = vec![line(crate::constants::TESTNET_ZEC, 100_000_000)];
        assert!(Contents::new(test_zec, Network::Testnet).is_ok());
        assert_eq!(
            Contents::new(vec![line(SOL, 5_000_000_001)], Network::Mainnet),
            Err(MosaecError::Cap)
        );
    }

    #[test]
    fn from_balances_pairs_in_order() {
        let c = Contents::from_balances(
            vec![ZEC.into(), BTC.into()],
            &[U128(5), U128(7)],
            Network::Mainnet,
        )
        .unwrap();
        assert_eq!(c.lines()[0], line(BTC, 7));
        assert_eq!(
            Contents::from_balances(vec![ZEC.into()], &[], Network::Mainnet),
            Err(MosaecError::Contents)
        );
    }

    #[test]
    fn coverage_allows_dust_and_refuses_shortfall() {
        let c = Contents::new(vec![line(BTC, 7), line(ZEC, 5)], Network::Mainnet).unwrap();
        assert!(c.covered_by(&[U128(7), U128(6)]));
        assert!(!c.covered_by(&[U128(7), U128(4)]));
        assert!(!c.covered_by(&[U128(7)]));
    }
}
