//! Domain types stored by the contracts and passed between them.

use near_sdk::json_types::U128;
use near_sdk::{AccountId, near};

use crate::contents::Contents;

/// Which of the two rights an NFT in the collection carries.
#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NftKind {
    /// Owns the pack and everything in it, subject to a live Ticket.
    Title,
    /// May take the recorded contents by paying `K` before `T`.
    Ticket,
}

/// Repayment terms a pawn is written under.
#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Terms {
    /// Verifier token id the repayment is paid in.
    pub k_token: String,
    /// Repayment amount `K`, in the token's smallest unit.
    pub k_amount: U128,
    /// Term length; `T` is the fill time plus this value.
    pub term_ns: u64,
}

/// What the pack enforces once a pawn is written. Sent by the registry in `encumber`.
#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Encumbrance {
    /// Repayment token.
    pub k_token: String,
    /// Repayment amount `K`.
    pub k_amount: U128,
    /// Deadline `T`, in block-timestamp nanoseconds.
    pub expires_at_ns: u64,
    /// The exact balances frozen at fill and released on exercise.
    pub contents: Contents,
}

/// A pack's lifecycle as the registry records it.
#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PackState {
    /// One holder owns the Title; deposits and withdrawals are open.
    Free,
    /// An offer is open; contents are committed and withdrawals are refused.
    Offered,
    /// A pawn is live: the lender holds the Title, the borrower holds the Ticket.
    Written {
        /// Deadline `T`.
        expires_at_ns: u64,
        /// Block time a verifier pause or lock was recorded inside `[T - GRACE, T]`.
        disrupted_at_ns: Option<u64>,
    },
    /// An exercise was decided; the recorded contents are owed to `owed_to` until delivered.
    Releasing {
        /// The Ticket holder at decision time.
        owed_to: AccountId,
    },
}

impl PackState {
    /// Short lowercase name used in events and views.
    #[must_use]
    pub const fn name(&self) -> &'static str {
        match self {
            Self::Free => "free",
            Self::Offered => "offered",
            Self::Written { .. } => "written",
            Self::Releasing { .. } => "releasing",
        }
    }
}

/// Where a withdrawal from a `Free` pack goes.
#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Destination {
    /// Another account inside the verifier.
    Verifier {
        /// Receiving verifier account.
        account_id: AccountId,
    },
    /// The token's home chain, through the bridge token's withdraw memo.
    HomeChain {
        /// Address on the home chain, passed verbatim to the bridge.
        address: String,
    },
}

/// Body of the `msg` field a taker sends with `mt_transfer_call` to fill an offer.
#[near(serializers = [json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FillMsg {
    /// Pack being filled.
    pub pack: AccountId,
    /// Terms the taker agreed to.
    pub terms: Terms,
    /// Hex sha256 of the contents the taker saw.
    pub contents_hash: String,
}

/// Messages a contract accepts in `mt_on_transfer`.
#[near(serializers = [json])]
#[derive(Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TransferMsg {
    /// Registry: pay the principal and take the Title.
    Fill(FillMsg),
    /// Pack: pay `K` and take the recorded contents.
    Exercise,
}

#[cfg(test)]
mod tests {
    use near_sdk::serde_json::{self, json};

    use super::*;

    #[test]
    fn exercise_msg_is_a_bare_string() {
        let msg: TransferMsg = serde_json::from_str("\"exercise\"").unwrap();
        assert_eq!(msg, TransferMsg::Exercise);
    }

    #[test]
    fn fill_msg_round_trips() {
        let raw = json!({ "fill": {
            "pack": "1.v0.mosaec.near",
            "terms": { "k_token": "nep141:usdc", "k_amount": "1075000000", "term_ns": 7_776_000_000_000_000_u64 },
            "contents_hash": "ab"
        }});
        let msg: TransferMsg = serde_json::from_value(raw).unwrap();
        let TransferMsg::Fill(fill) = msg else {
            panic!("expected fill")
        };
        assert_eq!(fill.terms.k_amount, U128(1_075_000_000));
    }

    #[test]
    fn destination_is_tagged() {
        let d: Destination =
            serde_json::from_value(json!({ "kind": "home_chain", "address": "t1abc" })).unwrap();
        assert_eq!(
            d,
            Destination::HomeChain {
                address: "t1abc".into()
            }
        );
    }
}
