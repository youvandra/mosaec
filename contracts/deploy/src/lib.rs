//! Idempotent deploy of the Mosaec pack code and registry.
//!
//! `observe` reads the chain, `plan` decides the missing steps, `apply` sends them one by one and
//! `verify` checks the result. A dry run stops after `plan`. The sandbox tests drive the same
//! functions, so the deploy path is exercised before it ever touches mainnet.

pub mod keychain;
pub mod plan;
pub mod rpc;
pub mod target;

use std::sync::Arc;

use anyhow::{Context, Result, ensure};
use near_crypto::PublicKey;
use near_primitives::hash::CryptoHash;

use crate::keychain::DeployKey;
use crate::plan::{Artifacts, Observed, RootState, Step};
use crate::rpc::{Rpc, Sent};
use crate::target::Target;

/// Reads the two binaries.
///
/// # Errors
/// When either file is missing.
pub fn load_artifacts(pack: &str, registry: &str) -> Result<Artifacts> {
    let read = |p: &str| -> Result<Arc<[u8]>> {
        Ok(Arc::from(
            std::fs::read(p).with_context(|| format!("reading {p}"))?,
        ))
    };
    Ok(Artifacts {
        pack: read(pack)?,
        registry: read(registry)?,
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
    deployer: &PublicKey,
) -> Result<Observed> {
    let root = rpc.account(&target.root).await?;
    let registry = rpc.account(&target.registry).await?;
    Ok(Observed {
        root: match root {
            None => RootState::Missing,
            Some(_) if rpc.has_full_access(&target.root, deployer).await? => RootState::Ready,
            Some(_) => RootState::WithoutDeployerKey,
        },
        registry_key_ok: registry.is_some()
            && rpc.has_full_access(&target.registry, deployer).await?,
        registry,
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
    key: &DeployKey,
    steps: &[Step],
) -> Result<Vec<(Step, Sent)>> {
    let deployer = key.public_key();
    let mut sent = Vec::new();
    for step in steps {
        let (signer_id, receiver) = step.accounts(target);
        let tx = rpc
            .send(
                &key.signer_for(signer_id),
                receiver,
                step.actions(target, artifacts, &deployer),
            )
            .await
            .with_context(|| step.describe(target, artifacts))?;
        sent.push((step.clone(), tx));
    }
    Ok(sent)
}

/// Checks the deployed registry: code hash, pack code hash, profile and guardian.
///
/// # Errors
/// When any of them differs from the target.
pub async fn verify(rpc: &Rpc, target: &Target, artifacts: &Artifacts) -> Result<()> {
    let account = rpc
        .account(&target.registry)
        .await?
        .context("registry account missing")?;
    ensure!(
        account.code_hash == artifacts.registry_hash(),
        "registry runs {}",
        account.code_hash
    );
    ensure!(
        rpc.global_code_exists(artifacts.pack_hash()).await?,
        "pack code not published"
    );
    let config = rpc
        .view(&target.registry, "config", &serde_json::json!({}))
        .await?;
    ensure!(
        config["pack_code_hash"] == artifacts.pack_hash().to_string(),
        "pack hash mismatch: {config}"
    );
    ensure!(
        config["profile"] == target.profile,
        "profile mismatch: {config}"
    );
    ensure!(
        config["guardian"] == target.guardian.as_str(),
        "guardian mismatch: {config}"
    );
    ensure!(
        account.code_hash != CryptoHash::default(),
        "registry has no code"
    );
    Ok(())
}
