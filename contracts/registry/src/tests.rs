use mosaec_shared::constants::{DAY_NS, DEFAULT_TERM_NS, USDC, ZEC};
use mosaec_shared::types::FillMsg;
use near_sdk::test_utils::{VMContextBuilder, get_logs};
use near_sdk::{PromiseResult, RuntimeFeesConfig, test_vm_config, testing_env};

use super::*;

const NOW: u64 = 100 * DAY_NS;
const PRICE: u128 = 100_000_000;
const K: u128 = 107_500_000;
const ZEC_AMOUNT: u128 = 50_000_000;

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn verifier_id() -> AccountId {
    acc("intents.near")
}
fn registry_id() -> AccountId {
    acc("v0.mosaec.near")
}
fn guardian() -> AccountId {
    acc("mosaec.near")
}
fn pack() -> AccountId {
    acc("0.v0.mosaec.near")
}
fn maker() -> AccountId {
    acc("maker.near")
}
fn taker() -> AccountId {
    acc("taker.near")
}

fn ctx(predecessor: &AccountId, now_ns: u64, deposit: NearToken) -> VMContextBuilder {
    let mut c = VMContextBuilder::new();
    c.current_account_id(registry_id())
        .predecessor_account_id(predecessor.clone())
        .block_timestamp(now_ns)
        .attached_deposit(deposit)
        .prepaid_gas(Gas::from_tgas(300));
    c
}

fn set(predecessor: &AccountId, now_ns: u64) {
    testing_env!(ctx(predecessor, now_ns, NearToken::from_yoctonear(0)).build());
}

fn set_paying(predecessor: &AccountId, deposit: NearToken) {
    testing_env!(ctx(predecessor, NOW, deposit).build());
}

fn set_results(now_ns: u64, results: Vec<PromiseResult>) {
    testing_env!(
        ctx(&registry_id(), now_ns, NearToken::from_yoctonear(0)).build(),
        test_vm_config(),
        RuntimeFeesConfig::test(),
        std::collections::HashMap::default(),
        results
    );
}

fn ok_json(value: &Value) -> PromiseResult {
    PromiseResult::Successful(value.to_string().into_bytes())
}

fn terms() -> Terms {
    Terms {
        k_token: USDC.into(),
        k_amount: U128(K),
        term_ns: DEFAULT_TERM_NS,
    }
}

fn request() -> OfferRequest {
    OfferRequest {
        token_ids: vec![ZEC.into()],
        terms: terms(),
        pay_token: USDC.into(),
        price: U128(PRICE),
        offer_expires_at_ns: NOW + DAY_NS,
    }
}

fn fresh() -> Registry {
    set(&registry_id(), NOW);
    let mut r = Registry::new(
        guardian(),
        [7u8; 32].into(),
        Network::Mainnet,
        verifier_id(),
    );
    set_paying(&maker(), MINT_DEPOSIT);
    assert!(r.try_mint().is_ok());
    set_results(NOW, vec![PromiseResult::Successful(vec![])]);
    assert!(r.on_minted(pack(), maker(), 0));
    r
}

fn offered() -> Registry {
    let mut r = fresh();
    set_results(NOW, vec![ok_json(&json!([U128(ZEC_AMOUNT)]))]);
    assert!(r.on_offer_balances(pack(), maker(), request()));
    r
}

fn contents_hash(r: &Registry) -> String {
    r.positions
        .get(&pack())
        .unwrap()
        .offer()
        .unwrap()
        .contents_hash
        .clone()
}

fn fill_msg(r: &Registry) -> String {
    let msg = FillMsg {
        pack: pack(),
        terms: terms(),
        contents_hash: contents_hash(r),
    };
    json!({ "fill": msg }).to_string()
}

fn safe_reads() -> Vec<PromiseResult> {
    vec![
        ok_json(&json!([])),
        ok_json(&json!(true)),
        ok_json(&json!(false)),
        ok_json(&json!([U128(ZEC_AMOUNT)])),
    ]
}

fn written() -> Registry {
    let mut r = offered();
    set(&verifier_id(), NOW);
    let msg = fill_msg(&r);
    assert!(
        r.check_fill(
            &taker(),
            &[USDC.into()],
            &[U128(PRICE)],
            &serde_json::from_str::<TransferMsg>(&msg)
                .map(|m| match m {
                    TransferMsg::Fill(f) => f,
                    TransferMsg::Exercise => unreachable!(),
                })
                .unwrap()
        )
        .is_ok()
    );
    set_results(NOW, safe_reads());
    assert_eq!(
        r.on_fill_checked(pack(), taker(), U128(PRICE)),
        vec![U128(0)]
    );
    r
}

fn view(r: &Registry) -> PositionView {
    r.position_of(pack()).unwrap()
}

fn route(
    r: &mut Registry,
    taker_id: &AccountId,
    amount: u128,
    msg: &str,
) -> Result<(), MosaecError> {
    set(&verifier_id(), NOW);
    r.route_fill(taker_id, &[USDC.into()], &[U128(amount)], msg)
        .map(|_| ())
        .map_err(|(_, e)| e)
}

// ---------------------------------------------------------------------------------------------
// Mint
// ---------------------------------------------------------------------------------------------

#[test]
fn mint_needs_the_deposit_and_an_open_registry() {
    let mut r = fresh();
    set_paying(&maker(), NearToken::from_millinear(1));
    assert_eq!(r.try_mint().err(), Some(MosaecError::Storage));
    set_paying(&maker(), MINT_DEPOSIT);
    assert!(r.try_mint().is_ok());
    assert_eq!(r.config().packs_created, 2);
    set(&guardian(), NOW);
    r.pause_new().unwrap();
    set_paying(&maker(), MINT_DEPOSIT);
    assert_eq!(r.try_mint().err(), Some(MosaecError::Paused));
}

#[test]
fn minted_pack_has_a_title() {
    let r = fresh();
    let v = view(&r);
    assert_eq!(v.title_owner, Some(maker()));
    assert_eq!(v.position.stage, Stage::Free);
    assert_eq!(r.nft_total_supply(), U128(1));
}

#[test]
fn failed_create_mints_nothing() {
    let mut r = fresh();
    set_results(NOW, vec![PromiseResult::Failed]);
    assert!(!r.on_minted(acc("1.v0.mosaec.near"), maker(), 1));
    assert!(r.position_of(acc("1.v0.mosaec.near")).is_none());
}

// ---------------------------------------------------------------------------------------------
// Offer and cancel
// ---------------------------------------------------------------------------------------------

#[test]
fn offer_only_by_title_holder() {
    let mut r = fresh();
    set(&taker(), NOW);
    assert_eq!(
        r.try_offer(&pack(), &request()).err(),
        Some(MosaecError::Holder)
    );
    set(&maker(), NOW);
    assert!(r.try_offer(&pack(), &request()).is_ok());
    assert!(view(&r).title_pending);
}

#[test]
fn offer_commits_the_read_balances() {
    let r = offered();
    let v = view(&r);
    assert!(!v.title_pending);
    let offer = v.position.offer().unwrap().clone();
    assert_eq!(offer.contents.amounts(), vec![U128(ZEC_AMOUNT)]);
}

#[test]
fn offer_of_an_empty_balance_refused() {
    let mut r = fresh();
    set_results(NOW, vec![ok_json(&json!([U128(0)]))]);
    assert!(!r.on_offer_balances(pack(), maker(), request()));
    assert_eq!(view(&r).position.stage, Stage::Free);
}

#[test]
fn title_transfer_cancels_offer() {
    let mut r = offered();
    set_paying(&maker(), NearToken::from_yoctonear(1));
    r.nft_transfer(acc("buyer.near"), "t0".into(), None, None);
    assert_eq!(view(&r).position.stage, Stage::Free);
    assert!(get_logs().iter().any(|l| l.contains("title_moved")));
}

#[test]
fn cancel_by_holder_even_when_paused() {
    let mut r = offered();
    set(&guardian(), NOW);
    r.pause_new().unwrap();
    set(&taker(), NOW);
    assert_eq!(r.cancel(pack()), Err(MosaecError::Holder));
    set(&maker(), NOW);
    assert_eq!(r.cancel(pack()), Ok(()));
    assert_eq!(view(&r).position.stage, Stage::Free);
}

// ---------------------------------------------------------------------------------------------
// Fill
// ---------------------------------------------------------------------------------------------

#[test]
#[should_panic(expected = "E_NOT_VERIFIER")]
fn fill_refuses_non_verifier() {
    let mut r = offered();
    let msg = fill_msg(&r);
    set(&taker(), NOW);
    r.mt_on_transfer(
        taker(),
        vec![taker()],
        vec![USDC.into()],
        vec![U128(PRICE)],
        msg,
    );
}

#[test]
fn fill_routing_refusals() {
    let mut r = offered();
    let msg = fill_msg(&r);
    assert_eq!(
        route(&mut r, &maker(), PRICE, &msg),
        Err(MosaecError::SelfFill)
    );
    assert_eq!(
        route(&mut r, &taker(), PRICE - 1, &msg),
        Err(MosaecError::Amount)
    );
    assert_eq!(
        route(&mut r, &taker(), PRICE, "\"exercise\""),
        Err(MosaecError::State)
    );
    assert_eq!(
        route(&mut r, &taker(), PRICE, "nope"),
        Err(MosaecError::Msg)
    );
    let forged = msg.replace("0.v0.mosaec.near", "0.evil.near");
    assert_eq!(
        route(&mut r, &taker(), PRICE, &forged),
        Err(MosaecError::NotPack)
    );
}

#[test]
fn sale_mid_fill_refused() {
    let mut r = offered();
    let msg = fill_msg(&r);
    assert_eq!(route(&mut r, &taker(), PRICE, &msg), Ok(()));
    assert!(view(&r).title_pending);
    set_paying(&maker(), NearToken::from_yoctonear(1));
    assert_eq!(
        r.try_transfer(&acc("buyer.near"), "t0", None, None),
        Err(MosaecError::Pending)
    );
    assert_eq!(
        route(&mut r, &acc("other.near"), PRICE, &msg),
        Err(MosaecError::Pending)
    );
}

#[test]
fn decided_fill_moves_title_and_mints_ticket() {
    let r = written();
    let v = view(&r);
    assert_eq!(v.title_owner, Some(taker()));
    assert_eq!(v.ticket_owner, Some(maker()));
    assert!(!v.title_pending);
    let payout = v.position.payout.clone().unwrap();
    assert_eq!(
        (payout.maker_id, payout.amount, payout.in_flight),
        (maker(), U128(PRICE), true)
    );
    assert_eq!(v.position.ticket_id(), Some("k0.1"));
}

#[test]
fn fill_refused_on_unsafe_reads_refunds_price() {
    let mut r = offered();
    let msg = fill_msg(&r);
    assert_eq!(route(&mut r, &taker(), PRICE, &msg), Ok(()));
    let mut reads = safe_reads();
    reads[0] = ok_json(&json!([
        "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp"
    ]));
    set_results(NOW, reads);
    assert_eq!(
        r.on_fill_checked(pack(), taker(), U128(PRICE)),
        vec![U128(PRICE)]
    );
    let v = view(&r);
    assert!(!v.title_pending);
    assert_eq!(v.title_owner, Some(maker()));
    assert!(v.position.offer().is_some());
}

#[test]
fn pause_landing_mid_fill_refunds() {
    let mut r = offered();
    let msg = fill_msg(&r);
    assert_eq!(route(&mut r, &taker(), PRICE, &msg), Ok(()));
    set(&guardian(), NOW);
    r.pause_new().unwrap();
    set_results(NOW, safe_reads());
    assert_eq!(
        r.on_fill_checked(pack(), taker(), U128(PRICE)),
        vec![U128(PRICE)]
    );
}

#[test]
fn payout_retry_only_after_failure() {
    let mut r = written();
    set(&maker(), NOW);
    assert_eq!(r.claim_payout(pack()), Err(MosaecError::Pending));
    set_results(NOW, vec![PromiseResult::Failed]);
    r.on_paid(pack());
    assert!(!view(&r).position.payout.unwrap().in_flight);
    set(&acc("anyone.near"), NOW);
    assert_eq!(r.claim_payout(pack()), Ok(()));
    set_results(NOW, vec![PromiseResult::Successful(vec![])]);
    r.on_paid(pack());
    assert!(view(&r).position.payout.is_none());
}

#[test]
fn encumbrance_sync() {
    let mut r = written();
    set(&acc("anyone.near"), NOW);
    assert_eq!(r.sync_encumbrance(pack()), Ok(()));
    set_results(NOW, vec![PromiseResult::Successful(vec![])]);
    r.on_encumbered(pack(), "k0.1".into());
    set(&acc("anyone.near"), NOW);
    assert_eq!(r.sync_encumbrance(pack()), Err(MosaecError::State));
}

// ---------------------------------------------------------------------------------------------
// Exercise hooks
// ---------------------------------------------------------------------------------------------

#[test]
fn exercise_hooks_refuse_other_callers() {
    let mut r = written();
    set(&maker(), NOW);
    assert_eq!(r.begin_exercise(pack(), maker()), Err(MosaecError::NotPack));
    assert_eq!(r.end_exercise(pack(), true), Err(MosaecError::NotPack));
}

#[test]
fn sold_ticket_cannot_exercise() {
    let mut r = written();
    set_paying(&maker(), NearToken::from_yoctonear(1));
    r.nft_transfer(acc("buyer.near"), "k0.1".into(), None, None);
    set(&pack(), NOW);
    assert_eq!(r.begin_exercise(pack(), maker()), Err(MosaecError::Holder));
    assert_eq!(r.begin_exercise(pack(), acc("buyer.near")), Ok(()));
}

#[test]
fn sold_title_keeps_the_ticket_and_the_payout() {
    let mut r = written();
    set_paying(&taker(), NearToken::from_yoctonear(1));
    r.nft_transfer(acc("buyer.near"), "t0".into(), None, None);
    let v = view(&r);
    assert!(matches!(v.position.stage, Stage::Written { .. }));
    assert_eq!(v.title_owner, Some(acc("buyer.near")));
    assert_eq!(v.ticket_owner, Some(maker()));
    assert_eq!(v.position.payout.unwrap().maker_id, maker());

    let to = Destination::Verifier {
        account_id: taker(),
    };
    set(&taker(), NOW);
    assert_eq!(
        r.try_withdraw(&pack(), ZEC, U128(1), &to).err(),
        Some(MosaecError::Holder)
    );
    set(&acc("buyer.near"), NOW);
    assert_eq!(
        r.try_withdraw(&pack(), ZEC, U128(1), &to).err(),
        Some(MosaecError::State)
    );

    set(&pack(), NOW);
    r.begin_exercise(pack(), maker()).unwrap();
    r.end_exercise(pack(), true).unwrap();
    let v = view(&r);
    assert_eq!(v.position.stage, Stage::Free);
    assert_eq!(v.title_owner, Some(acc("buyer.near")));
    set(&taker(), NOW);
    assert_eq!(
        r.try_withdraw(&pack(), USDC, U128(K), &to).err(),
        Some(MosaecError::Holder)
    );
}

#[test]
fn ticket_transfer_refused_during_exercise() {
    let mut r = written();
    set(&pack(), NOW);
    r.begin_exercise(pack(), maker()).unwrap();
    assert_eq!(r.begin_exercise(pack(), maker()), Err(MosaecError::Pending));
    set_paying(&maker(), NearToken::from_yoctonear(1));
    assert_eq!(
        r.try_transfer(&acc("buyer.near"), "k0.1", None, None),
        Err(MosaecError::Pending)
    );
}

#[test]
fn decided_exercise_burns_ticket_and_frees_pack() {
    let mut r = written();
    set(&pack(), NOW);
    r.begin_exercise(pack(), maker()).unwrap();
    r.end_exercise(pack(), true).unwrap();
    let v = view(&r);
    assert_eq!(v.position.stage, Stage::Free);
    assert_eq!(v.ticket_owner, None);
    assert!(r.nft_token("k0.1".into()).is_none());
    assert_eq!(v.title_owner, Some(taker()));
}

#[test]
fn refused_exercise_unlocks_ticket() {
    let mut r = written();
    set(&pack(), NOW);
    r.begin_exercise(pack(), maker()).unwrap();
    r.end_exercise(pack(), false).unwrap();
    assert!(!view(&r).ticket_pending);
}

#[test]
fn exercise_refused_during_nft_transfer_call() {
    let mut r = written();
    set_paying(&maker(), NearToken::from_yoctonear(1));
    assert!(
        r.try_transfer_call(&acc("market.near"), "k0.1", None, None, "")
            .is_ok()
    );
    set(&pack(), NOW);
    assert_eq!(
        r.begin_exercise(pack(), acc("market.near")),
        Err(MosaecError::Pending)
    );
    set_results(NOW, vec![ok_json(&json!(true))]);
    assert!(!r.nft_resolve_transfer(maker(), acc("market.near"), "k0.1".into(), None));
    assert_eq!(view(&r).ticket_owner, Some(maker()));
    assert!(!view(&r).ticket_pending);
}

#[test]
fn ticket_in_verifier_refused() {
    let mut r = written();
    set_paying(&maker(), NearToken::from_yoctonear(1));
    assert!(
        r.try_transfer_call(&verifier_id(), "k0.1", None, None, "")
            .is_ok()
    );
    set_results(NOW, vec![ok_json(&json!(false))]);
    assert!(r.nft_resolve_transfer(maker(), verifier_id(), "k0.1".into(), None));
    set(&pack(), NOW);
    assert_eq!(r.begin_exercise(pack(), maker()), Err(MosaecError::Holder));
}

#[test]
fn finalize_reads_the_pack() {
    let mut r = written();
    set(&pack(), NOW);
    r.begin_exercise(pack(), maker()).unwrap();
    set(&acc("anyone.near"), NOW);
    assert_eq!(r.finalize_exercise(pack()), Ok(()));
    let status = |state: &str, live: bool| {
        ok_json(&json!({ "phase": { "state": state }, "exercise_in_flight": live }))
    };
    set_results(NOW, vec![status("written", true)]);
    r.on_finalize_status(pack(), "k0.1".into());
    assert!(view(&r).ticket_pending);
    set_results(NOW, vec![status("written", false)]);
    r.on_finalize_status(pack(), "k0.1".into());
    assert!(!view(&r).ticket_pending);
    set(&pack(), NOW);
    r.begin_exercise(pack(), maker()).unwrap();
    set_results(NOW, vec![status("releasing", false)]);
    r.on_finalize_status(pack(), "k0.1".into());
    assert_eq!(view(&r).position.stage, Stage::Free);
}

// ---------------------------------------------------------------------------------------------
// Expire and withdraw
// ---------------------------------------------------------------------------------------------

#[test]
fn expire_waits_for_t_and_for_the_pack() {
    let mut r = written();
    let t = NOW + DEFAULT_TERM_NS;
    set(&acc("anyone.near"), t);
    assert_eq!(r.expire(pack()), Err(MosaecError::State));
    set(&acc("anyone.near"), t + 1);
    assert_eq!(r.expire(pack()), Ok(()));
    assert_eq!(r.expire(pack()), Err(MosaecError::Pending));
    set_results(t + 1, vec![PromiseResult::Failed]);
    r.on_unencumbered(pack(), "k0.1".into());
    assert!(matches!(view(&r).position.stage, Stage::Written { .. }));
    set(&acc("anyone.near"), t + 2);
    assert_eq!(r.expire(pack()), Ok(()));
    set_results(t + 2, vec![PromiseResult::Successful(vec![])]);
    r.on_unencumbered(pack(), "k0.1".into());
    let v = view(&r);
    assert_eq!(v.position.stage, Stage::Free);
    assert_eq!(v.ticket_owner, None);
    assert_eq!(v.title_owner, Some(taker()));
}

#[test]
fn expire_refused_during_exercise() {
    let mut r = written();
    set(&pack(), NOW);
    r.begin_exercise(pack(), maker()).unwrap();
    set(&acc("anyone.near"), NOW + DEFAULT_TERM_NS + 1);
    assert_eq!(r.expire(pack()), Err(MosaecError::Pending));
}

#[test]
fn withdraw_rules() {
    let mut r = written();
    let to = Destination::Verifier {
        account_id: taker(),
    };
    set(&taker(), NOW);
    assert_eq!(
        r.try_withdraw(&pack(), ZEC, U128(1), &to).err(),
        Some(MosaecError::State)
    );
    let mut r = fresh();
    set(&taker(), NOW);
    assert_eq!(
        r.try_withdraw(&pack(), ZEC, U128(1), &to).err(),
        Some(MosaecError::Holder)
    );
    set(&maker(), NOW);
    let home = Destination::HomeChain {
        address: "t1abc".into(),
    };
    assert_eq!(
        r.try_withdraw(&pack(), ZEC, U128(1), &home).err(),
        Some(MosaecError::MinWithdraw)
    );
    assert!(r.try_withdraw(&pack(), ZEC, U128(1), &to).is_ok());
    assert!(view(&r).title_pending);
    set_results(NOW, vec![PromiseResult::Successful(vec![])]);
    assert!(r.on_withdrawn(pack(), ZEC.into(), U128(1), to));
    assert!(!view(&r).title_pending);
}

// ---------------------------------------------------------------------------------------------
// Guardian
// ---------------------------------------------------------------------------------------------

#[test]
fn only_guardian_pauses() {
    let mut r = fresh();
    set(&maker(), NOW);
    assert_eq!(r.pause_new(), Err(MosaecError::NotGuardian));
    assert_eq!(r.unpause_new(), Err(MosaecError::NotGuardian));
    set(&guardian(), NOW);
    assert_eq!(r.pause_new(), Ok(()));
    assert!(r.config().paused);
    assert_eq!(r.unpause_new(), Ok(()));
}

#[test]
fn guardian_pause_allows_existing_positions() {
    let mut r = written();
    set(&guardian(), NOW);
    r.pause_new().unwrap();
    set(&maker(), NOW);
    assert_eq!(
        r.try_offer(&pack(), &request()).err(),
        Some(MosaecError::Paused)
    );
    set(&pack(), NOW);
    assert_eq!(r.begin_exercise(pack(), maker()), Ok(()));
    r.end_exercise(pack(), false).unwrap();
    set_paying(&maker(), NearToken::from_yoctonear(1));
    assert!(
        r.try_transfer(&acc("buyer.near"), "k0.1", None, None)
            .is_ok()
    );
    set(&acc("anyone.near"), NOW + DEFAULT_TERM_NS + 1);
    assert_eq!(r.expire(pack()), Ok(()));
}

// ---------------------------------------------------------------------------------------------
// NEP-171
// ---------------------------------------------------------------------------------------------

#[test]
fn transfer_rules() {
    let mut r = fresh();
    set_paying(&maker(), NearToken::from_yoctonear(0));
    assert_eq!(
        r.try_transfer(&taker(), "t0", None, None),
        Err(MosaecError::Amount)
    );
    set_paying(&maker(), NearToken::from_yoctonear(1));
    assert_eq!(
        r.try_transfer(&taker(), "t0", Some(1), None),
        Err(MosaecError::Msg)
    );
    assert_eq!(
        r.try_transfer(&maker(), "t0", None, None),
        Err(MosaecError::Holder)
    );
    set_paying(&taker(), NearToken::from_yoctonear(1));
    assert_eq!(
        r.try_transfer(&maker(), "t0", None, None),
        Err(MosaecError::Holder)
    );
}

#[test]
fn enumeration() {
    let r = written();
    assert_eq!(r.nft_total_supply(), U128(2));
    assert_eq!(r.nft_supply_for_owner(maker()), U128(1));
    let mine = r.nft_tokens_for_owner(taker(), None, None);
    assert_eq!(mine.len(), 1);
    assert_eq!(mine[0].token_id, "t0");
    assert_eq!(r.nft_tokens(Some(U128(1)), Some(5)).len(), 1);
}

// ---------------------------------------------------------------------------------------------
// Network guard
// ---------------------------------------------------------------------------------------------

#[test]
#[should_panic(expected = "E_NOT_VERIFIER")]
fn mainnet_registry_refuses_another_verifier() {
    set(&registry_id(), NOW);
    let _ = Registry::new(
        guardian(),
        [7u8; 32].into(),
        Network::Mainnet,
        acc("fake.near"),
    );
}

#[test]
#[should_panic(expected = "E_NOT_VERIFIER")]
fn testnet_registry_refuses_a_mainnet_account() {
    set(&registry_id(), NOW);
    let _ = Registry::new(
        guardian(),
        [7u8; 32].into(),
        Network::Testnet,
        acc("intents.mosaec.testnet"),
    );
}

#[test]
fn testnet_registry_takes_its_own_verifier() {
    let mut c = ctx(&acc("v0.mosaec.testnet"), NOW, NearToken::from_yoctonear(0));
    c.current_account_id(acc("v0.mosaec.testnet"));
    testing_env!(c.build());
    let r = Registry::new(
        acc("mosaec.testnet"),
        [7u8; 32].into(),
        Network::Testnet,
        acc("intents.mosaec.testnet"),
    );
    assert_eq!(r.config().verifier, acc("intents.mosaec.testnet"));
}
