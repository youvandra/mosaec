//! Every outbound call the pack makes, built from the runtime's function-call promise primitives
//! only. The SDK's `Promise` type links every promise action into the binary (add key, deploy,
//! delete account); building calls here keeps those host functions out of the pack's wasm, which
//! a build check asserts.

use mosaec_shared::constants::{
    GAS_CROSS_CALL, GAS_VERIFIER_TRANSFER, GAS_VERIFIER_VIEW, GAS_VERIFIER_WITHDRAW, ONE_YOCTO,
    VERIFIER_ID,
};
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{AccountId, AccountIdRef, Gas, NearToken, PromiseIndex, env};

/// The NEAR Intents verifier account.
#[must_use]
pub fn verifier_id() -> AccountId {
    AccountIdRef::new_or_panic(VERIFIER_ID).to_owned()
}

fn create(
    receiver: AccountId,
    method: &str,
    args: &str,
    deposit: NearToken,
    gas: Gas,
) -> PromiseIndex {
    env::promise_create(receiver, method, args.as_bytes(), deposit, gas)
}

/// `intents.near::mt_batch_transfer`, attaching 1 yoctoNEAR as NEP-245 requires.
#[must_use]
pub fn verifier_batch_transfer(
    receiver_id: &AccountId,
    token_ids: &[String],
    amounts: &[U128],
) -> PromiseIndex {
    let args = json!({ "receiver_id": receiver_id, "token_ids": token_ids, "amounts": amounts });
    create(
        verifier_id(),
        "mt_batch_transfer",
        &args.to_string(),
        ONE_YOCTO,
        GAS_VERIFIER_TRANSFER,
    )
}

/// `intents.near::ft_withdraw` to the token's home chain through its bridge memo.
#[must_use]
pub fn verifier_ft_withdraw(token: &AccountId, amount: U128, memo: &str) -> PromiseIndex {
    let args = json!({ "token": token, "receiver_id": token, "amount": amount, "memo": memo });
    create(
        verifier_id(),
        "ft_withdraw",
        &args.to_string(),
        ONE_YOCTO,
        GAS_VERIFIER_WITHDRAW,
    )
}

/// `intents.near::pa_all_paused` joined with `is_account_locked(pack)`.
#[must_use]
pub fn verifier_pause_and_lock(pack: &AccountId) -> PromiseIndex {
    let paused = create(
        verifier_id(),
        "pa_all_paused",
        "{}",
        NearToken::from_yoctonear(0),
        GAS_VERIFIER_VIEW,
    );
    let locked = create(
        verifier_id(),
        "is_account_locked",
        &json!({ "account_id": pack }).to_string(),
        NearToken::from_yoctonear(0),
        GAS_VERIFIER_VIEW,
    );
    env::promise_and(&[paused, locked])
}

/// `registry::begin_exercise(pack, sender_id)`.
#[must_use]
pub fn registry_begin_exercise(
    registry: &AccountId,
    pack: &AccountId,
    sender_id: &AccountId,
) -> PromiseIndex {
    let args = json!({ "pack": pack, "sender_id": sender_id });
    create(
        registry.clone(),
        "begin_exercise",
        &args.to_string(),
        NearToken::from_yoctonear(0),
        GAS_CROSS_CALL,
    )
}

/// `registry::end_exercise(pack, ok)`.
#[must_use]
pub fn registry_end_exercise(registry: &AccountId, pack: &AccountId, ok: bool) -> PromiseIndex {
    let args = json!({ "pack": pack, "ok": ok });
    create(
        registry.clone(),
        "end_exercise",
        &args.to_string(),
        NearToken::from_yoctonear(0),
        GAS_CROSS_CALL,
    )
}

/// A callback on this pack after `after`, with no deposit.
#[must_use]
pub fn then_self(after: PromiseIndex, method: &str, args: &str, gas: Gas) -> PromiseIndex {
    env::promise_then(
        after,
        env::current_account_id(),
        method,
        args.as_bytes(),
        NearToken::from_yoctonear(0),
        gas,
    )
}
