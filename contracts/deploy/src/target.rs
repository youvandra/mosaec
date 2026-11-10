//! Where each environment deploys and with which settings.

use anyhow::{Result, bail};
use near_primitives::types::{AccountId, Balance};
use near_token::NearToken;

/// One NEAR in yoctoNEAR.
pub const YOCTO_PER_NEAR: u128 = 1_000_000_000_000_000_000_000_000;

/// Mainnet RPC used when none is given.
pub const DEFAULT_RPC: &str = "https://free.rpc.fastnear.com";
/// Chain id every target expects; a sandbox reports its own and is accepted by the tests.
pub const MAINNET_CHAIN_ID: &str = "mainnet";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Env {
    Staging,
    Production,
}

impl Env {
    /// Parses `staging` or `production`.
    ///
    /// # Errors
    /// Any other value.
    pub fn parse(value: &str) -> Result<Self> {
        match value {
            "staging" => Ok(Self::Staging),
            "production" => Ok(Self::Production),
            other => bail!("unknown env `{other}`; use staging or production"),
        }
    }
}

/// Accounts and settings of one deploy.
#[derive(Debug, Clone)]
pub struct Target {
    pub env: Env,
    /// Keyed root that creates the registry account and pays for the pack code publish.
    pub root: AccountId,
    /// Registry account, created by `root`.
    pub registry: AccountId,
    /// Pause-only guardian written into the registry at init.
    pub guardian: AccountId,
    /// `CapProfile` the registry enforces, as its JSON name.
    pub profile: &'static str,
    /// NEAR sent to the new registry account: its code storage plus room for positions and NFTs.
    pub registry_funding: Balance,
}

impl Target {
    /// # Errors
    /// Never for the built-in ids; kept fallible for custom roots in tests.
    pub fn for_env(env: Env, root: &str) -> Result<Self> {
        let root: AccountId = root.parse()?;
        let (sub, profile, funding) = match env {
            Env::Staging => ("staging", "Staging", NearToken::from_near(5)),
            Env::Production => ("v0", "Production", NearToken::from_near(6)),
        };
        Ok(Self {
            env,
            registry: format!("{sub}.{root}").parse()?,
            guardian: root.clone(),
            root,
            profile,
            registry_funding: funding,
        })
    }
}
