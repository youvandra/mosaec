//! What a deploy still has to do, decided from what the chain already holds. `plan` is pure, so
//! the same inputs always print and send the same steps, and a repeated run sends nothing.
//!
//! Every contract account is a slot: `root` creates and funds it with the deployer key, then the
//! account deploys its own code and runs its own init, so `#[private]` inits work unchanged.

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
use near_token::NearToken;
use serde_json::json;

use crate::rpc::AccountState;
use crate::target::{Target, YOCTO_PER_NEAR};

/// Gas for each init call in a deploy step.
const INIT_GAS: Gas = Gas::from_teragas(30);
/// Storage deposit a reference NEP-141 token asks to register one holder.
const FT_STORAGE_DEPOSIT: NearToken = NearToken::from_millinear(2);
/// Supply minted to the root on a test token; large enough never to run out.
const TEST_TOKEN_SUPPLY: u128 = 1_000_000_000_000_000_000_000_000_000;
/// The NEAR the protocol burns per byte of a global contract (protocol 77 and later).
pub const GLOBAL_CODE_COST_PER_BYTE: NearToken = NearToken::from_yoctonear(YOCTO_PER_NEAR / 10_000);
/// The NEAR an account locks per byte of storage.
pub const STORAGE_COST_PER_BYTE: NearToken = NearToken::from_yoctonear(YOCTO_PER_NEAR / 100_000);

/// The binaries a deploy uses.
#[derive(Clone)]
pub struct Artifacts {
    pub pack: Arc<[u8]>,
    pub registry: Arc<[u8]>,
    /// Mainnet `intents.near` bytes, deployed on testnet only.
    pub verifier: Option<Arc<[u8]>>,
    /// Reference NEP-141 token, deployed on testnet only.
    pub token: Option<Arc<[u8]>>,
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

/// One init call a slot runs on itself after deploying its code.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InitCall {
    pub method: &'static str,
    pub args: String,
    pub deposit: NearToken,
}

/// A contract account the deploy owns.
#[derive(Debug, Clone)]
pub struct Slot {
    pub label: &'static str,
    pub account: AccountId,
    pub code: Arc<[u8]>,
    pub funding: NearToken,
    pub init: Vec<InitCall>,
}

impl Slot {
    #[must_use]
    pub fn code_hash(&self) -> CryptoHash {
        CryptoHash::hash_bytes(&self.code)
    }
}

/// Every slot of a target, in deploy order: verifier, test tokens, registry.
///
/// # Errors
/// When a testnet target lacks the verifier or token binary.
pub fn slots(target: &Target, artifacts: &Artifacts) -> Result<Vec<Slot>> {
    let mut slots = Vec::new();
    if target.deploys_verifier {
        let Some(code) = artifacts.verifier.clone() else {
            bail!("testnet deploy needs the verifier wasm");
        };
        slots.push(Slot {
            label: "verifier",
            account: target.verifier.clone(),
            code,
            funding: target.verifier_funding,
            init: vec![InitCall {
                method: "new",
                args: verifier_init_args(target),
                deposit: NearToken::from_yoctonear(0),
            }],
        });
    }
    for token in &target.tokens {
        let Some(code) = artifacts.token.clone() else {
            bail!("testnet deploy needs the token wasm");
        };
        slots.push(Slot {
            label: "test token",
            account: token.account.clone(),
            code,
            funding: target.token_funding,
            init: vec![
                InitCall {
                    method: "new_default_meta",
                    args: json!({ "owner_id": target.root, "total_supply": TEST_TOKEN_SUPPLY.to_string() })
                        .to_string(),
                    deposit: NearToken::from_yoctonear(0),
                },
                InitCall {
                    method: "storage_deposit",
                    args: json!({ "account_id": target.verifier }).to_string(),
                    deposit: FT_STORAGE_DEPOSIT,
                },
            ],
        });
    }
    slots.push(Slot {
        label: "registry",
        account: target.registry.clone(),
        code: artifacts.registry.clone(),
        funding: target.registry_funding,
        init: vec![InitCall {
            method: "new",
            args: registry_init_args(target, artifacts),
            deposit: NearToken::from_yoctonear(0),
        }],
    });
    Ok(slots)
}

/// The registry's init arguments.
#[must_use]
pub fn registry_init_args(target: &Target, artifacts: &Artifacts) -> String {
    json!({
        "guardian": target.guardian,
        "pack_code_hash": artifacts.pack_hash().to_string(),
        "network": target.env.network(),
        "verifier": target.verifier,
    })
    .to_string()
}

/// The testnet verifier's init: no fee, and the root holds every admin role, so pauses and locks
/// can be rehearsed.
fn verifier_init_args(target: &Target) -> String {
    let root = [target.root.as_str()];
    json!({ "config": {
        "wnear_id": "wrap.testnet",
        "fees": { "fee": 0, "fee_collector": target.verifier },
        "roles": {
            "super_admins": root,
            "grantees": {
                "DAO": root,
                "PauseManager": root,
                "UnpauseManager": root,
                "UnrestrictedAccountLocker": root,
                "UnrestrictedAccountUnlocker": root,
            },
        },
    }})
    .to_string()
}

/// What the chain holds for one slot.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SlotState {
    pub account: Option<AccountState>,
    pub key_ok: bool,
}

/// What the chain holds now.
#[derive(Debug, Clone)]
pub struct Observed {
    pub root: RootState,
    /// Same order as `slots`.
    pub slots: Vec<SlotState>,
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
    /// `root` publishes the pack code as an immutable global contract under its hash.
    PublishPackCode,
    /// `root` creates slot `n`'s account, funds it and gives it the deployer key.
    Create(usize),
    /// Slot `n` deploys its code and runs its init calls.
    Deploy(usize),
}

impl Step {
    /// Signer and receiver of this step's transaction.
    #[must_use]
    pub fn accounts<'a>(
        &self,
        target: &'a Target,
        slots: &'a [Slot],
    ) -> (&'a AccountId, &'a AccountId) {
        match self {
            Self::PublishPackCode => (&target.root, &target.root),
            Self::Create(i) => (&target.root, &slots[*i].account),
            Self::Deploy(i) => (&slots[*i].account, &slots[*i].account),
        }
    }

    /// The actions of this step.
    #[must_use]
    pub fn actions(
        &self,
        artifacts: &Artifacts,
        slots: &[Slot],
        deployer: &PublicKey,
    ) -> Vec<Action> {
        match self {
            Self::PublishPackCode => {
                vec![Action::DeployGlobalContract(DeployGlobalContractAction {
                    code: artifacts.pack.clone(),
                    deploy_mode: GlobalContractDeployMode::CodeHash,
                })]
            }
            Self::Create(i) => vec![
                Action::CreateAccount(CreateAccountAction {}),
                Action::Transfer(TransferAction {
                    deposit: slots[*i].funding,
                }),
                Action::AddKey(Box::new(AddKeyAction {
                    public_key: deployer.clone(),
                    access_key: AccessKey {
                        nonce: 0,
                        permission: AccessKeyPermission::FullAccess,
                    },
                })),
            ],
            Self::Deploy(i) => {
                let slot = &slots[*i];
                let mut actions = vec![Action::DeployContract(DeployContractAction {
                    code: slot.code.to_vec(),
                })];
                actions.extend(slot.init.iter().map(|call| {
                    Action::FunctionCall(Box::new(FunctionCallAction {
                        method_name: call.method.to_owned(),
                        args: call.args.clone().into_bytes(),
                        gas: INIT_GAS,
                        deposit: call.deposit,
                    }))
                }));
                actions
            }
        }
    }

    /// A one-line description for the dry run, with what it costs.
    #[must_use]
    pub fn describe(&self, target: &Target, artifacts: &Artifacts, slots: &[Slot]) -> String {
        match self {
            Self::PublishPackCode => format!(
                "{} publishes the pack code under hash {} ({} bytes, burns {} NEAR)",
                target.root,
                artifacts.pack_hash(),
                artifacts.pack.len(),
                format_near(publish_cost(artifacts.pack.len()))
            ),
            Self::Create(i) => format!(
                "{} creates {} ({}) with {} NEAR and the deployer key",
                target.root,
                slots[*i].account,
                slots[*i].label,
                format_near(slots[*i].funding)
            ),
            Self::Deploy(i) => {
                let slot = &slots[*i];
                let calls: Vec<String> = slot
                    .init
                    .iter()
                    .map(|c| format!("{}({})", c.method, c.args))
                    .collect();
                format!(
                    "{} deploys {} code {} ({} bytes, locks {} NEAR) and calls {}",
                    slot.account,
                    slot.label,
                    slot.code_hash(),
                    slot.code.len(),
                    format_near(storage_cost(slot.code.len())),
                    calls.join(", ")
                )
            }
        }
    }
}

/// NEAR burned to publish `bytes` of global code.
#[must_use]
pub fn publish_cost(bytes: usize) -> NearToken {
    GLOBAL_CODE_COST_PER_BYTE.saturating_mul(u128::try_from(bytes).unwrap_or(u128::MAX))
}

/// NEAR locked to store `bytes` in an account.
#[must_use]
pub fn storage_cost(bytes: usize) -> NearToken {
    STORAGE_COST_PER_BYTE.saturating_mul(u128::try_from(bytes).unwrap_or(u128::MAX))
}

/// Every step still needed, in order.
///
/// # Errors
/// When the root is missing or lacks the deployer key, or a slot account already runs different
/// code or cannot be signed for.
pub fn plan(slots: &[Slot], observed: &Observed, root: &AccountId) -> Result<Vec<Step>> {
    match observed.root {
        RootState::Missing => bail!("{root} does not exist; register it first"),
        RootState::WithoutDeployerKey => {
            bail!("{root} does not hold the deployer key as a full-access key")
        }
        RootState::Ready => {}
    }
    let mut steps = Vec::new();
    if !observed.pack_published {
        steps.push(Step::PublishPackCode);
    }
    for (i, (slot, state)) in slots.iter().zip(&observed.slots).enumerate() {
        match &state.account {
            None => {
                steps.push(Step::Create(i));
                steps.push(Step::Deploy(i));
            }
            Some(account) if account.code_hash == slot.code_hash() => {}
            Some(account) if account.code_hash == CryptoHash::default() => {
                if !state.key_ok {
                    bail!(
                        "{} exists without code and without the deployer key",
                        slot.account
                    );
                }
                steps.push(Step::Deploy(i));
            }
            Some(account) => bail!(
                "{} already runs code {}; a deployed contract is never replaced in place",
                slot.account,
                account.code_hash
            ),
        }
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

/// Total NEAR the remaining steps take from the root: burned publish plus every new account's
/// funding.
#[must_use]
pub fn root_spend(steps: &[Step], artifacts: &Artifacts, slots: &[Slot]) -> NearToken {
    steps
        .iter()
        .fold(NearToken::from_yoctonear(0), |sum, step| {
            sum.saturating_add(match step {
                Step::PublishPackCode => publish_cost(artifacts.pack.len()),
                Step::Create(i) => slots[*i].funding,
                Step::Deploy(_) => NearToken::from_yoctonear(0),
            })
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::target::{DEFAULT_TEST_ASSETS, Env};

    fn artifacts() -> Artifacts {
        Artifacts {
            pack: Arc::from(vec![1u8; 100]),
            registry: Arc::from(vec![2u8; 200]),
            verifier: Some(Arc::from(vec![3u8; 300])),
            token: Some(Arc::from(vec![4u8; 50])),
        }
    }

    fn testnet() -> Target {
        Target::for_env(Env::Testnet, None, &DEFAULT_TEST_ASSETS).unwrap()
    }

    fn fresh(n: usize) -> Observed {
        Observed {
            root: RootState::Ready,
            slots: vec![
                SlotState {
                    account: None,
                    key_ok: false
                };
                n
            ],
            pack_published: false,
        }
    }

    #[test]
    fn testnet_slots_in_order() {
        let s = slots(&testnet(), &artifacts()).unwrap();
        let ids: Vec<&str> = s.iter().map(|s| s.account.as_str()).collect();
        assert_eq!(
            ids,
            [
                "intents.mosaec.testnet",
                "zec.mosaec.testnet",
                "usdc.mosaec.testnet",
                "v0.mosaec.testnet"
            ]
        );
        assert!(
            s[3].init[0]
                .args
                .contains("\"verifier\":\"intents.mosaec.testnet\"")
        );
        assert!(s[3].init[0].args.contains("\"network\":\"Testnet\""));
    }

    #[test]
    fn mainnet_deploys_only_the_registry() {
        let t = Target::for_env(Env::Mainnet, None, &[]).unwrap();
        let s = slots(&t, &artifacts()).unwrap();
        assert_eq!(s.len(), 1);
        assert_eq!(s[0].account.as_str(), "v0.mosaec.near");
        assert!(s[0].init[0].args.contains("\"verifier\":\"intents.near\""));
    }

    #[test]
    fn fresh_chain_needs_every_step() {
        let s = slots(&testnet(), &artifacts()).unwrap();
        let steps = plan(&s, &fresh(s.len()), &testnet().root).unwrap();
        assert_eq!(steps.len(), 1 + 2 * s.len());
        assert_eq!(steps[0], Step::PublishPackCode);
    }

    #[test]
    fn finished_deploy_needs_nothing() {
        let a = artifacts();
        let s = slots(&testnet(), &a).unwrap();
        let mut o = fresh(s.len());
        o.pack_published = true;
        for (state, slot) in o.slots.iter_mut().zip(&s) {
            state.account = Some(AccountState {
                code_hash: slot.code_hash(),
                storage_usage: 1,
            });
        }
        assert!(plan(&s, &o, &testnet().root).unwrap().is_empty());
    }

    #[test]
    fn half_done_deploy_resumes() {
        let s = slots(&testnet(), &artifacts()).unwrap();
        let mut o = fresh(s.len());
        o.pack_published = true;
        for (state, slot) in o.slots.iter_mut().zip(&s).take(3) {
            state.account = Some(AccountState {
                code_hash: slot.code_hash(),
                storage_usage: 1,
            });
        }
        o.slots[3] = SlotState {
            account: Some(AccountState {
                code_hash: CryptoHash::default(),
                storage_usage: 1,
            }),
            key_ok: true,
        };
        assert_eq!(
            plan(&s, &o, &testnet().root).unwrap(),
            vec![Step::Deploy(3)]
        );
    }

    #[test]
    fn refuses_unsafe_states() {
        let s = slots(&testnet(), &artifacts()).unwrap();
        let root = testnet().root;
        let mut o = fresh(s.len());
        o.root = RootState::WithoutDeployerKey;
        assert!(plan(&s, &o, &root).is_err());
        let mut o = fresh(s.len());
        o.slots[0].account = Some(AccountState {
            code_hash: CryptoHash::hash_bytes(b"other"),
            storage_usage: 1,
        });
        assert!(plan(&s, &o, &root).is_err());
    }

    #[test]
    fn costs_and_formatting() {
        assert_eq!(format_near(publish_cost(195_143)), "19.5143");
        assert_eq!(format_near(storage_cost(1_297_551)), "12.9755");
        assert_eq!(format_near(NearToken::from_near(5)), "5.0000");
        assert!(Target::for_env(Env::Testnet, None, &["doge"]).is_err());
    }
}
