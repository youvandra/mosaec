//! A pack's position as the registry records it, and every transition the registry accepts.
//! Pure: callers pass the block time, the caller and the verifier reads; nothing here touches
//! storage or schedules promises.

use std::collections::HashSet;

use mosaec_shared::constants::CapProfile;
use mosaec_shared::contents::Contents;
use mosaec_shared::error::ensure;
use mosaec_shared::terms::{check_offer, expiry};
use mosaec_shared::types::{Encumbrance, FillMsg, Terms};
use mosaec_shared::{MosaecError, MosaecResult};
use near_sdk::json_types::U128;
use near_sdk::{AccountId, near};

/// An open offer: the maker sells the Title for `price` and keeps a Ticket on `terms`.
#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Offer {
    pub maker_id: AccountId,
    pub terms: Terms,
    pub pay_token: String,
    pub price: U128,
    pub open_until_ns: u64,
    pub contents: Contents,
    pub contents_hash: String,
}

/// Principal owed to a maker after a decided fill.
#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Payout {
    pub maker_id: AccountId,
    pub token_id: String,
    pub amount: U128,
    pub in_flight: bool,
}

/// Registry-side lifecycle of one pack.
#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, PartialEq, Eq)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum Stage {
    Free,
    Offered(Offer),
    Written {
        encumbrance: Encumbrance,
        ticket_id: String,
        /// True once the pack confirmed it holds this encumbrance.
        synced: bool,
    },
}

/// Everything the registry keeps about one pack.
#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Position {
    pub index: u64,
    pub title_id: String,
    /// Pawn rounds written so far; numbers the next Ticket.
    pub rounds: u32,
    pub stage: Stage,
    pub payout: Option<Payout>,
    /// True while a registry-to-pack command for this pack is in flight.
    pub command_in_flight: bool,
}

/// What the verifier reported about a pack at fill time.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FillReads {
    pub public_keys: Option<HashSet<String>>,
    pub auth_by_predecessor: Option<bool>,
    pub locked: Option<bool>,
    pub balances: Option<Vec<U128>>,
}

/// The result of a decided fill.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Filled {
    pub position: Position,
    pub ticket_id: String,
    pub encumbrance: Encumbrance,
    pub maker_id: AccountId,
}

impl Position {
    #[must_use]
    pub fn new(index: u64, title_id: String) -> Self {
        Self {
            index,
            title_id,
            rounds: 0,
            stage: Stage::Free,
            payout: None,
            command_in_flight: false,
        }
    }

    /// The open offer, if any.
    #[must_use]
    pub const fn offer(&self) -> Option<&Offer> {
        match &self.stage {
            Stage::Offered(offer) => Some(offer),
            _ => None,
        }
    }

    /// Checks a new offer's inputs before the balance read.
    ///
    /// # Errors
    /// `E_STATE` unless `Free`; `E_PENDING` while a previous maker's payout is undelivered, so a
    /// new fill can never overwrite it; otherwise as `check_offer`.
    pub fn check_new_offer(
        &self,
        terms: &Terms,
        pay_token: &str,
        price: U128,
        offer_expires_at_ns: u64,
        now_ns: u64,
        profile: CapProfile,
    ) -> MosaecResult<()> {
        ensure(matches!(self.stage, Stage::Free), MosaecError::State)?;
        ensure(self.payout.is_none(), MosaecError::Pending)?;
        check_offer(
            terms,
            pay_token,
            price,
            offer_expires_at_ns,
            now_ns,
            profile,
        )
    }

    /// Opens the offer once the balances are known.
    ///
    /// # Errors
    /// `E_STATE` unless `Free`; `E_PENDING` while a payout is undelivered.
    pub fn open_offer(mut self, offer: Offer) -> MosaecResult<Self> {
        ensure(matches!(self.stage, Stage::Free), MosaecError::State)?;
        ensure(self.payout.is_none(), MosaecError::Pending)?;
        self.stage = Stage::Offered(offer);
        Ok(self)
    }

    /// Closes an open offer. A `Free` position stays `Free`.
    ///
    /// # Errors
    /// `E_STATE` while `Written`.
    pub fn cancel_offer(mut self) -> MosaecResult<Self> {
        match self.stage {
            Stage::Offered(_) | Stage::Free => {
                self.stage = Stage::Free;
                Ok(self)
            }
            Stage::Written { .. } => Err(MosaecError::State),
        }
    }

    /// Checks a fill against the open offer before the verifier reads.
    ///
    /// # Errors
    /// `E_STATE` without an open offer; `E_EXPIRED` past the offer's expiry; `E_SELF_FILL` when the
    /// taker is the maker; `E_TOKEN` or `E_AMOUNT` unless the payment is exactly the price;
    /// `E_TERMS` or `E_CONTENTS` when the message differs from the offer.
    pub fn check_fill(
        &self,
        taker_id: &AccountId,
        pay_token: &str,
        paid: U128,
        msg: &FillMsg,
        now_ns: u64,
    ) -> MosaecResult<&Offer> {
        let offer = self.offer().ok_or(MosaecError::State)?;
        ensure(now_ns <= offer.open_until_ns, MosaecError::Expired)?;
        ensure(*taker_id != offer.maker_id, MosaecError::SelfFill)?;
        ensure(pay_token == offer.pay_token, MosaecError::Token)?;
        ensure(paid == offer.price, MosaecError::Amount)?;
        ensure(msg.terms == offer.terms, MosaecError::Terms)?;
        ensure(
            msg.contents_hash == offer.contents_hash,
            MosaecError::Contents,
        )?;
        Ok(offer)
    }

    /// Decides a fill from the verifier reads.
    ///
    /// # Errors
    /// `E_STATE` without an open offer; `E_KEYS`, `E_PRED_AUTH_OFF`, `E_VERIFIER_LOCKED` or
    /// `E_CONTENTS` when a read is missing or shows the pack unsafe; `E_TERMS` if `T` overflows.
    pub fn decide_fill(mut self, reads: &FillReads, now_ns: u64) -> MosaecResult<Filled> {
        let Stage::Offered(offer) = self.stage.clone() else {
            return Err(MosaecError::State);
        };
        ensure(
            reads.public_keys.as_ref().is_some_and(HashSet::is_empty),
            MosaecError::Keys,
        )?;
        ensure(
            reads.auth_by_predecessor == Some(true),
            MosaecError::PredAuthOff,
        )?;
        ensure(reads.locked == Some(false), MosaecError::VerifierLocked)?;
        ensure(
            reads
                .balances
                .as_ref()
                .is_some_and(|b| offer.contents.covered_by(b)),
            MosaecError::Contents,
        )?;
        let encumbrance = Encumbrance {
            k_token: offer.terms.k_token.clone(),
            k_amount: offer.terms.k_amount,
            expires_at_ns: expiry(now_ns, offer.terms.term_ns)?,
            contents: offer.contents.clone(),
        };
        self.rounds = self.rounds.saturating_add(1);
        let ticket_id = crate::nft::ticket_id(self.index, self.rounds);
        self.stage = Stage::Written {
            encumbrance: encumbrance.clone(),
            ticket_id: ticket_id.clone(),
            synced: false,
        };
        self.payout = Some(Payout {
            maker_id: offer.maker_id.clone(),
            token_id: offer.pay_token,
            amount: offer.price,
            in_flight: true,
        });
        Ok(Filled {
            position: self,
            ticket_id,
            encumbrance,
            maker_id: offer.maker_id,
        })
    }

    /// The live Ticket, if a pawn is written.
    #[must_use]
    pub fn ticket_id(&self) -> Option<&str> {
        match &self.stage {
            Stage::Written { ticket_id, .. } => Some(ticket_id),
            _ => None,
        }
    }

    /// The live encumbrance, if a pawn is written.
    #[must_use]
    pub const fn encumbrance(&self) -> Option<&Encumbrance> {
        match &self.stage {
            Stage::Written { encumbrance, .. } => Some(encumbrance),
            _ => None,
        }
    }

    /// Records that the pack confirmed the encumbrance.
    #[must_use]
    pub fn mark_synced(mut self) -> Self {
        if let Stage::Written { synced, .. } = &mut self.stage {
            *synced = true;
        }
        self
    }

    /// Ends the pawn (exercise or expiry) and returns the Ticket to burn.
    ///
    /// # Errors
    /// `E_STATE` unless `Written`.
    pub fn close_pawn(mut self) -> MosaecResult<(Self, String)> {
        let Stage::Written { ticket_id, .. } = self.stage else {
            return Err(MosaecError::State);
        };
        self.stage = Stage::Free;
        Ok((self, ticket_id))
    }

    /// Checks that `expire` may ask the pack to drop its encumbrance. The pack itself checks the
    /// deadline, including any grace window it recorded.
    ///
    /// # Errors
    /// `E_STATE` unless `Written` and past `T` with no command in flight.
    pub fn check_expire(&self, now_ns: u64) -> MosaecResult<()> {
        let encumbrance = self.encumbrance().ok_or(MosaecError::State)?;
        ensure(now_ns > encumbrance.expires_at_ns, MosaecError::State)?;
        ensure(!self.command_in_flight, MosaecError::Pending)
    }

    /// Checks a withdrawal command.
    ///
    /// # Errors
    /// `E_STATE` unless `Free`; `E_PENDING` with a command in flight.
    pub fn check_withdraw(&self) -> MosaecResult<()> {
        ensure(matches!(self.stage, Stage::Free), MosaecError::State)?;
        ensure(!self.command_in_flight, MosaecError::Pending)
    }

    /// Short lowercase stage name for views and events.
    #[must_use]
    pub const fn stage_name(&self) -> &'static str {
        match self.stage {
            Stage::Free => "free",
            Stage::Offered(_) => "offered",
            Stage::Written { .. } => "written",
        }
    }
}

#[cfg(test)]
mod tests {
    use mosaec_shared::constants::{DAY_NS, DEFAULT_TERM_NS, USDC, ZEC};
    use mosaec_shared::contents::ContentLine;

    use super::*;

    const NOW: u64 = 100 * DAY_NS;
    const PRICE: u128 = 100_000_000;
    const K: u128 = 107_500_000;

    fn maker() -> AccountId {
        "maker.near".parse().unwrap()
    }
    fn taker() -> AccountId {
        "taker.near".parse().unwrap()
    }

    fn terms() -> Terms {
        Terms {
            k_token: USDC.into(),
            k_amount: U128(K),
            term_ns: DEFAULT_TERM_NS,
        }
    }

    fn contents() -> Contents {
        Contents::new(
            vec![ContentLine {
                token_id: ZEC.into(),
                amount: U128(50_000_000),
            }],
            CapProfile::Production,
        )
        .unwrap()
    }

    fn offer() -> Offer {
        let contents = contents();
        Offer {
            maker_id: maker(),
            terms: terms(),
            pay_token: USDC.into(),
            price: U128(PRICE),
            open_until_ns: NOW + DAY_NS,
            contents_hash: contents.hash_hex(),
            contents,
        }
    }

    fn offered() -> Position {
        Position::new(7, "t7".into()).open_offer(offer()).unwrap()
    }

    fn fill_msg() -> FillMsg {
        FillMsg {
            pack: "7.v0.mosaec.near".parse().unwrap(),
            terms: terms(),
            contents_hash: contents().hash_hex(),
        }
    }

    fn safe_reads() -> FillReads {
        FillReads {
            public_keys: Some(HashSet::new()),
            auth_by_predecessor: Some(true),
            locked: Some(false),
            balances: Some(vec![U128(50_000_000)]),
        }
    }

    #[test]
    fn offer_only_from_free() {
        assert_eq!(offered().open_offer(offer()), Err(MosaecError::State));
        let p = Position::new(1, "t1".into());
        assert!(
            p.check_new_offer(
                &terms(),
                USDC,
                U128(PRICE),
                NOW + 1,
                NOW,
                CapProfile::Production
            )
            .is_ok()
        );
    }

    #[test]
    fn bait_and_switch_refunded() {
        let p = offered();
        let mut msg = fill_msg();
        msg.terms.k_amount = U128(K + 1);
        assert_eq!(
            p.check_fill(&taker(), USDC, U128(PRICE), &msg, NOW).err(),
            Some(MosaecError::Terms)
        );
        let mut msg = fill_msg();
        msg.contents_hash = "00".into();
        assert_eq!(
            p.check_fill(&taker(), USDC, U128(PRICE), &msg, NOW).err(),
            Some(MosaecError::Contents)
        );
    }

    #[test]
    fn fill_checks_payment_and_parties() {
        let p = offered();
        let msg = fill_msg();
        assert!(p.check_fill(&taker(), USDC, U128(PRICE), &msg, NOW).is_ok());
        assert_eq!(
            p.check_fill(&maker(), USDC, U128(PRICE), &msg, NOW).err(),
            Some(MosaecError::SelfFill)
        );
        assert_eq!(
            p.check_fill(&taker(), USDC, U128(PRICE - 1), &msg, NOW)
                .err(),
            Some(MosaecError::Amount)
        );
        assert_eq!(
            p.check_fill(&taker(), ZEC, U128(PRICE), &msg, NOW).err(),
            Some(MosaecError::Token)
        );
        assert_eq!(
            p.check_fill(&taker(), USDC, U128(PRICE), &msg, NOW + 2 * DAY_NS)
                .err(),
            Some(MosaecError::Expired)
        );
        assert_eq!(
            Position::new(1, "t1".into())
                .check_fill(&taker(), USDC, U128(PRICE), &msg, NOW)
                .err(),
            Some(MosaecError::State)
        );
    }

    #[test]
    fn decided_fill_writes_the_pawn() {
        let filled = offered().decide_fill(&safe_reads(), NOW).unwrap();
        assert_eq!(filled.ticket_id, "k7.1");
        assert_eq!(filled.encumbrance.expires_at_ns, NOW + DEFAULT_TERM_NS);
        assert_eq!(filled.maker_id, maker());
        assert_eq!(filled.position.rounds, 1);
        let payout = filled.position.payout.clone().unwrap();
        assert_eq!(payout.amount, U128(PRICE));
        assert!(payout.in_flight);
        assert_eq!(filled.position.ticket_id(), Some("k7.1"));
    }

    #[test]
    fn fill_refuses_keyed_account() {
        let mut reads = safe_reads();
        reads.public_keys = Some(HashSet::from(["ed25519:abc".to_string()]));
        assert_eq!(
            offered().decide_fill(&reads, NOW).err(),
            Some(MosaecError::Keys)
        );
        reads.public_keys = None;
        assert_eq!(
            offered().decide_fill(&reads, NOW).err(),
            Some(MosaecError::Keys)
        );
    }

    #[test]
    fn fill_refuses_auth_off_locked_or_drained() {
        let mut reads = safe_reads();
        reads.auth_by_predecessor = Some(false);
        assert_eq!(
            offered().decide_fill(&reads, NOW).err(),
            Some(MosaecError::PredAuthOff)
        );
        let mut reads = safe_reads();
        reads.locked = Some(true);
        assert_eq!(
            offered().decide_fill(&reads, NOW).err(),
            Some(MosaecError::VerifierLocked)
        );
        let mut reads = safe_reads();
        reads.balances = Some(vec![U128(49_999_999)]);
        assert_eq!(
            offered().decide_fill(&reads, NOW).err(),
            Some(MosaecError::Contents)
        );
    }

    #[test]
    fn dust_does_not_block_fill() {
        let mut reads = safe_reads();
        reads.balances = Some(vec![U128(50_000_001)]);
        assert!(offered().decide_fill(&reads, NOW).is_ok());
    }

    #[test]
    fn undelivered_payout_blocks_the_next_offer() {
        let filled = offered().decide_fill(&safe_reads(), NOW).unwrap();
        let (free, _) = filled.position.close_pawn().unwrap();
        assert_eq!(free.clone().open_offer(offer()), Err(MosaecError::Pending));
        assert_eq!(
            free.check_new_offer(
                &terms(),
                USDC,
                U128(PRICE),
                NOW + 1,
                NOW,
                CapProfile::Production
            ),
            Err(MosaecError::Pending)
        );
    }

    #[test]
    fn rounds_number_tickets() {
        let filled = offered().decide_fill(&safe_reads(), NOW).unwrap();
        let (mut free, burned) = filled.position.close_pawn().unwrap();
        free.payout = None;
        assert_eq!(burned, "k7.1");
        let again = free.open_offer(offer()).unwrap();
        assert_eq!(
            again.decide_fill(&safe_reads(), NOW).unwrap().ticket_id,
            "k7.2"
        );
    }

    #[test]
    fn early_expire_refused() {
        let filled = offered().decide_fill(&safe_reads(), NOW).unwrap();
        let p = filled.position;
        let t = NOW + DEFAULT_TERM_NS;
        assert_eq!(p.check_expire(t), Err(MosaecError::State));
        assert!(p.check_expire(t + 1).is_ok());
    }

    #[test]
    fn written_withdraw_refused() {
        let p = offered().decide_fill(&safe_reads(), NOW).unwrap().position;
        assert_eq!(p.check_withdraw(), Err(MosaecError::State));
        assert_eq!(offered().check_withdraw(), Err(MosaecError::State));
        assert!(Position::new(1, "t1".into()).check_withdraw().is_ok());
    }

    #[test]
    fn cancel_never_touches_a_written_pawn() {
        assert_eq!(offered().cancel_offer().unwrap().stage, Stage::Free);
        let p = offered().decide_fill(&safe_reads(), NOW).unwrap().position;
        assert_eq!(p.cancel_offer(), Err(MosaecError::State));
    }
}
