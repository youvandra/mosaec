//! Where each network deploys and with which settings.

use anyhow::{Result, bail};
use mosaec_shared::constants::{TOKEN_RULES, TokenRule};
use near_primitives::types::{AccountId, Balance};
use near_token::NearToken;

/// One NEAR in yoctoNEAR.
pub const YOCTO_PER_NEAR: u128 = 1_000_000_000_000_000_000_000_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Env {
    Mainnet,
    Testnet,
}

impl Env {
    /// Parses `mainnet` or `testnet`.
    ///
    /// # Errors
    /// Any other value.
    pub fn parse(value: &str) -> Result<Self> {
        match value {
            "mainnet" => Ok(Self::Mainnet),
            "testnet" => Ok(Self::Testnet),
            other => bail!("unknown env `{other}`; use mainnet or testnet"),
        }
    }

    #[must_use]
    pub const fn default_root(self) -> &'static str {
        match self {
            Self::Mainnet => "mosaec.near",
            Self::Testnet => "mosaec.testnet",
        }
    }

    #[must_use]
    pub const fn default_rpc(self) -> &'static str {
        match self {
            Self::Mainnet => "https://free.rpc.fastnear.com",
            Self::Testnet => "https://rpc.testnet.fastnear.com",
        }
    }

    /// The chain id the RPC must report.
    #[must_use]
    pub const fn chain_id(self) -> &'static str {
        match self {
            Self::Mainnet => "mainnet",
            Self::Testnet => "testnet",
        }
    }

    /// The registry's `Network` as its JSON name.
    #[must_use]
    pub const fn network(self) -> &'static str {
        match self {
            Self::Mainnet => "Mainnet",
            Self::Testnet => "Testnet",
        }
    }
}

/// A test token the testnet deploy creates.
#[derive(Debug, Clone)]
pub struct TestToken {
    pub rule: &'static TokenRule,
    pub account: AccountId,
}

/// Accounts and settings of one deploy.
#[derive(Debug, Clone)]
pub struct Target {
    pub env: Env,
    /// Keyed root that creates every other account and pays for the pack code publish.
    pub root: AccountId,
    /// Registry account, created by `root`.
    pub registry: AccountId,
    /// Pause-only guardian written into the registry at init.
    pub guardian: AccountId,
    /// The verifier the registry and its packs use.
    pub verifier: AccountId,
    /// True when this deploy creates the verifier itself (testnet); mainnet uses `intents.near`.
    pub deploys_verifier: bool,
    /// Test tokens this deploy creates (testnet only).
    pub tokens: Vec<TestToken>,
    /// NEAR sent to the new registry account: its code storage plus room for positions and NFTs.
    pub registry_funding: Balance,
    /// NEAR sent to the new verifier account (testnet): its 1.3 MB of code plus state.
    pub verifier_funding: Balance,
    /// NEAR sent to each new test token account: its code plus holder storage.
    pub token_funding: Balance,
}

/// Test assets deployed on testnet unless more are asked for: the collateral the pitch leads with
/// and the settlement token.
pub const DEFAULT_TEST_ASSETS: [&str; 2] = ["zec", "usdc"];

impl Target {
    /// `root` defaults to the network's root; `assets` names the test tokens to create on testnet
    /// (`zec`, `btc`, `sol`, `usdc`).
    ///
    /// # Errors
    /// On a malformed account id or an unknown asset.
    pub fn for_env(env: Env, root: Option<&str>, assets: &[&str]) -> Result<Self> {
        let root: AccountId = root.unwrap_or(env.default_root()).parse()?;
        let (verifier, deploys_verifier, tokens) = match env {
            Env::Mainnet => (
                mosaec_shared::constants::VERIFIER_ID.parse()?,
                false,
                Vec::new(),
            ),
            Env::Testnet => (
                format!("intents.{root}").parse()?,
                true,
                test_tokens(&root, assets)?,
            ),
        };
        Ok(Self {
            env,
            registry: format!("v0.{root}").parse()?,
            guardian: root.clone(),
            root,
            verifier,
            deploys_verifier,
            tokens,
            registry_funding: NearToken::from_near(5),
            verifier_funding: NearToken::from_near(14),
            token_funding: NearToken::from_near(3),
        })
    }
}

fn test_tokens(root: &AccountId, assets: &[&str]) -> Result<Vec<TestToken>> {
    assets
        .iter()
        .map(|asset| {
            let account: AccountId = format!("{asset}.{root}").parse()?;
            let token_id = format!("nep141:{account}");
            let Some(rule) = TOKEN_RULES.iter().find(|r| r.testnet_id == token_id) else {
                bail!("{token_id} is not on the testnet allowlist (zec, btc, sol, usdc under mosaec.testnet)");
            };
            Ok(TestToken { rule, account })
        })
        .collect()
}
