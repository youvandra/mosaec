//! The Title and Ticket collection: token records, the owner index, `Pending` flags and NEP-171
//! events. Callers check ownership and `Pending` before moving a token; this module only stores.

use mosaec_shared::constants::{EVENT_STANDARD, TICKET_PREFIX, TITLE_PREFIX};
use mosaec_shared::types::NftKind;
use near_sdk::serde_json::json;
use near_sdk::store::{IterableMap, IterableSet, LookupMap, LookupSet};
use near_sdk::{AccountId, env, near};

/// NEP-171 event standard and version.
const NEP171_STANDARD: &str = "nep171";
const NEP171_VERSION: &str = "1.2.0";

/// Storage prefixes. The registry's own collections use other first bytes (see `lib.rs`).
const PREFIX_TOKENS: &[u8] = b"n:t";
const PREFIX_OWNERS: &[u8] = b"n:o";
const PREFIX_OWNER_TOKENS: &[u8] = b"n:s";
const PREFIX_PENDING: &[u8] = b"n:p";

/// One Title or Ticket.
#[near(serializers = [borsh, json])]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TokenRecord {
    pub owner_id: AccountId,
    pub kind: NftKind,
    pub pack: AccountId,
}

/// Token storage for the collection.
#[near(serializers = [borsh])]
#[derive(Debug)]
pub struct Nft {
    tokens: IterableMap<String, TokenRecord>,
    owners: LookupMap<AccountId, IterableSet<String>>,
    pending: LookupSet<String>,
}

/// Token id of pack `index`'s Title.
#[must_use]
pub fn title_id(index: u64) -> String {
    format!("{TITLE_PREFIX}{index}")
}

/// Token id of pack `index`'s Ticket for pawn `round`.
#[must_use]
pub fn ticket_id(index: u64, round: u32) -> String {
    format!("{TICKET_PREFIX}{index}.{round}")
}

impl Nft {
    #[must_use]
    pub fn new() -> Self {
        Self {
            tokens: IterableMap::new(PREFIX_TOKENS),
            owners: LookupMap::new(PREFIX_OWNERS),
            pending: LookupSet::new(PREFIX_PENDING),
        }
    }

    #[must_use]
    pub fn get(&self, token_id: &str) -> Option<&TokenRecord> {
        self.tokens.get(token_id)
    }

    /// True when `account_id` directly owns `token_id`.
    #[must_use]
    pub fn is_owner(&self, token_id: &str, account_id: &AccountId) -> bool {
        self.get(token_id)
            .is_some_and(|t| t.owner_id == *account_id)
    }

    #[must_use]
    pub fn is_pending(&self, token_id: &str) -> bool {
        self.pending.contains(token_id)
    }

    /// Marks `token_id` `Pending`; returns false when it already was.
    pub fn set_pending(&mut self, token_id: &str) -> bool {
        self.pending.insert(token_id.to_owned())
    }

    pub fn clear_pending(&mut self, token_id: &str) {
        self.pending.remove(token_id);
    }

    pub fn mint(&mut self, token_id: String, record: TokenRecord) {
        self.index_insert(&record.owner_id, &token_id);
        emit(
            "nft_mint",
            &json!({ "owner_id": record.owner_id, "token_ids": [token_id] }),
        );
        self.tokens.insert(token_id, record);
    }

    pub fn burn(&mut self, token_id: &str) {
        self.pending.remove(token_id);
        if let Some(record) = self.tokens.remove(token_id) {
            self.index_remove(&record.owner_id, token_id);
            emit(
                "nft_burn",
                &json!({ "owner_id": record.owner_id, "token_ids": [token_id] }),
            );
        }
    }

    /// Moves `token_id` to `new_owner` and returns the previous owner.
    pub fn transfer(
        &mut self,
        token_id: &str,
        new_owner: &AccountId,
        memo: Option<&str>,
    ) -> Option<AccountId> {
        let record = self.tokens.get_mut(token_id)?;
        let old_owner = std::mem::replace(&mut record.owner_id, new_owner.clone());
        self.index_remove(&old_owner, token_id);
        self.index_insert(new_owner, token_id);
        emit(
            "nft_transfer",
            &json!({
                "old_owner_id": old_owner,
                "new_owner_id": new_owner,
                "token_ids": [token_id],
                "memo": memo,
            }),
        );
        Some(old_owner)
    }

    #[must_use]
    pub fn total_supply(&self) -> u32 {
        self.tokens.len()
    }

    /// Tokens in insertion order, `from` index on, at most `limit`.
    #[must_use]
    pub fn page(&self, from: usize, limit: usize) -> Vec<(String, TokenRecord)> {
        self.tokens
            .iter()
            .skip(from)
            .take(limit)
            .map(|(id, t)| (id.clone(), t.clone()))
            .collect()
    }

    #[must_use]
    pub fn supply_for_owner(&self, owner_id: &AccountId) -> u32 {
        self.owners.get(owner_id).map_or(0, IterableSet::len)
    }

    /// Token ids `owner_id` holds, `from` index on, at most `limit`.
    #[must_use]
    pub fn owner_page(&self, owner_id: &AccountId, from: usize, limit: usize) -> Vec<String> {
        self.owners.get(owner_id).map_or_else(Vec::new, |set| {
            set.iter().skip(from).take(limit).cloned().collect()
        })
    }

    fn index_insert(&mut self, owner_id: &AccountId, token_id: &str) {
        let set = self.owners.entry(owner_id.clone()).or_insert_with(|| {
            let mut prefix = PREFIX_OWNER_TOKENS.to_vec();
            prefix.extend_from_slice(&env::sha256_array(owner_id.as_bytes()));
            IterableSet::new(prefix)
        });
        set.insert(token_id.to_owned());
    }

    fn index_remove(&mut self, owner_id: &AccountId, token_id: &str) {
        let now_empty = self.owners.get_mut(owner_id).is_some_and(|set| {
            set.remove(token_id);
            set.is_empty()
        });
        if now_empty {
            self.owners.remove(owner_id);
        }
    }
}

impl Default for Nft {
    fn default() -> Self {
        Self::new()
    }
}

/// Logs a NEP-171 event. Its `data` is an array, which the SDK's event macro does not produce.
fn emit(event: &str, data: &near_sdk::serde_json::Value) {
    let line = json!({
        "standard": NEP171_STANDARD,
        "version": NEP171_VERSION,
        "event": event,
        "data": [data],
    });
    env::log_str(&format!("EVENT_JSON:{line}"));
}

/// Static NEP-177 metadata for one token. Dynamic metadata replaces it in a later release.
#[must_use]
pub fn token_metadata(token_id: &str, record: &TokenRecord) -> near_sdk::serde_json::Value {
    let (title, description) = match record.kind {
        NftKind::Title => (
            format!("Mosaec Title {token_id}"),
            format!("Owns pack {}, subject to any live Ticket.", record.pack),
        ),
        NftKind::Ticket => (
            format!("Mosaec Ticket {token_id}"),
            format!(
                "May take the recorded contents of pack {} by paying the repayment before the deadline.",
                record.pack
            ),
        ),
    };
    json!({
        "title": title,
        "description": description,
        "extra": json!({ "standard": EVENT_STANDARD, "kind": record.kind, "pack": record.pack }).to_string(),
    })
}

#[cfg(test)]
mod tests {
    use near_sdk::test_utils::get_logs;

    use super::*;

    fn acc(s: &str) -> AccountId {
        s.parse().unwrap()
    }

    fn record(owner: &str, kind: NftKind) -> TokenRecord {
        TokenRecord {
            owner_id: acc(owner),
            kind,
            pack: acc("1.v0.mosaec.near"),
        }
    }

    #[test]
    fn ids() {
        assert_eq!(title_id(7), "t7");
        assert_eq!(ticket_id(7, 2), "k7.2");
    }

    #[test]
    fn mint_transfer_burn_keep_the_index() {
        let mut nft = Nft::new();
        nft.mint("t1".into(), record("a.near", NftKind::Title));
        nft.mint("k1.1".into(), record("a.near", NftKind::Ticket));
        assert_eq!(nft.supply_for_owner(&acc("a.near")), 2);
        assert_eq!(
            nft.transfer("t1", &acc("b.near"), None),
            Some(acc("a.near"))
        );
        assert!(nft.is_owner("t1", &acc("b.near")));
        assert_eq!(
            nft.owner_page(&acc("b.near"), 0, 10),
            vec!["t1".to_string()]
        );
        nft.burn("k1.1");
        assert_eq!(nft.supply_for_owner(&acc("a.near")), 0);
        assert_eq!(nft.total_supply(), 1);
        assert!(get_logs().iter().any(|l| l.contains("\"nft_burn\"")));
        assert!(
            get_logs()
                .iter()
                .any(|l| l.starts_with("EVENT_JSON:") && l.contains("\"data\":[{"))
        );
    }

    #[test]
    fn pending_flags() {
        let mut nft = Nft::new();
        assert!(nft.set_pending("t1"));
        assert!(!nft.set_pending("t1"));
        assert!(nft.is_pending("t1"));
        nft.clear_pending("t1");
        assert!(!nft.is_pending("t1"));
    }
}
