use mosaec_shared::constants::{CapProfile, DAY_NS, GRACE_NS, USDC, ZEC};
use mosaec_shared::contents::{ContentLine, Contents};
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{PromiseResult, RuntimeFeesConfig, test_vm_config, testing_env};

use super::*;

const T: u64 = 500 * DAY_NS;
const K: u128 = 107_500_000;
const ZEC_AMOUNT: u128 = 50_000_000;

fn registry() -> AccountId {
    "v0.mosaec.near".parse().unwrap()
}
fn pack_id() -> AccountId {
    "7.v0.mosaec.near".parse().unwrap()
}
fn alice() -> AccountId {
    "alice.near".parse().unwrap()
}

fn context(predecessor: &AccountId, now_ns: u64) -> VMContextBuilder {
    let mut ctx = VMContextBuilder::new();
    ctx.current_account_id(pack_id())
        .predecessor_account_id(predecessor.clone())
        .block_timestamp(now_ns)
        .prepaid_gas(Gas::from_tgas(300));
    ctx
}

fn set(predecessor: &AccountId, now_ns: u64) {
    testing_env!(context(predecessor, now_ns).build());
}

fn set_with_results(predecessor: &AccountId, now_ns: u64, results: Vec<PromiseResult>) {
    testing_env!(
        context(predecessor, now_ns).build(),
        test_vm_config(),
        RuntimeFeesConfig::test(),
        std::collections::HashMap::default(),
        results
    );
}

fn encumbrance() -> Encumbrance {
    Encumbrance {
        k_token: USDC.into(),
        k_amount: U128(K),
        expires_at_ns: T,
        contents: Contents::new(
            vec![ContentLine {
                token_id: ZEC.into(),
                amount: U128(ZEC_AMOUNT),
            }],
            CapProfile::Production,
        )
        .unwrap(),
    }
}

fn new_pack() -> Pack {
    set(&registry(), 0);
    Pack::new(registry())
}

fn written_pack() -> Pack {
    let mut pack = new_pack();
    pack.encumber(encumbrance()).unwrap();
    pack
}

fn exercise(pack: &Pack, now_ns: u64, amount: u128, msg: &str) -> Inbound {
    set(&verifier_id(), now_ns);
    pack.route_inbound(&alice(), &[USDC.into()], &[U128(amount)], msg)
}

#[test]
#[should_panic(expected = "E_NOT_REGISTRY")]
fn init_refuses_outside_caller() {
    set(&alice(), 0);
    let _ = Pack::new(registry());
}

#[test]
#[should_panic(expected = "E_NOT_REGISTRY")]
fn init_refuses_registry_that_is_not_the_parent() {
    let other: AccountId = "v1.mosaec.near".parse().unwrap();
    set(&other, 0);
    let _ = Pack::new(other);
}

#[test]
fn pack_refuses_non_registry() {
    let mut pack = new_pack();
    set(&alice(), 0);
    assert_eq!(pack.encumber(encumbrance()), Err(MosaecError::NotRegistry));
    assert_eq!(pack.unencumber(), Err(MosaecError::NotRegistry));
    let to_alice = Destination::Verifier {
        account_id: alice(),
    };
    assert!(matches!(
        pack.try_withdraw(ZEC.into(), U128(1), to_alice),
        Err(MosaecError::NotRegistry)
    ));
}

#[test]
fn written_withdraw_refused() {
    let pack = written_pack();
    let to_alice = Destination::Verifier {
        account_id: alice(),
    };
    assert!(matches!(
        pack.try_withdraw(ZEC.into(), U128(1), to_alice),
        Err(MosaecError::State)
    ));
}

#[test]
fn free_withdraw_checks_destination() {
    let pack = new_pack();
    let home = |address: &str| Destination::HomeChain {
        address: address.into(),
    };
    assert!(
        pack.try_withdraw(ZEC.into(), U128(1), home("t1abcDEF"))
            .is_ok()
    );
    assert!(matches!(
        pack.try_withdraw(ZEC.into(), U128(1), home("t1 abc")),
        Err(MosaecError::Msg)
    ));
    assert!(matches!(
        pack.try_withdraw(ZEC.into(), U128(1), home("")),
        Err(MosaecError::Msg)
    ));
    assert!(matches!(
        pack.try_withdraw("nep245:x.near:1".into(), U128(1), home("t1abc")),
        Err(MosaecError::Token)
    ));
    assert!(matches!(
        pack.try_withdraw(ZEC.into(), U128(0), home("t1abc")),
        Err(MosaecError::Amount)
    ));
}

#[test]
fn home_chain_memo_format() {
    assert_eq!(home_chain_memo("bc1qxyz").unwrap(), "WITHDRAW_TO:bc1qxyz");
}

#[test]
fn early_expire_refused() {
    let mut pack = written_pack();
    set(&registry(), T);
    assert_eq!(pack.unencumber(), Err(MosaecError::State));
    set(&registry(), T + 1);
    assert_eq!(pack.unencumber(), Ok(()));
    assert_eq!(pack.status().phase, Phase::Free);
}

#[test]
#[should_panic(expected = "E_NOT_VERIFIER")]
fn exercise_refuses_non_verifier() {
    let mut pack = written_pack();
    set(&alice(), 0);
    pack.mt_on_transfer(
        alice(),
        vec![alice()],
        vec![USDC.into()],
        vec![U128(K)],
        "\"exercise\"".into(),
    );
}

#[test]
fn non_exercise_transfer_refunded() {
    let pack = written_pack();
    assert_eq!(
        exercise(&pack, 1, K, "hello"),
        Inbound::Refund(MosaecError::Msg)
    );
    let fill = r#"{"fill":{"pack":"7.v0.mosaec.near","terms":{"k_token":"x","k_amount":"1","term_ns":1},"contents_hash":""}}"#;
    assert_eq!(
        exercise(&pack, 1, K, fill),
        Inbound::Refund(MosaecError::State)
    );
}

#[test]
fn late_exercise_refunded() {
    let pack = written_pack();
    assert_eq!(
        exercise(&pack, T + 1, K, "\"exercise\""),
        Inbound::Refund(MosaecError::Expired)
    );
}

#[test]
fn short_pay_refunded() {
    let pack = written_pack();
    assert_eq!(
        exercise(&pack, T, K - 1, "\"exercise\""),
        Inbound::Refund(MosaecError::Amount)
    );
}

#[test]
fn exercise_on_free_pack_refunded() {
    let pack = new_pack();
    assert_eq!(
        exercise(&pack, 1, K, "\"exercise\""),
        Inbound::Refund(MosaecError::State)
    );
}

#[test]
fn exercise_without_gas_refunded() {
    let pack = written_pack();
    let mut ctx = context(&verifier_id(), 1);
    ctx.prepaid_gas(Gas::from_tgas(50));
    testing_env!(ctx.build());
    assert_eq!(
        pack.route_inbound(&alice(), &[USDC.into()], &[U128(K)], "\"exercise\""),
        Inbound::Refund(MosaecError::Gas)
    );
}

#[test]
fn valid_exercise_starts_the_chain() {
    let pack = written_pack();
    assert!(matches!(
        exercise(&pack, T, K, "\"exercise\""),
        Inbound::Exercise(_)
    ));
    assert!(matches!(pack.status().phase, Phase::Written { .. }));
}

#[test]
fn decided_exercise_keeps_k_and_owes_contents() {
    let mut pack = written_pack();
    set_with_results(&pack_id(), T, vec![PromiseResult::Successful(vec![])]);
    assert_eq!(pack.on_begin_exercise(alice(), U128(K)), vec![U128(0)]);
    let status = pack.status();
    assert!(matches!(status.phase, Phase::Releasing { ref owed_to, .. } if *owed_to == alice()));
    assert!(status.delivery_in_flight);
}

#[test]
fn refused_begin_refunds_k() {
    let mut pack = written_pack();
    set_with_results(&pack_id(), T, vec![PromiseResult::Failed]);
    assert_eq!(pack.on_begin_exercise(alice(), U128(K)), vec![U128(K)]);
    assert!(matches!(pack.status().phase, Phase::Written { .. }));
}

#[test]
fn claim_never_double_delivers() {
    let mut pack = written_pack();
    set_with_results(&pack_id(), T, vec![PromiseResult::Successful(vec![])]);
    pack.on_begin_exercise(alice(), U128(K));
    set(&alice(), T);
    assert_eq!(pack.claim(), Err(MosaecError::Pending));
}

#[test]
fn failed_delivery_waits_for_claim() {
    let mut pack = written_pack();
    set_with_results(&pack_id(), T, vec![PromiseResult::Successful(vec![])]);
    pack.on_begin_exercise(alice(), U128(K));
    set_with_results(&pack_id(), T, vec![PromiseResult::Failed]);
    pack.on_released();
    let status = pack.status();
    assert!(matches!(status.phase, Phase::Releasing { .. }));
    assert!(!status.delivery_in_flight);
    set(&alice(), T + 10 * DAY_NS);
    assert_eq!(pack.claim(), Ok(()));
    set_with_results(&pack_id(), T, vec![PromiseResult::Successful(vec![])]);
    pack.on_released();
    assert_eq!(pack.status().phase, Phase::Free);
}

#[test]
fn claim_refused_unless_releasing() {
    let mut pack = written_pack();
    set(&alice(), 1);
    assert_eq!(pack.claim(), Err(MosaecError::State));
}

#[test]
fn record_disruption_window() {
    let pack = written_pack();
    set(&alice(), T - GRACE_NS - 1);
    assert!(matches!(
        pack.try_record_disruption(),
        Err(MosaecError::State)
    ));
    set(&alice(), T - 1);
    assert!(pack.try_record_disruption().is_ok());
}

#[test]
fn grace_exercise_after_pause_recorded() {
    let mut pack = written_pack();
    let paused = serde_json::to_vec(&Some(vec!["mt_transfer"])).unwrap();
    let unlocked = serde_json::to_vec(&false).unwrap();
    set_with_results(
        &pack_id(),
        T - 1,
        vec![
            PromiseResult::Successful(paused),
            PromiseResult::Successful(unlocked),
        ],
    );
    assert!(pack.on_disruption_checked());
    assert_eq!(pack.status().exercise_deadline_ns, Some(T + GRACE_NS));
    assert!(matches!(
        exercise(&pack, T + GRACE_NS, K, "\"exercise\""),
        Inbound::Exercise(_)
    ));
    set(&registry(), T + 1);
    assert_eq!(pack.unencumber(), Err(MosaecError::Grace));
}

#[test]
fn no_pause_records_nothing() {
    let mut pack = written_pack();
    let none = serde_json::to_vec(&Option::<Vec<String>>::None).unwrap();
    let unlocked = serde_json::to_vec(&false).unwrap();
    set_with_results(
        &pack_id(),
        T - 1,
        vec![
            PromiseResult::Successful(none),
            PromiseResult::Successful(unlocked),
        ],
    );
    assert!(!pack.on_disruption_checked());
    assert_eq!(pack.status().exercise_deadline_ns, Some(T));
}

#[test]
fn lock_is_a_disruption_even_if_pause_view_fails() {
    let mut pack = written_pack();
    let locked = serde_json::to_vec(&true).unwrap();
    set_with_results(
        &pack_id(),
        T - 1,
        vec![PromiseResult::Failed, PromiseResult::Successful(locked)],
    );
    assert!(pack.on_disruption_checked());
}
