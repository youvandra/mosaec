//! Every outbound call the pack makes, built from the runtime's function-call promise primitives
//! only. The SDK's `Promise` type links every promise action into the binary (add key, deploy,
//! delete account); building calls here keeps those host functions out of the pack's wasm, which
//! a build check asserts.

use mosaec_shared::constants::{
    GAS_CROSS_CALL, GAS_VERIFIER_TRANSFER, GAS_VERIFIER_VIEW, GAS_VERIFIER_WITHDRAW, ONE_YOCTO,
};
pub use mosaec_shared::promise::then_self;
use mosaec_shared::promise::{NO_DEPOSIT, call as create};
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{AccountId, PromiseIndex, env};

/// The verifier's `mt_batch_transfer`, attaching 1 yoctoNEAR as NEP-245 requires.
#[must_use]
pub fn verifier_batch_transfer(
    verifier: &AccountId,
    receiver_id: &AccountId,
    token_ids: &[String],
    amounts: &[U128],
) -> PromiseIndex {
    let args = json!({ "receiver_id": receiver_id, "token_ids": token_ids, "amounts": amounts });
    create(
        verifier.clone(),
        "mt_batch_transfer",
        &args.to_string(),
        ONE_YOCTO,
        GAS_VERIFIER_TRANSFER,
    )
}

/// The verifier's `ft_withdraw` to the token's home chain through its bridge memo.
#[must_use]
pub fn verifier_ft_withdraw(
    verifier: &AccountId,
    token: &AccountId,
    amount: U128,
    memo: &str,
) -> PromiseIndex {
    let args = json!({ "token": token, "receiver_id": token, "amount": amount, "memo": memo });
    create(
        verifier.clone(),
        "ft_withdraw",
        &args.to_string(),
        ONE_YOCTO,
        GAS_VERIFIER_WITHDRAW,
    )
}

/// The verifier's `pa_all_paused` joined with `is_account_locked(pack)`.
#[must_use]
pub fn verifier_pause_and_lock(verifier: &AccountId, pack: &AccountId) -> PromiseIndex {
    let paused = create(
        verifier.clone(),
        "pa_all_paused",
        "{}",
        NO_DEPOSIT,
        GAS_VERIFIER_VIEW,
    );
    let locked = create(
        verifier.clone(),
        "is_account_locked",
        &json!({ "account_id": pack }).to_string(),
        NO_DEPOSIT,
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
        NO_DEPOSIT,
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
        NO_DEPOSIT,
        GAS_CROSS_CALL,
    )
}
