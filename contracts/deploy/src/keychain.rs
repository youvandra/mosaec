//! The deployer key lives in the macOS login keychain, never in a file or the repo.

use std::process::Command;

use anyhow::{Context, Result, bail};
use near_crypto::{InMemorySigner, KeyType, PublicKey, SecretKey, Signer};
use near_primitives::types::AccountId;

/// Keychain service name of the deployer key.
pub const SERVICE: &str = "mosaec-deployer";

fn find(account: &AccountId) -> Result<Option<String>> {
    let out = Command::new("security")
        .args([
            "find-generic-password",
            "-s",
            SERVICE,
            "-a",
            account.as_str(),
            "-w",
        ])
        .output()
        .context("running `security`; the deployer key needs macOS")?;
    if out.status.success() {
        Ok(Some(String::from_utf8(out.stdout)?.trim().to_owned()))
    } else {
        Ok(None)
    }
}

/// The deployer key, held in memory only for the length of one run.
#[derive(Clone)]
pub struct DeployKey(SecretKey);

impl std::fmt::Debug for DeployKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "DeployKey({})", self.public_key())
    }
}

impl DeployKey {
    #[must_use]
    pub const fn new(secret: SecretKey) -> Self {
        Self(secret)
    }

    #[must_use]
    pub fn public_key(&self) -> PublicKey {
        self.0.public_key()
    }

    /// A signer for `account` with this key.
    #[must_use]
    pub fn signer_for(&self, account: &AccountId) -> Signer {
        InMemorySigner::from_secret_key(account.clone(), self.0.clone())
    }
}

/// The deployer key for `account` from the keychain.
///
/// # Errors
/// When no key is stored or it does not parse.
pub fn load(account: &AccountId) -> Result<DeployKey> {
    let secret = find(account)?.with_context(|| {
        format!("no `{SERVICE}` key for {account} in the keychain; run `mosaec-deploy key-new`")
    })?;
    Ok(DeployKey::new(secret.parse()?))
}

/// Creates a new ed25519 key for `account` in the keychain and returns its public key.
/// Refuses to replace an existing key.
///
/// # Errors
/// When a key already exists or `security` fails.
pub fn create(account: &AccountId) -> Result<PublicKey> {
    if find(account)?.is_some() {
        bail!("a `{SERVICE}` key for {account} already exists; it is never replaced");
    }
    let secret = SecretKey::from_random(KeyType::ED25519);
    let status = Command::new("security")
        .args([
            "add-generic-password",
            "-s",
            SERVICE,
            "-a",
            account.as_str(),
            "-w",
            &secret.to_string(),
        ])
        .status()?;
    if !status.success() {
        bail!("`security add-generic-password` failed");
    }
    Ok(secret.public_key())
}
