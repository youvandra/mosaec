//! Idempotent deploy of the Mosaec contracts to mainnet or testnet.
//!
//! `observe` reads the chain, `plan` decides the missing steps, `apply` sends them one by one and
//! `verify` checks the result. A dry run stops after `plan`. On testnet the same run also deploys
//! the mainnet verifier bytes and the test tokens, and `fund` credits test tokens to an account.
//! The sandbox tests drive these functions, so the deploy path runs in CI before any network.

pub mod keychain;
pub mod plan;
pub mod rpc;
pub mod target;

use std::path::Path;
use std::sync::Arc;

use anyhow::{Context, Result, bail, ensure};
use near_crypto::PublicKey;
use near_primitives::action::{Action, FunctionCallAction};
use near_primitives::types::{AccountId, Gas};
use near_token::NearToken;
use serde_json::json;

use crate::keychain::DeployKey;
use crate::plan::{Artifacts, Observed, RootState, Slot, SlotState, Step};
use crate::rpc::{Rpc, Sent};
use crate::target::Target;

/// Gas for a test-token deposit into the verifier.
const FUND_GAS: Gas = Gas::from_teragas(100);

/// Reads the binaries from the contracts workspace at `dir`; testnet also needs the verifier and
/// token binaries pinned in `res/`.
///
/// # Errors
/// When a needed file is missing.
pub fn load_artifacts(dir: &Path, target: &Target) -> Result<Artifacts> {
    let read = |p: &str| -> Result<Arc<[u8]>> {
        let path = dir.join(p);
        Ok(Arc::from(
            std::fs::read(&path).with_context(|| format!("reading {}", path.display()))?,
        ))
    };
    Ok(Artifacts {
        pack: read("target/near/mosaec_pack/mosaec_pack.wasm")?,
        registry: read("target/near/mosaec_registry/mosaec_registry.wasm")?,
        verifier: if target.deploys_verifier {
            Some(read("res/intents-0.4.5.wasm")?)
        } else {
            None
        },
        token: if target.tokens.is_empty() {
            None
        } else {
            Some(read("res/fungible-token.wasm")?)
        },
    })
}

/// What the chain holds for this target.
///
/// # Errors
/// On RPC failure.
pub async fn observe(
    rpc: &Rpc,
    target: &Target,
    artifacts: &Artifacts,
    slots: &[Slot],
    deployer: &PublicKey,
) -> Result<Observed> {
    let root = match rpc.account(&target.root).await? {
        None => RootState::Missing,
        Some(_) if rpc.has_full_access(&target.root, deployer).await? => RootState::Ready,
        Some(_) => RootState::WithoutDeployerKey,
    };
    let mut states = Vec::with_capacity(slots.len());
    for slot in slots {
        let account = rpc.account(&slot.account).await?;
        let key_ok = account.is_some() && rpc.has_full_access(&slot.account, deployer).await?;
        states.push(SlotState { account, key_ok });
    }
    if !target.deploys_verifier {
        ensure!(
            rpc.account(&target.verifier).await?.is_some(),
            "verifier {} does not exist on this network",
            target.verifier
        );
    }
    Ok(Observed {
        root,
        slots: states,
        pack_published: rpc.global_code_exists(artifacts.pack_hash()).await?,
    })
}

/// Sends `steps` in order and returns each transaction hash. Stops at the first failure.
///
/// # Errors
/// When a transaction fails.
pub async fn apply(
    rpc: &Rpc,
    target: &Target,
    artifacts: &Artifacts,
    slots: &[Slot],
    key: &DeployKey,
    steps: &[Step],
) -> Result<Vec<(Step, Sent)>> {
    let deployer = key.public_key();
    let mut sent = Vec::new();
    for step in steps {
        let (signer_id, receiver) = step.accounts(target, slots);
        let tx = rpc
            .send(
                &key.signer_for(signer_id),
                receiver,
                step.actions(artifacts, slots, &deployer),
            )
            .await
            .with_context(|| step.describe(target, artifacts, slots))?;
        sent.push((step.clone(), tx));
    }
    Ok(sent)
}

/// Checks every slot's code and the registry's settings: pack code hash, network, verifier and
/// guardian.
///
/// # Errors
/// When anything differs from the target.
pub async fn verify(
    rpc: &Rpc,
    target: &Target,
    artifacts: &Artifacts,
    slots: &[Slot],
) -> Result<()> {
    for slot in slots {
        let account = rpc
            .account(&slot.account)
            .await?
            .with_context(|| format!("{} missing", slot.account))?;
        ensure!(
            account.code_hash == slot.code_hash(),
            "{} runs {}",
            slot.account,
            account.code_hash
        );
    }
    ensure!(
        rpc.global_code_exists(artifacts.pack_hash()).await?,
        "pack code not published"
    );
    let config = rpc.view(&target.registry, "config", &json!({})).await?;
    let expect = [
        ("pack_code_hash", artifacts.pack_hash().to_string()),
        ("network", target.env.network().to_owned()),
        ("verifier", target.verifier.to_string()),
        ("guardian", target.guardian.to_string()),
    ];
    for (field, value) in expect {
        ensure!(
            config[field] == value,
            "registry {field} mismatch: {config}"
        );
    }
    Ok(())
}

/// Credits `amount` (in the token's smallest unit) of the test token for `asset` to `account`'s
/// verifier balance: the root, which holds the supply, deposits it into the verifier for them.
///
/// # Errors
/// On a mainnet target, an asset the target did not deploy, or a failed transaction.
pub async fn fund(
    rpc: &Rpc,
    target: &Target,
    key: &DeployKey,
    asset: &str,
    account: &AccountId,
    amount: u128,
) -> Result<Sent> {
    if !target.deploys_verifier {
        bail!("fund mints test tokens and runs on testnet only");
    }
    let token = target
        .tokens
        .iter()
        .find(|t| t.account.as_str().starts_with(&format!("{asset}.")))
        .with_context(|| format!("no test token `{asset}` in this deploy"))?;
    let args = json!({
        "receiver_id": target.verifier,
        "amount": amount.to_string(),
        "msg": account,
    });
    let action = Action::FunctionCall(Box::new(FunctionCallAction {
        method_name: "ft_transfer_call".to_owned(),
        args: args.to_string().into_bytes(),
        gas: FUND_GAS,
        deposit: NearToken::from_yoctonear(1),
    }));
    rpc.send(&key.signer_for(&target.root), &token.account, vec![action])
        .await
}

/// Deletes the testnet token account for `asset` and returns its NEAR to the root, so the next
/// `apply` recreates it from the current plan. Refuses while the verifier holds any of the token.
///
/// # Errors
/// On a mainnet target, an asset the target did not deploy, a token still held by the verifier,
/// or a failed transaction.
pub async fn delete_test_token(
    rpc: &Rpc,
    target: &Target,
    key: &DeployKey,
    asset: &str,
) -> Result<Sent> {
    if !target.deploys_verifier {
        bail!("delete-token runs on testnet only");
    }
    let token = target
        .tokens
        .iter()
        .find(|t| t.asset == asset)
        .with_context(|| format!("no test token `{asset}` in this deploy"))?;
    let held = rpc
        .view(
            &token.account,
            "ft_balance_of",
            &json!({ "account_id": target.verifier }),
        )
        .await?;
    ensure!(
        held == json!("0"),
        "{} still holds {held} of {}; refusing to delete",
        target.verifier,
        token.account
    );
    rpc.send_delete_account(&key.signer_for(&token.account), &target.root)
        .await
}
