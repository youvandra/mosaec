//! Every fixed value the Mosaec contracts use. Nothing else in the contracts holds a literal.
//!
//! Gas and storage values are budgets sized with headroom. The sandbox gas and storage report
//! replaces them with measured values plus 30% before the production registry is deployed, and a
//! v0 registry is immutable afterwards, so these numbers are reviewed as carefully as code.

use near_sdk::{Gas, NearToken};

/// Account id of the NEAR Intents verifier on mainnet; mainnet registries accept no other.
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
/// One minute in nanoseconds.
pub const MINUTE_NS: u64 = 60 * 1_000_000_000;
/// Shortest term an offer may carry on the production registry.
pub const MIN_TERM_NS: u64 = 7 * DAY_NS;
/// Longest term an offer may carry on the production registry.
pub const MAX_TERM_NS: u64 = 180 * DAY_NS;
/// Shortest term on testnet, so a rehearsal reaches expiry within the hour.
pub const TESTNET_MIN_TERM_NS: u64 = 10 * MINUTE_NS;
/// Term the app proposes by default.
pub const DEFAULT_TERM_NS: u64 = 90 * DAY_NS;

// ---------------------------------------------------------------------------------------------
// Tokens (verifier token ids and decimals)
// ---------------------------------------------------------------------------------------------

/// Zcash on mainnet, bridged by the Omni bridge.
pub const ZEC: &str = "nep141:zec.omft.near";
/// Bitcoin on mainnet, bridged by the Omni bridge.
pub const BTC: &str = "nep141:btc.omft.near";
/// Solana on mainnet, bridged by the Omni bridge.
pub const SOL: &str = "nep141:sol.omft.near";
/// Native USDC on mainnet.
pub const USDC: &str = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";

/// Test tokens on testnet, deployed by `mosaec-deploy` under the testnet root.
pub const TESTNET_ZEC: &str = "nep141:zec.mosaec.testnet";
/// Test Bitcoin on testnet.
pub const TESTNET_BTC: &str = "nep141:btc.mosaec.testnet";
/// Test Solana on testnet.
pub const TESTNET_SOL: &str = "nep141:sol.mosaec.testnet";
/// Test USDC on testnet.
pub const TESTNET_USDC: &str = "nep141:usdc.mosaec.testnet";

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

/// The network a registry serves. Fixed at registry init; it selects the token ids, the term
/// bounds and the verifier the registry accepts.
#[near_sdk::near(serializers = [borsh, json])]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Network {
    /// NEAR mainnet: `v0.mosaec.near` against `intents.near`.
    Mainnet,
    /// NEAR testnet: our deploy of the mainnet verifier bytes and test tokens.
    Testnet,
}

impl Network {
    /// Inclusive `(shortest, longest)` term an offer may carry.
    #[must_use]
    pub const fn term_bounds(self) -> (u64, u64) {
        match self {
            Self::Mainnet => (MIN_TERM_NS, MAX_TERM_NS),
            Self::Testnet => (TESTNET_MIN_TERM_NS, MAX_TERM_NS),
        }
    }

    /// Top-level account suffix every Mosaec account on this network ends with.
    #[must_use]
    pub const fn account_suffix(self) -> &'static str {
        match self {
            Self::Mainnet => ".near",
            Self::Testnet => ".testnet",
        }
    }

    /// The verifier a registry on this network must use, when the network fixes one.
    #[must_use]
    pub const fn required_verifier(self) -> Option<&'static str> {
        match self {
            Self::Mainnet => Some(VERIFIER_ID),
            Self::Testnet => None,
        }
    }
}

/// Role a token may play in a position.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TokenRole {
    /// Held in the pack as collateral.
    Collateral,
    /// Paid as principal by the lender and as repayment by the borrower.
    Settlement,
}

/// One allowlisted asset with its per-pack cap, in the token's smallest unit.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TokenRule {
    /// Verifier token id on mainnet.
    pub mainnet_id: &'static str,
    /// Verifier token id on testnet.
    pub testnet_id: &'static str,
    /// Decimals of the underlying token.
    pub decimals: u8,
    /// Role the token may play.
    pub role: TokenRole,
    /// Cap per pack.
    pub cap: u128,
    /// Smallest home-chain withdrawal the bridge accepts. `None` keeps home-chain withdrawals of
    /// this token closed until the minimum has been measured on mainnet.
    pub min_home_withdraw: Option<u128>,
}

impl TokenRule {
    /// This asset's verifier token id on `network`.
    #[must_use]
    pub const fn token_id(&self, network: Network) -> &'static str {
        match network {
            Network::Mainnet => self.mainnet_id,
            Network::Testnet => self.testnet_id,
        }
    }
}

/// The v0 allowlist. Caps keep the owner's funds at risk under $500 in the first mainnet
/// release; testnet uses the same caps so a rehearsal behaves like production.
pub const TOKEN_RULES: [TokenRule; 4] = [
    TokenRule {
        mainnet_id: ZEC,
        testnet_id: TESTNET_ZEC,
        decimals: 8,
        role: TokenRole::Collateral,
        cap: 100_000_000, // 1 ZEC
        min_home_withdraw: None,
    },
    TokenRule {
        mainnet_id: BTC,
        testnet_id: TESTNET_BTC,
        decimals: 8,
        role: TokenRole::Collateral,
        cap: 1_000_000, // 0.01 BTC
        min_home_withdraw: None,
    },
    TokenRule {
        mainnet_id: SOL,
        testnet_id: TESTNET_SOL,
        decimals: 9,
        role: TokenRole::Collateral,
        cap: 5_000_000_000, // 5 SOL
        min_home_withdraw: None,
    },
    TokenRule {
        mainnet_id: USDC,
        testnet_id: TESTNET_USDC,
        decimals: 6,
        role: TokenRole::Settlement,
        cap: 1_000_000_000, // 1,000 USDC
        min_home_withdraw: None,
    },
];

/// The rule for `token_id` on `network`, if the token is allowlisted there.
#[must_use]
pub fn token_rule(network: Network, token_id: &str) -> Option<&'static TokenRule> {
    TOKEN_RULES
        .iter()
        .find(|rule| rule.token_id(network) == token_id)
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
const _: () = assert!(TESTNET_MIN_TERM_NS < MIN_TERM_NS);
const _: () = assert!(MINT_GAS.as_gas() < MAX_TX_GAS.as_gas());

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn caps_match_owner_limits() {
        let zec = token_rule(Network::Mainnet, ZEC).unwrap();
        assert_eq!(zec.cap, 10u128.pow(8));
        let usdc = token_rule(Network::Mainnet, USDC).unwrap();
        assert_eq!(usdc.cap, 1_000 * 10u128.pow(6));
    }

    #[test]
    fn token_ids_belong_to_their_network() {
        assert!(token_rule(Network::Testnet, ZEC).is_none());
        assert!(token_rule(Network::Mainnet, TESTNET_ZEC).is_none());
        assert_eq!(
            token_rule(Network::Testnet, TESTNET_ZEC).map(|r| r.mainnet_id),
            Some(ZEC)
        );
        for rule in TOKEN_RULES {
            assert!(rule.testnet_id.ends_with(Network::Testnet.account_suffix()));
            assert!(rule.mainnet_id.starts_with(NEP141_PREFIX));
        }
    }

    #[test]
    fn exactly_one_settlement_token() {
        let settlement: Vec<_> = TOKEN_RULES
            .iter()
            .filter(|r| r.role == TokenRole::Settlement)
            .collect();
        assert_eq!(settlement.len(), 1);
        assert_eq!(settlement[0].mainnet_id, USDC);
    }

    #[test]
    fn only_mainnet_fixes_the_verifier() {
        assert_eq!(Network::Mainnet.required_verifier(), Some("intents.near"));
        assert_eq!(Network::Testnet.required_verifier(), None);
    }
}
