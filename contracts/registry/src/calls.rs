//! Every outbound call the registry makes. Function calls go through `mosaec_shared::promise`; the
//! one batch is pack creation, which uses create-account, transfer, use-global-contract and a
//! function call, and never an add-key, deploy or delete action.

use mosaec_shared::constants::{
    GAS_CROSS_CALL, GAS_PACK_INIT, GAS_VERIFIER_TRANSFER, GAS_VERIFIER_VIEW, GAS_VERIFIER_WITHDRAW,
    ONE_YOCTO,
};
use mosaec_shared::promise::{NO_DEPOSIT, call, verifier_id};
use mosaec_shared::types::{Destination, Encumbrance};
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{AccountId, CryptoHash, Gas, NearToken, PromiseIndex, env};

fn view(method: &str, args: &near_sdk::serde_json::Value) -> PromiseIndex {
    call(
        verifier_id(),
        method,
        &args.to_string(),
        NO_DEPOSIT,
        GAS_VERIFIER_VIEW,
    )
}

/// `mt_batch_balance_of(pack, token_ids)` on the verifier.
#[must_use]
pub fn balances(pack: &AccountId, token_ids: &[String]) -> PromiseIndex {
    view(
        "mt_batch_balance_of",
        &json!({ "account_id": pack, "token_ids": token_ids }),
    )
}

/// The four joined fill reads, in `FillReads` order: public keys, predecessor auth, lock,
/// balances.
#[must_use]
pub fn fill_reads(pack: &AccountId, token_ids: &[String]) -> PromiseIndex {
    let account = json!({ "account_id": pack });
    let keys = view("public_keys_of", &account);
    let auth = view("is_auth_by_predecessor_id_enabled", &account);
    let locked = view("is_account_locked", &account);
    let held = balances(pack, token_ids);
    env::promise_and(&[keys, auth, locked, held])
}

/// `mt_transfer` of the registry's own verifier balance to `receiver_id`.
#[must_use]
pub fn verifier_transfer(receiver_id: &AccountId, token_id: &str, amount: U128) -> PromiseIndex {
    let args = json!({ "receiver_id": receiver_id, "token_id": token_id, "amount": amount });
    call(
        verifier_id(),
        "mt_transfer",
        &args.to_string(),
        ONE_YOCTO,
        GAS_VERIFIER_TRANSFER,
    )
}

/// `pack::encumber(encumbrance)`.
#[must_use]
pub fn pack_encumber(pack: &AccountId, encumbrance: &Encumbrance) -> PromiseIndex {
    let args = json!({ "encumbrance": encumbrance });
    call(
        pack.clone(),
        "encumber",
        &args.to_string(),
        NO_DEPOSIT,
        GAS_CROSS_CALL,
    )
}

/// `pack::unencumber()`.
#[must_use]
pub fn pack_unencumber(pack: &AccountId) -> PromiseIndex {
    call(pack.clone(), "unencumber", "{}", NO_DEPOSIT, GAS_CROSS_CALL)
}

/// `pack::status()`.
#[must_use]
pub fn pack_status(pack: &AccountId) -> PromiseIndex {
    call(pack.clone(), "status", "{}", NO_DEPOSIT, GAS_CROSS_CALL)
}

/// `pack::withdraw(token_id, amount, destination)`, with gas for the verifier hop it returns.
#[must_use]
pub fn pack_withdraw(
    pack: &AccountId,
    token_id: &str,
    amount: U128,
    destination: &Destination,
) -> PromiseIndex {
    let args = json!({ "token_id": token_id, "amount": amount, "destination": destination });
    let gas = Gas::from_tgas(GAS_CROSS_CALL.as_tgas() + GAS_VERIFIER_WITHDRAW.as_tgas());
    call(pack.clone(), "withdraw", &args.to_string(), NO_DEPOSIT, gas)
}

/// NEP-171 receiver hook.
#[must_use]
pub fn nft_on_transfer(
    receiver_id: &AccountId,
    sender_id: &AccountId,
    previous_owner_id: &AccountId,
    token_id: &str,
    msg: &str,
) -> PromiseIndex {
    let args = json!({
        "sender_id": sender_id,
        "previous_owner_id": previous_owner_id,
        "token_id": token_id,
        "msg": msg,
    });
    call(
        receiver_id.clone(),
        "nft_on_transfer",
        &args.to_string(),
        NO_DEPOSIT,
        GAS_CROSS_CALL,
    )
}

/// Creates `pack` with zero keys, funds it, attaches the global pack code by hash and runs its
/// init, all in one batch.
#[must_use]
pub fn create_pack(pack: &AccountId, funding: NearToken, code_hash: &CryptoHash) -> PromiseIndex {
    let registry = env::current_account_id();
    let batch = env::promise_batch_create(pack);
    env::promise_batch_action_create_account(batch);
    env::promise_batch_action_transfer(batch, funding);
    env::promise_batch_action_use_global_contract(batch, code_hash);
    let args = json!({ "registry": registry }).to_string();
    env::promise_batch_action_function_call(
        batch,
        "new",
        args.as_bytes(),
        NO_DEPOSIT,
        GAS_PACK_INIT,
    );
    batch
}

/// Returns `amount` of NEAR to `receiver_id`.
pub fn refund_near(receiver_id: &AccountId, amount: NearToken) {
    if amount.is_zero() {
        return;
    }
    let batch = env::promise_batch_create(receiver_id);
    env::promise_batch_action_transfer(batch, amount);
}
