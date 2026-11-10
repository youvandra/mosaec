//! Function-call promises built from the runtime primitives only.
//!
//! The SDK's `Promise` type links every promise action into a contract binary, including add key,
//! deploy and delete account. Mosaec contracts build calls with these helpers instead, so their
//! wasm imports no key, deploy or delete host function; a build check asserts it.

use near_sdk::{AccountId, Gas, NearToken, PromiseIndex, env};

use crate::constants::MAX_PROMISE_RESULT_LEN;

/// No deposit.
pub const NO_DEPOSIT: NearToken = NearToken::from_yoctonear(0);

/// A function call on `receiver` with JSON `args`.
#[must_use]
pub fn call(
    receiver: AccountId,
    method: &str,
    args: &str,
    deposit: NearToken,
    gas: Gas,
) -> PromiseIndex {
    env::promise_create(receiver, method, args.as_bytes(), deposit, gas)
}

/// A function call on `receiver` that runs after `after`.
#[must_use]
pub fn then(
    after: PromiseIndex,
    receiver: AccountId,
    method: &str,
    args: &str,
    deposit: NearToken,
    gas: Gas,
) -> PromiseIndex {
    env::promise_then(after, receiver, method, args.as_bytes(), deposit, gas)
}

/// A callback on the current contract after `after`, with no deposit.
#[must_use]
pub fn then_self(after: PromiseIndex, method: &str, args: &str, gas: Gas) -> PromiseIndex {
    then(
        after,
        env::current_account_id(),
        method,
        args,
        NO_DEPOSIT,
        gas,
    )
}

/// True when promise result `index` succeeded within the bounded result size.
#[must_use]
pub fn succeeded(index: u64) -> bool {
    env::promise_result_checked(index, MAX_PROMISE_RESULT_LEN).is_ok()
}

/// Parses promise result `index` as JSON, or `None` when it failed, was too long or does not parse.
#[must_use]
pub fn read_json<T: near_sdk::serde::de::DeserializeOwned>(index: u64) -> Option<T> {
    env::promise_result_checked(index, MAX_PROMISE_RESULT_LEN)
        .ok()
        .and_then(|bytes| near_sdk::serde_json::from_slice(&bytes).ok())
}
