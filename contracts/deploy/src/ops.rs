//! Testnet operator actions: test actor accounts under the root, and signed calls from any account
//! whose key is in the keychain. Rehearsals of the pawn flows run through these.

use anyhow::{Result, bail, ensure};
use near_primitives::account::{AccessKey, AccessKeyPermission};
use near_primitives::action::{
    Action, AddKeyAction, CreateAccountAction, FunctionCallAction, TransferAction,
};
use near_primitives::types::{AccountId, Gas};
use near_token::NearToken;

use crate::keychain::{self, DeployKey};
use crate::rpc::{Rpc, Sent};
use crate::target::Target;

/// Most NEAR a single test actor may receive from the root.
pub const MAX_ACTOR_FUNDING: NearToken = NearToken::from_near(2);

/// The account id of test actor `name` under the target's root.
///
/// # Errors
/// When `name` does not form a valid account id.
pub fn actor_id(target: &Target, name: &str) -> Result<AccountId> {
    ensure!(
        !name.is_empty() && !name.contains('.'),
        "actor name `{name}` must be one label"
    );
    Ok(format!("{name}.{}", target.root).parse()?)
}

/// Creates test actor `name` under the root with `funding` and a full-access key kept in the
/// keychain. A key left by an earlier failed attempt is reused.
///
/// # Errors
/// On mainnet, funding above [`MAX_ACTOR_FUNDING`], an existing account, or a failed transaction.
pub async fn create_actor(
    rpc: &Rpc,
    target: &Target,
    root_key: &DeployKey,
    name: &str,
    funding: NearToken,
) -> Result<(AccountId, Sent)> {
    if !target.deploys_verifier {
        bail!("test actors exist on testnet only");
    }
    ensure!(
        funding <= MAX_ACTOR_FUNDING,
        "an actor gets at most {MAX_ACTOR_FUNDING}"
    );
    let actor = actor_id(target, name)?;
    ensure!(
        rpc.account(&actor).await?.is_none(),
        "{actor} already exists"
    );
    let public_key = match keychain::load(&actor) {
        Ok(key) => key.public_key(),
        Err(_) => keychain::create(&actor)?,
    };
    let actions = vec![
        Action::CreateAccount(CreateAccountAction {}),
        Action::Transfer(TransferAction { deposit: funding }),
        Action::AddKey(Box::new(AddKeyAction {
            public_key,
            access_key: AccessKey {
                nonce: 0,
                permission: AccessKeyPermission::FullAccess,
            },
        })),
    ];
    let sent = rpc
        .send(&root_key.signer_for(&target.root), &actor, actions)
        .await?;
    Ok((actor, sent))
}

/// One function call to send.
#[derive(Debug, Clone)]
pub struct Call {
    pub contract: AccountId,
    pub method: String,
    pub args: serde_json::Value,
    pub deposit: NearToken,
    pub gas: Gas,
}

/// Signs `call` as `signer`, whose key must be in the keychain, and waits for finality.
///
/// # Errors
/// When the key is missing or the transaction or any receipt fails.
pub async fn call_as(rpc: &Rpc, signer: &AccountId, call: Call) -> Result<Sent> {
    let key = keychain::load(signer)?;
    let action = Action::FunctionCall(Box::new(FunctionCallAction {
        method_name: call.method,
        args: call.args.to_string().into_bytes(),
        gas: call.gas,
        deposit: call.deposit,
    }));
    rpc.send(&key.signer_for(signer), &call.contract, vec![action])
        .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::target::{DEFAULT_TEST_ASSETS, Env};

    #[test]
    fn actor_ids_sit_under_the_root() {
        let t = Target::for_env(Env::Testnet, None, &DEFAULT_TEST_ASSETS).unwrap();
        assert_eq!(
            actor_id(&t, "borrower").unwrap().as_str(),
            "borrower.mosaec.testnet"
        );
        assert!(actor_id(&t, "a.b").is_err());
        assert!(actor_id(&t, "").is_err());
    }
}
