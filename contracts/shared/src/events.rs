//! NEP-297 events, standard `mosaec`, version 1.0.0. The indexer stores every one of them by
//! receipt id, so each event carries enough to update its row without reading contract state.

use near_sdk::json_types::U128;
use near_sdk::{AccountId, near};

use crate::contents::Contents;
use crate::types::{Destination, NftKind, Terms};

/// Why an offer closed without a fill.
#[near(serializers = [json])]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CancelReason {
    /// The Title holder cancelled.
    Cancelled,
    /// The Title moved, which cancels any open offer.
    TitleMoved,
}

/// Every event a Mosaec contract emits. Call `.emit()` to log it.
#[near(event_json(standard = "mosaec"))]
#[derive(Debug)]
pub enum MosaecEvent {
    /// A pack was created and its Title minted.
    #[event_version("1.0.0")]
    PackMinted {
        pack: AccountId,
        title_id: String,
        owner_id: AccountId,
    },
    /// The Title holder opened an offer.
    #[event_version("1.0.0")]
    OfferCreated {
        pack: AccountId,
        maker_id: AccountId,
        terms: Terms,
        pay_token: String,
        price: U128,
        offer_expires_at_ns: u64,
        contents: Contents,
        contents_hash: String,
    },
    /// An offer closed without a fill.
    #[event_version("1.0.0")]
    OfferCancelled {
        pack: AccountId,
        reason: CancelReason,
    },
    /// A fill was decided: the lender holds the Title, the borrower holds the Ticket.
    #[event_version("1.0.0")]
    Filled {
        pack: AccountId,
        maker_id: AccountId,
        taker_id: AccountId,
        ticket_id: String,
        price: U128,
        expires_at_ns: u64,
    },
    /// A fill or exercise was refused and the payment returned in full.
    #[event_version("1.0.0")]
    Refused {
        pack: AccountId,
        sender_id: AccountId,
        code: String,
    },
    /// The maker's principal reached the maker.
    #[event_version("1.0.0")]
    PayoutDelivered {
        pack: AccountId,
        maker_id: AccountId,
        amount: U128,
    },
    /// The pack stored its encumbrance (`true`) or dropped it (`false`).
    #[event_version("1.0.0")]
    EncumbranceSynced { pack: AccountId, encumbered: bool },
    /// An exercise was decided; the contents are owed to `owed_to`.
    #[event_version("1.0.0")]
    ExerciseDecided {
        pack: AccountId,
        owed_to: AccountId,
        k_amount: U128,
    },
    /// The recorded contents reached the exerciser.
    #[event_version("1.0.0")]
    ContentsReleased { pack: AccountId, owed_to: AccountId },
    /// A Title or Ticket was burned.
    #[event_version("1.0.0")]
    NftBurned { token_id: String, kind: NftKind },
    /// A pawn passed its deadline unexercised.
    #[event_version("1.0.0")]
    Expired { pack: AccountId },
    /// A verifier pause or lock was recorded inside the disruption window.
    #[event_version("1.0.0")]
    DisruptionRecorded {
        pack: AccountId,
        at_ns: u64,
        exercise_deadline_ns: u64,
    },
    /// Value left a `Free` pack on the Title holder's command.
    #[event_version("1.0.0")]
    Withdrawn {
        pack: AccountId,
        token_id: String,
        amount: U128,
        destination: Destination,
    },
    /// The guardian paused new positions.
    #[event_version("1.0.0")]
    Paused { guardian_id: AccountId },
    /// The guardian resumed new positions.
    #[event_version("1.0.0")]
    Unpaused { guardian_id: AccountId },
}

#[cfg(test)]
mod tests {
    use near_sdk::test_utils::get_logs;

    use super::*;

    #[test]
    fn emits_nep297_line() {
        MosaecEvent::Expired {
            pack: "1.v0.mosaec.near".parse().unwrap(),
        }
        .emit();
        let logs = get_logs();
        assert_eq!(
            logs.last().map(String::as_str),
            Some(
                r#"EVENT_JSON:{"standard":"mosaec","version":"1.0.0","event":"expired","data":{"pack":"1.v0.mosaec.near"}}"#
            )
        );
    }
}
