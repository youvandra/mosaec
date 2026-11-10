//! Keyless account contract that holds a position's assets inside NEAR Intents.
//!
//! A pack has no access keys and no method that adds one, deploys code or deletes the account. It
//! moves value only by calling the verifier, and only in three cases: the registry's command while
//! `Free`, a decided exercise, or a retry of that exercise's delivery. Every chain that receives
//! value decides in one receipt and delivers by retryable detached promises.
//!
//! Methods that hand a promise back to the caller set the return themselves (`promise_return` or
//! `value_return`) and declare no return type, so the binary never links the SDK's `Promise`.

mod ext;
mod phase;

use std::collections::HashSet;

use mosaec_shared::constants::{
    CLAIM_GAS, DISRUPTION_GAS, EXERCISE_DECIDE_GAS, EXERCISE_GAS, GAS_DELIVERY_CALLBACK,
    HOME_CHAIN_MEMO_PREFIX, MAX_HOME_ADDRESS_LEN, NEP141_PREFIX,
};
use mosaec_shared::error::ensure;
use mosaec_shared::events::MosaecEvent;
use mosaec_shared::terms::exercise_deadline;
use mosaec_shared::types::{Destination, Encumbrance, TransferMsg};
use mosaec_shared::{MosaecError, MosaecResult};
use near_sdk::json_types::U128;
use near_sdk::serde_json::{self, json};
use near_sdk::{AccountId, FunctionError, Gas, PanicOnDefault, PromiseIndex, env, near};

pub use crate::phase::Phase;
use mosaec_shared::promise::{read_json, verifier_id};

#[near(
    contract_state,
    contract_metadata(
        link = "https://github.com/youvandra/mosaec",
        standard(standard = "nep330", version = "1.2.0")
    )
)]
#[derive(Debug, PanicOnDefault)]
pub struct Pack {
    registry: AccountId,
    phase: Phase,
    /// True while a release transfer is in flight, so two retries never both deliver.
    delivery_in_flight: bool,
    /// True from an accepted exercise payment until its decide receipt, so a second exercise or
    /// an `unencumber` racing the deadline cannot run against the same encumbrance.
    exercise_in_flight: bool,
}

/// Everything the registry, the indexer and the app read from a pack.
#[near(serializers = [json])]
#[derive(Debug)]
pub struct PackStatus {
    pub registry: AccountId,
    pub phase: Phase,
    pub delivery_in_flight: bool,
    pub exercise_in_flight: bool,
    /// Last block time an exercise is accepted, while `Written`.
    pub exercise_deadline_ns: Option<u64>,
}

/// What the pack does with an incoming transfer.
#[derive(Debug, PartialEq, Eq)]
enum Inbound {
    /// A valid exercise: ask the registry, then decide.
    Exercise(PromiseIndex),
    /// Anything else: return every amount.
    Refund(MosaecError),
}

#[near]
impl Pack {
    /// Called by the registry in the batch that creates this account.
    #[init]
    #[must_use]
    pub fn new(registry: AccountId) -> Self {
        let created_by_registry = env::predecessor_account_id() == registry
            && env::current_account_id().is_sub_account_of(&registry);
        if !created_by_registry {
            MosaecError::NotRegistry.panic();
        }
        Self {
            registry,
            phase: Phase::Free,
            delivery_in_flight: false,
            exercise_in_flight: false,
        }
    }

    // -----------------------------------------------------------------------------------------
    // Registry commands
    // -----------------------------------------------------------------------------------------

    /// Freezes the recorded contents under the Ticket's terms. Safe to repeat.
    ///
    /// # Errors
    /// `E_NOT_REGISTRY`, or `E_STATE` when another encumbrance is live.
    #[handle_result(aliased)]
    pub fn encumber(&mut self, encumbrance: Encumbrance) -> MosaecResult<()> {
        self.require_registry()?;
        self.phase = self.phase.clone().encumber(encumbrance)?;
        emit_encumbrance(true);
        Ok(())
    }

    /// Drops the encumbrance after the exercise deadline the pack computes itself. Safe to repeat.
    ///
    /// # Errors
    /// `E_NOT_REGISTRY`; `E_STATE` before `T` or while releasing; `E_GRACE` in a grace window.
    #[handle_result(aliased)]
    pub fn unencumber(&mut self) -> MosaecResult<()> {
        self.require_registry()?;
        ensure(!self.exercise_in_flight, MosaecError::Pending)?;
        self.phase = self.phase.clone().unencumber(env::block_timestamp())?;
        emit_encumbrance(false);
        Ok(())
    }

    /// Moves value out of a `Free` pack on the Title holder's command, relayed by the registry.
    /// Returns the verifier's promise, so the registry's callback sees whether the value left.
    /// Panics with `E_NOT_REGISTRY`, `E_STATE`, `E_AMOUNT`, `E_TOKEN` or `E_MSG`.
    pub fn withdraw(&mut self, token_id: String, amount: U128, destination: Destination) {
        let promise = self
            .try_withdraw(token_id, amount, destination)
            .unwrap_or_else(|e| e.panic());
        env::promise_return(promise);
    }

    // -----------------------------------------------------------------------------------------
    // Exercise: check, decide, deliver
    // -----------------------------------------------------------------------------------------

    /// NEP-245 receiver. Accepts only an exercise paying exactly `K` before the deadline; every
    /// other transfer is refunded in full. Returns the unused amounts, or the exercise chain that
    /// resolves to them.
    #[allow(
        clippy::needless_pass_by_value,
        reason = "NEP-245 fixes the signature; the SDK deserializes owned arguments"
    )]
    pub fn mt_on_transfer(
        &mut self,
        sender_id: AccountId,
        previous_owner_ids: Vec<AccountId>,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        msg: String,
    ) {
        // Part of the NEP-245 interface; the verifier rejects approvals, so it equals the sender.
        let _ = previous_owner_ids;
        if env::predecessor_account_id() != verifier_id() {
            MosaecError::NotVerifier.panic();
        }
        match self.route_inbound(&sender_id, &token_ids, &amounts, &msg) {
            Inbound::Exercise(chain) => env::promise_return(chain),
            Inbound::Refund(error) => {
                emit_refused(&sender_id, error);
                env::value_return(json!(amounts).to_string());
            }
        }
    }

    /// The exercise's value-returning receipt. Returns `[0]` to keep `K` or `[K]` to refund it.
    /// It never moves value itself and never panics on the registry's answer.
    #[private]
    pub fn on_begin_exercise(&mut self, sender_id: AccountId, k_amount: U128) -> Vec<U128> {
        self.exercise_in_flight = false;
        let begun = mosaec_shared::promise::succeeded(0);
        if !begun {
            emit_refused(&sender_id, MosaecError::Holder);
            return vec![k_amount];
        }
        match self.phase.clone().decide_exercise(sender_id.clone()) {
            Ok(releasing) => {
                self.phase = releasing;
                MosaecEvent::ExerciseDecided {
                    pack: env::current_account_id(),
                    owed_to: sender_id,
                    k_amount,
                }
                .emit();
                // Cannot fail: the pack was `Written`, so no delivery is in flight.
                let _ = self.start_release();
                self.end_exercise(true);
                vec![U128(0)]
            }
            Err(error) => {
                emit_refused(&sender_id, error);
                self.end_exercise(false);
                vec![k_amount]
            }
        }
    }

    /// Retries delivery of the contents owed by a decided exercise. Anyone may call it.
    ///
    /// # Errors
    /// `E_GAS` without enough prepaid gas; `E_STATE` unless releasing; `E_PENDING` while a
    /// delivery is already in flight.
    #[handle_result(aliased)]
    pub fn claim(&mut self) -> MosaecResult<()> {
        require_gas(CLAIM_GAS)?;
        self.start_release()
    }

    /// Records the outcome of a release transfer.
    #[private]
    pub fn on_released(&mut self) {
        self.delivery_in_flight = false;
        if !mosaec_shared::promise::succeeded(0) {
            return;
        }
        if let Phase::Releasing { owed_to, .. } = &self.phase {
            MosaecEvent::ContentsReleased {
                pack: env::current_account_id(),
                owed_to: owed_to.clone(),
            }
            .emit();
        }
        if let Ok(free) = self.phase.clone().finish_release() {
            self.phase = free;
        }
    }

    // -----------------------------------------------------------------------------------------
    // Grace window
    // -----------------------------------------------------------------------------------------

    /// Reads the verifier's pause state and this pack's lock. Anyone may call it inside
    /// `[T - 24 h, T]`; a pause or lock found there keeps the exercise open until `T + 24 h`.
    /// Returns whether a disruption was recorded. Panics with `E_GAS` or `E_STATE`.
    pub fn record_disruption(&mut self) {
        let chain = self.try_record_disruption().unwrap_or_else(|e| e.panic());
        env::promise_return(chain);
    }

    /// Stores the disruption when either view shows one. Returns whether it was recorded.
    #[private]
    pub fn on_disruption_checked(&mut self) -> bool {
        let paused: Option<HashSet<String>> = read_json(0).flatten();
        let locked: bool = read_json(1).unwrap_or(false);
        if !phase::is_disruption(paused.as_ref(), locked) {
            return false;
        }
        let now = env::block_timestamp();
        let Ok(recorded) = self.phase.clone().record_disruption(now) else {
            return false;
        };
        self.phase = recorded;
        MosaecEvent::DisruptionRecorded {
            pack: env::current_account_id(),
            at_ns: now,
            exercise_deadline_ns: self.exercise_deadline_ns().unwrap_or(now),
        }
        .emit();
        true
    }

    // -----------------------------------------------------------------------------------------
    // Views
    // -----------------------------------------------------------------------------------------

    /// Current state, read by the registry before `expire` and by the indexer and app.
    #[must_use]
    pub fn status(&self) -> PackStatus {
        PackStatus {
            registry: self.registry.clone(),
            phase: self.phase.clone(),
            delivery_in_flight: self.delivery_in_flight,
            exercise_in_flight: self.exercise_in_flight,
            exercise_deadline_ns: self.exercise_deadline_ns(),
        }
    }
}

impl Pack {
    fn require_registry(&self) -> MosaecResult<()> {
        ensure(
            env::predecessor_account_id() == self.registry,
            MosaecError::NotRegistry,
        )
    }

    fn try_withdraw(
        &self,
        token_id: String,
        amount: U128,
        destination: Destination,
    ) -> MosaecResult<PromiseIndex> {
        self.require_registry()?;
        self.phase.check_withdraw()?;
        ensure(amount.0 > 0, MosaecError::Amount)?;
        match destination {
            Destination::Verifier { account_id } => Ok(ext::verifier_batch_transfer(
                &account_id,
                &[token_id],
                &[amount],
            )),
            Destination::HomeChain { address } => {
                let token = nep141_contract(&token_id)?;
                let memo = home_chain_memo(&address)?;
                Ok(ext::verifier_ft_withdraw(&token, amount, &memo))
            }
        }
    }

    fn route_inbound(
        &mut self,
        sender_id: &AccountId,
        token_ids: &[String],
        amounts: &[U128],
        msg: &str,
    ) -> Inbound {
        match self.check_exercise(token_ids, amounts, msg) {
            Ok(k_amount) => {
                self.exercise_in_flight = true;
                Inbound::Exercise(self.begin_exercise(sender_id, k_amount))
            }
            Err(error) => Inbound::Refund(error),
        }
    }

    fn check_exercise(
        &self,
        token_ids: &[String],
        amounts: &[U128],
        msg: &str,
    ) -> MosaecResult<U128> {
        let parsed: TransferMsg = serde_json::from_str(msg).map_err(|_| MosaecError::Msg)?;
        ensure(parsed == TransferMsg::Exercise, MosaecError::State)?;
        ensure(!self.exercise_in_flight, MosaecError::Pending)?;
        require_gas(EXERCISE_GAS)?;
        self.phase
            .check_exercise(token_ids, amounts, env::block_timestamp())
    }

    fn begin_exercise(&self, sender_id: &AccountId, k_amount: U128) -> PromiseIndex {
        let pack = env::current_account_id();
        let begin = ext::registry_begin_exercise(&self.registry, &pack, sender_id);
        let args = json!({ "sender_id": sender_id, "k_amount": k_amount });
        ext::then_self(
            begin,
            "on_begin_exercise",
            &args.to_string(),
            EXERCISE_DECIDE_GAS,
        )
    }

    /// Sends the recorded contents to the account they are owed to, as a detached promise.
    fn start_release(&mut self) -> MosaecResult<()> {
        let Phase::Releasing {
            encumbrance,
            owed_to,
        } = &self.phase
        else {
            return Err(MosaecError::State);
        };
        ensure(!self.delivery_in_flight, MosaecError::Pending)?;
        let transfer = ext::verifier_batch_transfer(
            owed_to,
            &encumbrance.contents.token_ids(),
            &encumbrance.contents.amounts(),
        );
        let _ = ext::then_self(transfer, "on_released", "{}", GAS_DELIVERY_CALLBACK);
        self.delivery_in_flight = true;
        Ok(())
    }

    fn end_exercise(&self, ok: bool) {
        let _ = ext::registry_end_exercise(&self.registry, &env::current_account_id(), ok);
    }

    fn try_record_disruption(&self) -> MosaecResult<PromiseIndex> {
        require_gas(DISRUPTION_GAS)?;
        self.phase.check_disruption_window(env::block_timestamp())?;
        let views = ext::verifier_pause_and_lock(&env::current_account_id());
        Ok(ext::then_self(
            views,
            "on_disruption_checked",
            "{}",
            GAS_DELIVERY_CALLBACK,
        ))
    }

    fn exercise_deadline_ns(&self) -> Option<u64> {
        match &self.phase {
            Phase::Written {
                encumbrance,
                disrupted_at_ns,
            } => Some(exercise_deadline(
                encumbrance.expires_at_ns,
                *disrupted_at_ns,
            )),
            _ => None,
        }
    }
}

fn require_gas(required: Gas) -> MosaecResult<()> {
    let left = env::prepaid_gas().saturating_sub(env::used_gas());
    ensure(left >= required, MosaecError::Gas)
}

fn nep141_contract(token_id: &str) -> MosaecResult<AccountId> {
    token_id
        .strip_prefix(NEP141_PREFIX)
        .and_then(|id| id.parse().ok())
        .ok_or(MosaecError::Token)
}

fn home_chain_memo(address: &str) -> MosaecResult<String> {
    let valid = !address.is_empty()
        && address.len() <= MAX_HOME_ADDRESS_LEN
        && address
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == ':');
    ensure(valid, MosaecError::Msg)?;
    Ok(format!("{HOME_CHAIN_MEMO_PREFIX}{address}"))
}

fn emit_encumbrance(encumbered: bool) {
    MosaecEvent::EncumbranceSynced {
        pack: env::current_account_id(),
        encumbered,
    }
    .emit();
}

fn emit_refused(sender_id: &AccountId, error: MosaecError) {
    MosaecEvent::Refused {
        pack: env::current_account_id(),
        sender_id: sender_id.clone(),
        code: error.code().to_owned(),
    }
    .emit();
}

#[cfg(test)]
mod tests;
