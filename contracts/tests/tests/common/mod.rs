//! Sandbox worlds for the Mosaec flows. Mainnet: the `intents.near` v0.4.5 bytes and NEP-141
//! tokens patched in at their mainnet ids, the tool deploying the pack code and `v0.mosaec.near`.
//! Testnet: an empty `mosaec.testnet` root from which the tool deploys everything, exactly as it
//! does on the real testnet. Accounts outside `test.near` are written with state patches.

#![allow(dead_code, reason = "each test file uses a different subset")]

use std::path::PathBuf;

use anyhow::{Context, Result, ensure};
use mosaec_deploy::keychain::DeployKey;
use mosaec_deploy::plan::plan;
use mosaec_deploy::rpc::Rpc;
use mosaec_deploy::target::{DEFAULT_TEST_ASSETS, Env, Target};
use mosaec_shared::constants::{MINT_DEPOSIT, TESTNET_USDC, TESTNET_ZEC, USDC, ZEC};
use near_workspaces::network::Sandbox;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::{AccessKey, AccountDetailsPatch, Gas, KeyType, NearToken, SecretKey};
use near_workspaces::{Account, AccountId, Worker};
use serde_json::{Value, json};

pub const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);
pub const MAX_GAS: Gas = Gas::from_tgas(300);
const PATCH_VISIBLE_ATTEMPTS: u32 = 100;
const PATCH_VISIBLE_POLL_MS: u64 = 200;

/// Workspace root, so tests find the built binaries wherever cargo runs them from.
fn contracts_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..")
}

fn read(path: &str) -> Result<Vec<u8>> {
    let full = contracts_dir().join(path);
    std::fs::read(&full).with_context(|| {
        format!(
            "missing {}; build it with `cargo near build non-reproducible-wasm` in contracts/pack and contracts/registry",
            full.display()
        )
    })
}

/// Account id of the token part of a `nep141:<account>` verifier token id.
pub fn token_account(token_id: &str) -> AccountId {
    token_id
        .strip_prefix("nep141:")
        .and_then(|id| id.parse().ok())
        .unwrap_or_else(|| panic!("not a nep141 id: {token_id}"))
}

/// One epoch covers the longest term the tests fast-forward through, so a jump costs one epoch.
const SANDBOX_EPOCH_LENGTH: u64 = 100_000_000;

pub struct World {
    /// Keeps the node alive for the world's lifetime.
    _node: near_sandbox::Sandbox,
    pub worker: Worker<Sandbox>,
    pub key: SecretKey,
    pub verifier: Account,
    pub root: Account,
    pub registry: Account,
    pub pack_code_hash: String,
    /// The deploy target, for tool calls such as `fund`.
    pub target: Target,
    /// Verifier token ids of the collateral and settlement tokens on this world's network.
    pub zec_id: &'static str,
    pub usdc_id: &'static str,
}

impl World {
    /// Mainnet as it stands: the verifier at `intents.near` and tokens at their mainnet ids are
    /// patched in, and the tool deploys only the pack code and `v0.mosaec.near`.
    pub async fn new() -> Result<Self> {
        let (node, worker) = start_sandbox().await?;
        let key = SecretKey::from_random(KeyType::ED25519);
        let verifier = patch_account(
            &worker,
            &key,
            "intents.near",
            Some(&read("res/intents-0.4.5.wasm")?),
        )
        .await?;
        let admin = ["intents.near"];
        let config = json!({ "config": {
            "wnear_id": "wrap.near",
            "fees": { "fee": 0, "fee_collector": "intents.near" },
            "roles": { "super_admins": admin, "grantees": {
                "DAO": admin,
                "PauseManager": admin,
                "UnpauseManager": admin,
                "UnrestrictedAccountLocker": admin,
                "UnrestrictedAccountUnlocker": admin
            }}
        }});
        checked(
            verifier
                .call(verifier.id(), "new")
                .args_json(config)
                .max_gas()
                .transact()
                .await?,
        )?;
        let ft = read("res/fungible-token.wasm")?;
        new_token(&worker, &key, ZEC, &ft, &verifier).await?;
        new_token(&worker, &key, USDC, &ft, &verifier).await?;
        let root = patch_account(&worker, &key, "mosaec.near", None).await?;
        let target = Target::for_env(Env::Mainnet, None, &[])?;
        let (registry, pack_code_hash) = deploy_with_tool(&worker, &key, &target).await?;
        Ok(Self {
            _node: node,
            worker,
            key,
            verifier,
            root,
            registry,
            pack_code_hash,
            target,
            zec_id: ZEC,
            usdc_id: USDC,
        })
    }

    /// Testnet as the tool builds it from an empty root: the verifier copy, the test tokens, the
    /// pack code and `v0.mosaec.testnet`, all through `mosaec-deploy`.
    pub async fn testnet() -> Result<Self> {
        let (node, worker) = start_sandbox().await?;
        let key = SecretKey::from_random(KeyType::ED25519);
        let root = patch_account(&worker, &key, "mosaec.testnet", None).await?;
        let target = Target::for_env(Env::Testnet, None, &DEFAULT_TEST_ASSETS)?;
        let (registry, pack_code_hash) = deploy_with_tool(&worker, &key, &target).await?;
        let verifier = Account::from_secret_key(target.verifier.clone(), key.clone(), &worker);
        Ok(Self {
            _node: node,
            worker,
            key,
            verifier,
            root,
            registry,
            pack_code_hash,
            target,
            zec_id: TESTNET_ZEC,
            usdc_id: TESTNET_USDC,
        })
    }

    pub async fn user(&self) -> Result<Account> {
        Ok(self.worker.dev_create_account().await?)
    }

    /// Credits `amount` of `token_id` to `owner`'s verifier balance. On testnet this is the
    /// tool's `fund`; on the mainnet world the patched token deposits directly.
    pub async fn fund(&self, owner: &Account, token_id: &str, amount: u128) -> Result<()> {
        if self.target.deploys_verifier {
            let asset = token_account(token_id)
                .as_str()
                .split('.')
                .next()
                .unwrap_or_default()
                .to_owned();
            let rpc = Rpc::connect(&self.worker.rpc_addr());
            let key = DeployKey::new(self.key.to_string().parse()?);
            mosaec_deploy::fund(&rpc, &self.target, &key, &asset, owner.id(), amount).await?;
            return Ok(());
        }
        let token =
            Account::from_secret_key(token_account(token_id), self.key.clone(), &self.worker);
        let args = json!({
            "receiver_id": self.verifier.id(),
            "amount": amount.to_string(),
            "msg": owner.id().to_string(),
        });
        checked(
            token
                .call(token.id(), "ft_transfer_call")
                .args_json(args)
                .deposit(ONE_YOCTO)
                .max_gas()
                .transact()
                .await?,
        )?;
        Ok(())
    }

    pub async fn balance(&self, account: &AccountId, token_id: &str) -> Result<u128> {
        let v: String = self
            .worker
            .view(self.verifier.id(), "mt_balance_of")
            .args_json(json!({ "account_id": account, "token_id": token_id }))
            .await?
            .json()?;
        Ok(v.parse()?)
    }

    /// Mints a pack for `owner` and returns its account id.
    pub async fn mint(&self, owner: &Account) -> Result<AccountId> {
        let before: u64 = self.view_registry("config", json!({})).await?["packs_created"]
            .as_u64()
            .unwrap_or(0);
        let res = owner
            .call(self.registry.id(), "mint")
            .deposit(MINT_DEPOSIT)
            .gas(Gas::from_tgas(100))
            .transact()
            .await?;
        checked(res)?;
        Ok(format!("{before}.{}", self.registry.id()).parse()?)
    }

    pub async fn transfer_in_verifier(
        &self,
        from: &Account,
        to: &AccountId,
        token_id: &str,
        amount: u128,
    ) -> Result<ExecutionFinalResult> {
        let args = json!({ "receiver_id": to, "token_id": token_id, "amount": amount.to_string() });
        Ok(from
            .call(self.verifier.id(), "mt_transfer")
            .args_json(args)
            .deposit(ONE_YOCTO)
            .max_gas()
            .transact()
            .await?)
    }

    pub async fn transfer_call(
        &self,
        from: &Account,
        to: &AccountId,
        token_id: &str,
        amount: u128,
        msg: &str,
    ) -> Result<ExecutionFinalResult> {
        let args = json!({ "receiver_id": to, "token_id": token_id, "amount": amount.to_string(), "msg": msg });
        Ok(from
            .call(self.verifier.id(), "mt_transfer_call")
            .args_json(args)
            .deposit(ONE_YOCTO)
            .max_gas()
            .transact()
            .await?)
    }

    pub async fn view_registry(&self, method: &str, args: Value) -> Result<Value> {
        Ok(self
            .worker
            .view(self.registry.id(), method)
            .args_json(args)
            .await?
            .json()?)
    }

    pub async fn position(&self, pack: &AccountId) -> Result<Value> {
        self.view_registry("position_of", json!({ "pack": pack }))
            .await
    }

    pub async fn pack_status(&self, pack: &AccountId) -> Result<Value> {
        Ok(self.worker.view(pack, "status").await?.json()?)
    }

    /// The account with full access to a patched or sub-account id, signed by the world key.
    pub fn as_account(&self, id: &AccountId) -> Account {
        Account::from_secret_key(id.clone(), self.key.clone(), &self.worker)
    }
}

/// A sandbox node with a long epoch, so fast-forwarding days of block time stays fast.
async fn start_sandbox() -> Result<(near_sandbox::Sandbox, Worker<Sandbox>)> {
    let config = near_sandbox::SandboxConfig {
        additional_accounts: vec![near_sandbox::GenesisAccount::default_with_name(
            "registrar".parse()?,
        )],
        additional_genesis: Some(json!({ "epoch_length": SANDBOX_EPOCH_LENGTH })),
        ..Default::default()
    };
    let node = near_sandbox::Sandbox::start_sandbox_with_config(config).await?;
    let worker = near_workspaces::sandbox()
        .rpc_addr(&node.rpc_addr)
        .validator_key(near_workspaces::network::ValidatorKey::HomeDir(
            node.home_dir.path().to_path_buf(),
        ))
        .await?;
    Ok((node, worker))
}

async fn patch_account(
    worker: &Worker<Sandbox>,
    key: &SecretKey,
    id: &str,
    code: Option<&[u8]>,
) -> Result<Account> {
    let id: AccountId = id.parse()?;
    let mut patch = worker
        .patch(&id)
        .account(AccountDetailsPatch::default().balance(NearToken::from_near(5_000)))
        .access_key(key.public_key(), AccessKey::full_access());
    if let Some(code) = code {
        patch = patch.code(code);
    }
    patch.transact().await?;
    Ok(Account::from_secret_key(id, key.clone(), worker))
}

async fn new_token(
    worker: &Worker<Sandbox>,
    key: &SecretKey,
    token_id: &str,
    ft: &[u8],
    verifier: &Account,
) -> Result<Account> {
    let token = patch_account(worker, key, token_account(token_id).as_str(), Some(ft)).await?;
    let init = json!({ "owner_id": token.id(), "total_supply": u128::MAX.to_string() });
    checked(
        token
            .call(token.id(), "new_default_meta")
            .args_json(init)
            .transact()
            .await?,
    )?;
    let reg = json!({ "account_id": verifier.id() });
    checked(
        token
            .call(token.id(), "storage_deposit")
            .args_json(reg)
            .deposit(NearToken::from_millinear(125))
            .transact()
            .await?,
    )?;
    Ok(token)
}

/// Deploys the pack code and the registry with `mosaec-deploy`, the same code path as mainnet,
/// then checks that a second run has nothing left to do.
async fn deploy_with_tool(
    worker: &Worker<Sandbox>,
    key: &SecretKey,
    target: &Target,
) -> Result<(Account, String)> {
    let artifacts = mosaec_deploy::load_artifacts(&contracts_dir(), target)?;
    let slots = mosaec_deploy::plan::slots(target, &artifacts)?;
    let deploy_key = DeployKey::new(key.to_string().parse()?);
    let rpc = Rpc::connect(&worker.rpc_addr());
    wait_until_final(&rpc, &target.root).await?;
    let observed =
        mosaec_deploy::observe(&rpc, target, &artifacts, &slots, &deploy_key.public_key()).await?;
    let steps = plan(&slots, &observed, &target.root)?;
    ensure!(
        steps.len() == 1 + 2 * slots.len(),
        "fresh chain should need every step, got {steps:?}"
    );
    mosaec_deploy::apply(&rpc, target, &artifacts, &slots, &deploy_key, &steps).await?;
    mosaec_deploy::verify(&rpc, target, &artifacts, &slots).await?;
    let again =
        mosaec_deploy::observe(&rpc, target, &artifacts, &slots, &deploy_key.public_key()).await?;
    ensure!(
        plan(&slots, &again, &target.root)?.is_empty(),
        "deploy is not idempotent"
    );
    let registry = Account::from_secret_key(target.registry.clone(), key.clone(), worker);
    Ok((registry, artifacts.pack_hash().to_string()))
}

/// Block time of the latest block, in nanoseconds.
pub async fn now_ns(world: &World) -> Result<u64> {
    Ok(world.worker.view_block().await?.timestamp())
}

/// Advances the sandbox until its block time passes `target_ns`.
pub async fn advance_past(world: &World, target_ns: u64) -> Result<()> {
    loop {
        let now = now_ns(world).await?;
        if now > target_ns {
            return Ok(());
        }
        // The sandbox produces about one block per second of block time; jump in chunks.
        let gap_s = (target_ns - now) / 1_000_000_000 + 1;
        world.worker.fast_forward(gap_s.min(500_000)).await?;
    }
}

/// State patches land in the next block; the deploy tool reads final blocks. Waits until `id`
/// is visible there.
async fn wait_until_final(rpc: &Rpc, id: &AccountId) -> Result<()> {
    for _ in 0..PATCH_VISIBLE_ATTEMPTS {
        if rpc.account(id).await?.is_some() {
            return Ok(());
        }
        tokio::time::sleep(std::time::Duration::from_millis(PATCH_VISIBLE_POLL_MS)).await;
    }
    anyhow::bail!("{id} never became visible at final finality")
}

/// Fails with every receipt failure when the transaction or any receipt failed; for calls whose
/// result is not read further.
pub fn checked(res: ExecutionFinalResult) -> Result<()> {
    ok(res).map(drop)
}

/// Fails with every receipt failure when the transaction or any receipt failed.
pub fn ok(res: ExecutionFinalResult) -> Result<ExecutionFinalResult> {
    let failures: Vec<String> = res
        .receipt_failures()
        .iter()
        .map(|f| format!("{:?}", (*f).clone().into_result()))
        .collect();
    ensure!(
        res.is_success() && failures.is_empty(),
        "transaction failed: {failures:?}\nlogs: {:?}",
        res.logs()
    );
    Ok(res)
}

/// Every NEP-297 event a transaction logged, as JSON.
pub fn events(res: &ExecutionFinalResult) -> Vec<Value> {
    res.logs()
        .iter()
        .filter_map(|l| l.strip_prefix("EVENT_JSON:"))
        .filter_map(|j| serde_json::from_str(j).ok())
        .collect()
}

/// True when some `mosaec` event named `name` was logged.
pub fn has_event(res: &ExecutionFinalResult, name: &str) -> bool {
    events(res)
        .iter()
        .any(|e| e["standard"] == "mosaec" && e["event"] == name)
}

/// The code of a `refused` event, if any.
pub fn refused_code(res: &ExecutionFinalResult) -> Option<String> {
    events(res)
        .iter()
        .find(|e| e["event"] == "refused")
        .and_then(|e| e["data"]["code"].as_str().map(str::to_owned))
}
