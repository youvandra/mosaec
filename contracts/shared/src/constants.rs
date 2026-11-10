//! Every fixed value the Mosaec contracts use. Nothing else in the contracts holds a literal.
//!
//! Gas and storage values are budgets sized with headroom. The sandbox gas and storage report
//! replaces them with measured values plus 30% before the production registry is deployed, and a
//! v0 registry is immutable afterwards, so these numbers are reviewed as carefully as code.

use near_sdk::{Gas, NearToken};

/// Account id of the NEAR Intents verifier on mainnet.
pub const VERIFIER_ID: &str = "intents.near";

/// NEP-297 event standard name and version.
pub const EVENT_STANDARD: &str = "mosaec";
/// NEP-297 event version.
pub const EVENT_VERSION: &str = "1.0.0";

// ---------------------------------------------------------------------------------------------
// Time (nanoseconds, the unit of `env::block_timestamp`)
// ---------------------------------------------------------------------------------------------

/// One hour in nanoseconds.
pub const HOUR_NS: u64 = 3_600 * 1_000_000_000;
/// One day in nanoseconds.
pub const DAY_NS: u64 = 24 * HOUR_NS;
/// Length of the disruption window before `T` and of the grace period after it.
pub const GRACE_NS: u64 = 24 * HOUR_NS;
/// Shortest term an offer may carry.
pub const MIN_TERM_NS: u64 = 7 * DAY_NS;
/// Longest term an offer may carry.
pub const MAX_TERM_NS: u64 = 180 * DAY_NS;
/// Term the app proposes by default.
pub const DEFAULT_TERM_NS: u64 = 90 * DAY_NS;

// ---------------------------------------------------------------------------------------------
// Tokens (verifier token ids and decimals)
// ---------------------------------------------------------------------------------------------

/// Zcash, bridged by the Omni bridge.
pub const ZEC: &str = "nep141:zec.omft.near";
/// Bitcoin, bridged by the Omni bridge.
pub const BTC: &str = "nep141:btc.omft.near";
/// Solana, bridged by the Omni bridge.
pub const SOL: &str = "nep141:sol.omft.near";
/// Native USDC on NEAR.
pub const USDC: &str = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";

/// NFT token id prefix of a Title; the pack index follows (`t7`).
pub const TITLE_PREFIX: &str = "t";
/// NFT token id prefix of a Ticket; the pack index and the pawn round follow (`k7.2`).
pub const TICKET_PREFIX: &str = "k";
/// Longest account id NEAR accepts; pack ids must fit.
pub const MAX_ACCOUNT_ID_LEN: usize = 64;
/// Most offers, Titles or Tickets one enumeration call returns.
pub const MAX_PAGE: u64 = 100;

/// Prefix of a NEP-141 token id inside the verifier.
pub const NEP141_PREFIX: &str = "nep141:";
/// Memo prefix the bridge tokens read as the home-chain destination of an `ft_withdraw`.
pub const HOME_CHAIN_MEMO_PREFIX: &str = "WITHDRAW_TO:";
/// Longest home-chain address passed to a bridge (Zcash unified addresses run past 100 chars).
pub const MAX_HOME_ADDRESS_LEN: usize = 256;
/// Most bytes read from a cross-contract result; bounds callback gas whatever the callee returns.
pub const MAX_PROMISE_RESULT_LEN: usize = 4_096;

/// The verifier moves at most this many tokens in one batch transfer.
pub const BATCH_MAX_TOKENS: usize = 10;

/// Which cap table a registry enforces. Fixed at registry init.
#[near_sdk::near(serializers = [borsh, json])]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CapProfile {
    /// `v0.mosaec.near`.
    Production,
    /// `staging.mosaec.near`.
    Staging,
}

/// Role a token may play in a position.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TokenRole {
    /// Held in the pack as collateral.
    Collateral,
    /// Paid as principal by the lender and as repayment by the borrower.
    Settlement,
}

/// One allowlisted token with its per-pack caps, in the token's smallest unit.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TokenRule {
    /// Verifier token id.
    pub token_id: &'static str,
    /// Decimals of the underlying token.
    pub decimals: u8,
    /// Role the token may play.
    pub role: TokenRole,
    /// Cap per pack on `v0.mosaec.near`.
    pub production_cap: u128,
    /// Cap per pack on `staging.mosaec.near`.
    pub staging_cap: u128,
    /// Smallest home-chain withdrawal the bridge accepts. `None` keeps home-chain withdrawals of
    /// this token closed until the minimum has been measured on mainnet.
    pub min_home_withdraw: Option<u128>,
}

impl TokenRule {
    /// The cap this rule enforces under `profile`.
    #[must_use]
    pub const fn cap(&self, profile: CapProfile) -> u128 {
        match profile {
            CapProfile::Production => self.production_cap,
            CapProfile::Staging => self.staging_cap,
        }
    }
}

/// The v0 allowlist. Production caps keep the owner's funds at risk under $500 in the first
/// release; staging caps keep every mainnet rehearsal under $60.
pub const TOKEN_RULES: [TokenRule; 4] = [
    TokenRule {
        token_id: ZEC,
        decimals: 8,
        role: TokenRole::Collateral,
        production_cap: 100_000_000, // 1 ZEC
        staging_cap: 5_000_000,      // 0.05 ZEC
        min_home_withdraw: None,
    },
    TokenRule {
        token_id: BTC,
        decimals: 8,
        role: TokenRole::Collateral,
        production_cap: 1_000_000, // 0.01 BTC
        staging_cap: 70_000,       // 0.0007 BTC
        min_home_withdraw: None,
    },
    TokenRule {
        token_id: SOL,
        decimals: 9,
        role: TokenRole::Collateral,
        production_cap: 5_000_000_000, // 5 SOL
        staging_cap: 600_000_000,      // 0.6 SOL
        min_home_withdraw: None,
    },
    TokenRule {
        token_id: USDC,
        decimals: 6,
        role: TokenRole::Settlement,
        production_cap: 1_000_000_000, // 1,000 USDC
        staging_cap: 50_000_000,       // 50 USDC
        min_home_withdraw: None,
    },
];

/// The rule for `token_id`, if the token is allowlisted.
#[must_use]
pub fn token_rule(token_id: &str) -> Option<&'static TokenRule> {
    TOKEN_RULES.iter().find(|rule| rule.token_id == token_id)
}

// ---------------------------------------------------------------------------------------------
// Gas budgets per hop
// ---------------------------------------------------------------------------------------------

/// One verifier view call (`public_keys_of`, `is_account_locked`, `mt_batch_balance_of`, ...).
pub const GAS_VERIFIER_VIEW: Gas = Gas::from_tgas(5);
/// One verifier transfer (`mt_transfer` or `mt_batch_transfer` of up to ten tokens).
pub const GAS_VERIFIER_TRANSFER: Gas = Gas::from_tgas(20);
/// One verifier `ft_withdraw` to a home chain, including the bridge token's own hop.
pub const GAS_VERIFIER_WITHDRAW: Gas = Gas::from_tgas(50);
/// One registry-to-pack or pack-to-registry call that writes state.
pub const GAS_CROSS_CALL: Gas = Gas::from_tgas(15);
/// A callback that only records the outcome of a delivery.
pub const GAS_DELIVERY_CALLBACK: Gas = Gas::from_tgas(10);
/// The value-returning decide receipt's own work: reading the promise result, writing the
/// decision and scheduling the deliveries. The deliveries' gas is attached on top of this.
pub const GAS_DECIDE_RESERVE: Gas = Gas::from_tgas(25);
/// The verifier's `mt_resolve_transfer` reserves 10 + 5n Tgas; this is that cost at
/// `BATCH_MAX_TOKENS`, kept back from every `mt_on_transfer` chain.
pub const GAS_VERIFIER_RESOLVE: Gas = Gas::from_tgas(10 + 5 * BATCH_MAX_TOKENS as u64);

/// Attached to the registry's fill decide receipt: its own work, the payout with its callback,
/// and `encumber` on the pack with its callback.
pub const FILL_DECIDE_GAS: Gas = Gas::from_tgas(
    GAS_DECIDE_RESERVE.as_tgas()
        + GAS_VERIFIER_TRANSFER.as_tgas()
        + GAS_CROSS_CALL.as_tgas()
        + 2 * GAS_DELIVERY_CALLBACK.as_tgas(),
);
/// Minimum gas left to the registry's `mt_on_transfer` for a fill: four joined verifier views
/// plus the decide receipt with everything it schedules.
pub const FILL_GAS: Gas =
    Gas::from_tgas(4 * GAS_VERIFIER_VIEW.as_tgas() + FILL_DECIDE_GAS.as_tgas());
/// Gas for the pack's `new` inside the mint batch.
pub const GAS_PACK_INIT: Gas = Gas::from_tgas(10);
/// Minimum prepaid gas for `mint`: the create batch with the pack's init, and its callback.
pub const MINT_GAS: Gas = Gas::from_tgas(
    GAS_PACK_INIT.as_tgas() + GAS_CROSS_CALL.as_tgas() + GAS_DELIVERY_CALLBACK.as_tgas(),
);
/// Minimum prepaid gas for a registry-to-pack command with its callback (`expire`, `withdraw`,
/// `sync_encumbrance`, `finalize_exercise`, `claim_payout`).
pub const COMMAND_GAS: Gas = Gas::from_tgas(
    GAS_VERIFIER_WITHDRAW.as_tgas() + GAS_CROSS_CALL.as_tgas() + GAS_DELIVERY_CALLBACK.as_tgas(),
);
/// Gas reserved for `nft_resolve_transfer` after an `nft_transfer_call`.
pub const GAS_NFT_RESOLVE: Gas = Gas::from_tgas(10);
/// Minimum prepaid gas for `nft_transfer_call`: the receiver's hook and the resolve step.
pub const NFT_TRANSFER_CALL_GAS: Gas =
    Gas::from_tgas(GAS_CROSS_CALL.as_tgas() + GAS_NFT_RESOLVE.as_tgas());
/// Attached to the pack's exercise decide receipt: its own work, the release with its callback,
/// and `end_exercise` on the registry.
pub const EXERCISE_DECIDE_GAS: Gas = Gas::from_tgas(
    GAS_DECIDE_RESERVE.as_tgas()
        + GAS_VERIFIER_TRANSFER.as_tgas()
        + GAS_DELIVERY_CALLBACK.as_tgas()
        + GAS_CROSS_CALL.as_tgas(),
);
/// Minimum gas left to the pack's `mt_on_transfer` for an exercise: `begin_exercise` plus the
/// decide receipt with everything it schedules.
pub const EXERCISE_GAS: Gas =
    Gas::from_tgas(GAS_CROSS_CALL.as_tgas() + EXERCISE_DECIDE_GAS.as_tgas());
/// Minimum prepaid gas for a release retry (`claim`): one transfer and its callback.
pub const CLAIM_GAS: Gas =
    Gas::from_tgas(GAS_VERIFIER_TRANSFER.as_tgas() + GAS_DELIVERY_CALLBACK.as_tgas());
/// Minimum prepaid gas for `record_disruption`: two joined views and the callback.
pub const DISRUPTION_GAS: Gas =
    Gas::from_tgas(2 * GAS_VERIFIER_VIEW.as_tgas() + GAS_DELIVERY_CALLBACK.as_tgas());

// ---------------------------------------------------------------------------------------------
// Storage and NEAR reserves
// ---------------------------------------------------------------------------------------------

/// Pack account storage: the account record plus pack state with ten content lines.
pub const PACK_STORAGE: NearToken = NearToken::from_millinear(20);
/// NEAR kept in the pack to attach 1 yoctoNEAR to each outbound verifier call for its lifetime.
pub const PACK_OPS_RESERVE: NearToken = NearToken::from_millinear(1);
/// Storage for one NFT (Title or Ticket) with its metadata and owner index entry.
pub const NFT_STORAGE: NearToken = NearToken::from_millinear(10);
/// Storage for one offer with ten content lines.
pub const OFFER_STORAGE: NearToken = NearToken::from_millinear(10);
/// Deposit required by `mint`: the pack, its reserve, the Title, the Ticket and one offer.
/// The pack's share is forwarded to it; the rest stays with the registry for NFT and offer
/// storage across every pawn round of the pack.
pub const MINT_DEPOSIT: NearToken = NearToken::from_millinear(
    PACK_STORAGE.as_millinear()
        + PACK_OPS_RESERVE.as_millinear()
        + 2 * NFT_STORAGE.as_millinear()
        + OFFER_STORAGE.as_millinear(),
);
/// Attached to every verifier call that moves value, as NEP-245 requires.
pub const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

// ---------------------------------------------------------------------------------------------
// Outbound calls
// ---------------------------------------------------------------------------------------------

/// The only verifier methods a pack ever calls. A wasm inspection test fails the build when the
/// pack binary names any other verifier method or any key, deploy or delete action.
pub const PACK_VERIFIER_METHODS: [&str; 6] = [
    "mt_batch_transfer",
    "ft_withdraw",
    "mt_batch_balance_of",
    "public_keys_of",
    "is_account_locked",
    "pa_all_paused",
];

/// Verifier pause keys that stop an exercise from reaching a pack. In v0.4.5 they guard
/// `mt_transfer`, `mt_batch_transfer`, `mt_transfer_call` and `execute_intents`.
pub const DISRUPTING_PAUSE_KEYS: [&str; 3] = ["ALL", "mt_transfer", "intents"];

/// Most gas one transaction may carry.
const MAX_TX_GAS: Gas = Gas::from_tgas(300);

// Build-time checks on the budgets above: a change that breaks one fails compilation.
const _: () = assert!(FILL_GAS.as_gas() + GAS_VERIFIER_RESOLVE.as_gas() < MAX_TX_GAS.as_gas());
const _: () = assert!(EXERCISE_GAS.as_gas() + GAS_VERIFIER_RESOLVE.as_gas() < MAX_TX_GAS.as_gas());
const _: () = assert!(MIN_TERM_NS < DEFAULT_TERM_NS && DEFAULT_TERM_NS < MAX_TERM_NS);
const _: () = assert!(GRACE_NS < MIN_TERM_NS);
const _: () = assert!(MINT_GAS.as_gas() < MAX_TX_GAS.as_gas());

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn caps_match_owner_limits() {
        let zec = token_rule(ZEC).unwrap();
        assert_eq!(zec.cap(CapProfile::Production), 10u128.pow(8));
        let usdc = token_rule(USDC).unwrap();
        assert_eq!(usdc.cap(CapProfile::Production), 1_000 * 10u128.pow(6));
        assert!(TOKEN_RULES.iter().all(|r| r.staging_cap < r.production_cap));
    }

    #[test]
    fn exactly_one_settlement_token() {
        let settlement: Vec<_> = TOKEN_RULES
            .iter()
            .filter(|r| r.role == TokenRole::Settlement)
            .collect();
        assert_eq!(settlement.len(), 1);
        assert_eq!(settlement[0].token_id, USDC);
    }
}
