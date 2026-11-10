//! What a deploy still has to do, decided from what the chain already holds. `plan` is pure, so
//! the same inputs always print and send the same steps, and a repeated run sends nothing.

use std::fmt;
use std::sync::Arc;

use anyhow::{Result, bail};
use near_crypto::PublicKey;
use near_primitives::account::{AccessKey, AccessKeyPermission};
use near_primitives::action::{
    Action, AddKeyAction, CreateAccountAction, DeployContractAction, DeployGlobalContractAction,
    FunctionCallAction, GlobalContractDeployMode, TransferAction,
};
use near_primitives::hash::CryptoHash;
use near_primitives::types::{AccountId, Gas};
use serde_json::json;

use crate::rpc::AccountState;
use near_token::NearToken;

use crate::target::{Target, YOCTO_PER_NEAR};

/// Gas for the registry's init call.
const INIT_GAS: Gas = Gas::from_teragas(30);

/// The two binaries, with their hashes.
#[derive(Clone)]
pub struct Artifacts {
    pub pack: Arc<[u8]>,
    pub registry: Arc<[u8]>,
}

impl fmt::Debug for Artifacts {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "pack {} ({} bytes), registry {} ({} bytes)",
            self.pack_hash(),
            self.pack.len(),
            self.registry_hash(),
            self.registry.len()
        )
    }
}

impl Artifacts {
    #[must_use]
    pub fn pack_hash(&self) -> CryptoHash {
        CryptoHash::hash_bytes(&self.pack)
    }

    #[must_use]
    pub fn registry_hash(&self) -> CryptoHash {
        CryptoHash::hash_bytes(&self.registry)
    }
}

/// What the chain holds now.
#[derive(Debug, Clone)]
pub struct Observed {
    pub root: RootState,
    pub registry: Option<AccountState>,
    pub registry_key_ok: bool,
    pub pack_published: bool,
}

/// Whether the root can sign the deploy.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RootState {
    Missing,
    WithoutDeployerKey,
    Ready,
}

/// One transaction of the deploy.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Step {
    /// `root` creates the registry account, funds it and gives it the deployer key.
    CreateRegistry,
    /// `root` publishes the pack code as an immutable global contract under its hash.
    PublishPackCode,
    /// The registry account deploys the registry code and runs its init.
    DeployRegistry,
}

/// The NEAR the protocol burns per byte of a global contract (protocol 77 and later).
pub const GLOBAL_CODE_COST_PER_BYTE: NearToken = NearToken::from_yoctonear(YOCTO_PER_NEAR / 10_000);

impl Step {
    /// Signer and receiver of this step's transaction.
    #[must_use]
    pub fn accounts<'a>(&self, target: &'a Target) -> (&'a AccountId, &'a AccountId) {
        match self {
            Self::CreateRegistry => (&target.root, &target.registry),
            Self::PublishPackCode => (&target.root, &target.root),
            Self::DeployRegistry => (&target.registry, &target.registry),
        }
    }

    /// The actions of this step.
    #[must_use]
    pub fn actions(
        &self,
        target: &Target,
        artifacts: &Artifacts,
        deployer: &PublicKey,
    ) -> Vec<Action> {
        match self {
            Self::CreateRegistry => vec![
                Action::CreateAccount(CreateAccountAction {}),
                Action::Transfer(TransferAction {
                    deposit: target.registry_funding,
                }),
                Action::AddKey(Box::new(AddKeyAction {
                    public_key: deployer.clone(),
                    access_key: AccessKey {
                        nonce: 0,
                        permission: AccessKeyPermission::FullAccess,
                    },
                })),
            ],
            Self::PublishPackCode => {
                vec![Action::DeployGlobalContract(DeployGlobalContractAction {
                    code: artifacts.pack.clone(),
                    deploy_mode: GlobalContractDeployMode::CodeHash,
                })]
            }
            Self::DeployRegistry => vec![
                Action::DeployContract(DeployContractAction {
                    code: artifacts.registry.to_vec(),
                }),
                Action::FunctionCall(Box::new(FunctionCallAction {
                    method_name: "new".to_owned(),
                    args: init_args(target, artifacts).into_bytes(),
                    gas: INIT_GAS,
                    deposit: NearToken::from_yoctonear(0),
                })),
            ],
        }
    }

    /// A one-line description for the dry run, with what it costs.
    #[must_use]
    pub fn describe(&self, target: &Target, artifacts: &Artifacts) -> String {
        match self {
            Self::CreateRegistry => format!(
                "{} creates {} with {} NEAR and the deployer key (full access)",
                target.root,
                target.registry,
                format_near(target.registry_funding)
            ),
            Self::PublishPackCode => format!(
                "{} publishes the pack code under hash {} ({} bytes, burns {} NEAR)",
                target.root,
                artifacts.pack_hash(),
                artifacts.pack.len(),
                format_near(publish_cost(artifacts.pack.len()))
            ),
            Self::DeployRegistry => format!(
                "{} deploys registry code {} ({} bytes) and calls new({})",
                target.registry,
                artifacts.registry_hash(),
                artifacts.registry.len(),
                init_args(target, artifacts)
            ),
        }
    }
}

/// NEAR burned to publish `bytes` of global code.
#[must_use]
pub fn publish_cost(bytes: usize) -> NearToken {
    GLOBAL_CODE_COST_PER_BYTE.saturating_mul(u128::try_from(bytes).unwrap_or(u128::MAX))
}

/// The registry's init arguments.
#[must_use]
pub fn init_args(target: &Target, artifacts: &Artifacts) -> String {
    json!({
        "guardian": target.guardian,
        "pack_code_hash": artifacts.pack_hash().to_string(),
        "profile": target.profile,
    })
    .to_string()
}

/// Every step still needed, in order.
///
/// # Errors
/// When the root is missing or lacks the deployer key, or the registry account already runs
/// different code or cannot be signed for.
pub fn plan(target: &Target, artifacts: &Artifacts, observed: &Observed) -> Result<Vec<Step>> {
    match observed.root {
        RootState::Missing => bail!("{} does not exist; register it first", target.root),
        RootState::WithoutDeployerKey => bail!(
            "{} does not hold the deployer key as a full-access key",
            target.root
        ),
        RootState::Ready => {}
    }
    let mut steps = Vec::new();
    if !observed.pack_published {
        steps.push(Step::PublishPackCode);
    }
    match &observed.registry {
        None => {
            steps.push(Step::CreateRegistry);
            steps.push(Step::DeployRegistry);
        }
        Some(account) if account.code_hash == artifacts.registry_hash() => {}
        Some(account) if account.code_hash == CryptoHash::default() => {
            if !observed.registry_key_ok {
                bail!(
                    "{} exists without code and without the deployer key",
                    target.registry
                );
            }
            steps.push(Step::DeployRegistry);
        }
        Some(account) => bail!(
            "{} already runs code {}; a registry is never redeployed in place, deploy a new one",
            target.registry,
            account.code_hash
        ),
    }
    Ok(steps)
}

/// An amount as NEAR with four decimals, `1.2345`.
#[must_use]
pub fn format_near(amount: NearToken) -> String {
    let yocto = amount.as_yoctonear();
    let whole = yocto / YOCTO_PER_NEAR;
    let frac = (yocto % YOCTO_PER_NEAR) / (YOCTO_PER_NEAR / 10_000);
    format!("{whole}.{frac:04}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::target::Env;

    fn artifacts() -> Artifacts {
        Artifacts {
            pack: Arc::from(vec![1u8; 100]),
            registry: Arc::from(vec![2u8; 200]),
        }
    }

    fn target() -> Target {
        Target::for_env(Env::Staging, "mosaec.near").unwrap()
    }

    fn fresh() -> Observed {
        Observed {
            root: RootState::Ready,
            registry: None,
            registry_key_ok: false,
            pack_published: false,
        }
    }

    #[test]
    fn fresh_chain_needs_every_step() {
        assert_eq!(
            plan(&target(), &artifacts(), &fresh()).unwrap(),
            vec![
                Step::PublishPackCode,
                Step::CreateRegistry,
                Step::DeployRegistry
            ]
        );
    }

    #[test]
    fn finished_deploy_needs_nothing() {
        let a = artifacts();
        let mut o = fresh();
        o.pack_published = true;
        o.registry = Some(AccountState {
            code_hash: a.registry_hash(),
            storage_usage: 1,
        });
        assert!(plan(&target(), &a, &o).unwrap().is_empty());
    }

    #[test]
    fn half_done_deploy_resumes() {
        let mut o = fresh();
        o.pack_published = true;
        o.registry = Some(AccountState {
            code_hash: CryptoHash::default(),
            storage_usage: 1,
        });
        o.registry_key_ok = true;
        assert_eq!(
            plan(&target(), &artifacts(), &o).unwrap(),
            vec![Step::DeployRegistry]
        );
    }

    #[test]
    fn refuses_unsafe_states() {
        let mut o = fresh();
        o.root = RootState::WithoutDeployerKey;
        assert!(plan(&target(), &artifacts(), &o).is_err());
        let mut o = fresh();
        o.root = RootState::Missing;
        assert!(plan(&target(), &artifacts(), &o).is_err());
        let mut o = fresh();
        o.registry = Some(AccountState {
            code_hash: CryptoHash::hash_bytes(b"other"),
            storage_usage: 1,
        });
        assert!(plan(&target(), &artifacts(), &o).is_err());
    }

    #[test]
    fn staging_targets() {
        let t = target();
        assert_eq!(t.registry.as_str(), "staging.mosaec.near");
        assert_eq!(t.profile, "Staging");
        let p = Target::for_env(Env::Production, "mosaec.near").unwrap();
        assert_eq!(p.registry.as_str(), "v0.mosaec.near");
    }

    #[test]
    fn costs_and_formatting() {
        assert_eq!(format_near(publish_cost(195_143)), "19.5143");
        assert_eq!(format_near(NearToken::from_near(5)), "5.0000");
        let args = init_args(&target(), &artifacts());
        assert!(args.contains("\"profile\":\"Staging\""));
    }
}
