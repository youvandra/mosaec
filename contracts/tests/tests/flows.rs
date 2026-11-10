//! End-to-end pawn flows on a sandbox with the mainnet verifier bytes.
//! Run: build both contracts, then `cargo test -p mosaec-tests --features sandbox -- --nocapture`.

#![cfg(feature = "sandbox")]

mod common;

use anyhow::Result;
use common::{MAX_GAS, World, checked, has_event, ok, refused_code};
use mosaec_shared::constants::{DEFAULT_TERM_NS, GRACE_NS, HOUR_NS, MIN_TERM_NS, USDC, ZEC};
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::{Account, AccountId};
use serde_json::{Value, json};

const ZEC_AMOUNT: u128 = 50_000_000; // 0.5 ZEC
const PRICE: u128 = 100_000_000; // 100 USDC principal
const K: u128 = 107_500_000; // 107.5 USDC repayment

fn terms_for(term_ns: u64) -> Value {
    json!({ "k_token": USDC, "k_amount": K.to_string(), "term_ns": term_ns })
}

/// One written pawn: borrower minted, filled with 0.5 ZEC, offered; lender filled.
struct Pawn {
    world: World,
    borrower: Account,
    lender: Account,
    pack: AccountId,
    fill: ExecutionFinalResult,
}

fn gas_tgas(res: &ExecutionFinalResult) -> u64 {
    res.total_gas_burnt.as_tgas()
}

async fn offered() -> Result<(World, Account, Account, AccountId)> {
    offered_for(DEFAULT_TERM_NS).await
}

async fn offered_for(term_ns: u64) -> Result<(World, Account, Account, AccountId)> {
    let world = World::new().await?;
    let borrower = world.user().await?;
    let lender = world.user().await?;
    world.fund(&borrower, ZEC, ZEC_AMOUNT).await?;
    world.fund(&borrower, USDC, K).await?;
    world.fund(&lender, USDC, PRICE).await?;

    let pack = world.mint(&borrower).await?;
    checked(
        world
            .transfer_in_verifier(&borrower, &pack, ZEC, ZEC_AMOUNT)
            .await?,
    )?;
    let offer = json!({
        "pack": pack,
        "token_ids": [ZEC],
        "terms": terms_for(term_ns),
        "pay_token": USDC,
        "price": PRICE.to_string(),
        "offer_expires_at_ns": u64::MAX / 2,
    });
    let res = ok(borrower
        .call(world.registry.id(), "offer")
        .args_json(offer)
        .max_gas()
        .transact()
        .await?)?;
    assert!(
        has_event(&res, "offer_created"),
        "offer not created: {:?}",
        res.logs()
    );
    Ok((world, borrower, lender, pack))
}

fn fill_msg(pack: &AccountId, hash: &str) -> String {
    fill_msg_for(pack, hash, DEFAULT_TERM_NS)
}

fn fill_msg_for(pack: &AccountId, hash: &str, term_ns: u64) -> String {
    json!({ "fill": { "pack": pack, "terms": terms_for(term_ns), "contents_hash": hash } })
        .to_string()
}

async fn contents_hash(world: &World, pack: &AccountId) -> Result<String> {
    let p = world.position(pack).await?;
    Ok(p["position"]["stage"]["contents_hash"]
        .as_str()
        .unwrap_or_default()
        .to_owned())
}

async fn written() -> Result<Pawn> {
    written_for(DEFAULT_TERM_NS).await
}

async fn written_for(term_ns: u64) -> Result<Pawn> {
    let (world, borrower, lender, pack) = offered_for(term_ns).await?;
    let hash = contents_hash(&world, &pack).await?;
    let fill = ok(world
        .transfer_call(
            &lender,
            world.registry.id(),
            USDC,
            PRICE,
            &fill_msg_for(&pack, &hash, term_ns),
        )
        .await?)?;
    Ok(Pawn {
        world,
        borrower,
        lender,
        pack,
        fill,
    })
}

#[tokio::test]
async fn pawn_fill_moves_title_ticket_and_principal() -> Result<()> {
    let p = written().await?;
    let w = &p.world;
    assert!(has_event(&p.fill, "filled"), "logs: {:?}", p.fill.logs());
    let pos = w.position(&p.pack).await?;
    assert_eq!(pos["title_owner"], json!(p.lender.id()));
    assert_eq!(pos["ticket_owner"], json!(p.borrower.id()));
    assert_eq!(pos["position"]["stage"]["state"], "written");
    assert_eq!(pos["position"]["stage"]["synced"], true);
    assert!(
        pos["position"]["payout"].is_null(),
        "payout not delivered: {pos}"
    );
    assert_eq!(w.balance(p.borrower.id(), USDC).await?, K + PRICE);
    assert_eq!(w.balance(p.lender.id(), USDC).await?, 0);
    assert_eq!(w.balance(w.registry.id(), USDC).await?, 0);
    let status = w.pack_status(&p.pack).await?;
    assert_eq!(status["phase"]["state"], "written");
    println!("gas: fill {} Tgas", gas_tgas(&p.fill));
    Ok(())
}

#[tokio::test]
async fn exercise_releases_contents_and_keeps_k() -> Result<()> {
    let p = written().await?;
    let w = &p.world;
    let res = ok(w
        .transfer_call(&p.borrower, &p.pack, USDC, K, "\"exercise\"")
        .await?)?;
    assert_eq!(w.balance(p.borrower.id(), ZEC).await?, ZEC_AMOUNT);
    assert_eq!(w.balance(p.borrower.id(), USDC).await?, PRICE);
    assert_eq!(w.balance(&p.pack, USDC).await?, K);
    assert_eq!(w.balance(&p.pack, ZEC).await?, 0);
    let pos = w.position(&p.pack).await?;
    assert_eq!(pos["position"]["stage"]["state"], "free");
    assert!(pos["ticket_owner"].is_null());
    assert_eq!(w.pack_status(&p.pack).await?["phase"]["state"], "free");
    println!("gas: exercise {} Tgas", gas_tgas(&res));

    let to_lender = json!({ "kind": "verifier", "account_id": p.lender.id() });
    let args = json!({ "pack": p.pack, "token_id": USDC, "amount": K.to_string(), "destination": to_lender });
    let res = ok(p
        .lender
        .call(w.registry.id(), "withdraw")
        .args_json(args)
        .max_gas()
        .transact()
        .await?)?;
    assert_eq!(w.balance(p.lender.id(), USDC).await?, K);
    println!("gas: withdraw {} Tgas", gas_tgas(&res));
    Ok(())
}

#[tokio::test]
async fn short_pay_and_stranger_exercise_are_refunded() -> Result<()> {
    let p = written().await?;
    let w = &p.world;
    let res = w
        .transfer_call(&p.borrower, &p.pack, USDC, K - 1, "\"exercise\"")
        .await?;
    assert_eq!(refused_code(&res).as_deref(), Some("E_AMOUNT"));
    assert_eq!(w.balance(p.borrower.id(), USDC).await?, K + PRICE);

    let stranger = w.user().await?;
    w.fund(&stranger, USDC, K).await?;
    let res = w
        .transfer_call(&stranger, &p.pack, USDC, K, "\"exercise\"")
        .await?;
    assert_eq!(refused_code(&res).as_deref(), Some("E_HOLDER"));
    assert_eq!(w.balance(&stranger.id().clone(), USDC).await?, K);
    assert_eq!(w.balance(&p.pack, ZEC).await?, ZEC_AMOUNT);
    assert_eq!(w.position(&p.pack).await?["ticket_pending"], false);
    Ok(())
}

#[tokio::test]
async fn bait_and_switch_and_self_fill_refunded() -> Result<()> {
    let (w, borrower, lender, pack) = offered().await?;
    let res = w
        .transfer_call(
            &lender,
            w.registry.id(),
            USDC,
            PRICE,
            &fill_msg(&pack, "00"),
        )
        .await?;
    assert_eq!(refused_code(&res).as_deref(), Some("E_CONTENTS"));
    assert_eq!(w.balance(lender.id(), USDC).await?, PRICE);

    let hash = contents_hash(&w, &pack).await?;
    let res = w
        .transfer_call(
            &borrower,
            w.registry.id(),
            USDC,
            PRICE,
            &fill_msg(&pack, &hash),
        )
        .await?;
    assert_eq!(refused_code(&res).as_deref(), Some("E_SELF_FILL"));
    assert_eq!(
        w.position(&pack).await?["position"]["stage"]["state"],
        "offered"
    );
    Ok(())
}

#[tokio::test]
async fn written_pack_refuses_title_holder_withdrawal() -> Result<()> {
    let p = written().await?;
    let w = &p.world;
    let to = json!({ "kind": "verifier", "account_id": p.lender.id() });
    let args = json!({ "pack": p.pack, "token_id": ZEC, "amount": ZEC_AMOUNT.to_string(), "destination": to });
    let res = p
        .lender
        .call(w.registry.id(), "withdraw")
        .args_json(args)
        .max_gas()
        .transact()
        .await?;
    assert!(res.is_failure());
    assert!(format!("{:?}", res.into_result()).contains("E_STATE"));
    assert_eq!(w.balance(&p.pack, ZEC).await?, ZEC_AMOUNT);
    Ok(())
}

#[tokio::test]
async fn ticket_sold_moves_the_exercise_right() -> Result<()> {
    let p = written().await?;
    let w = &p.world;
    let buyer = w.user().await?;
    w.fund(&buyer, USDC, K).await?;
    let pos = w.position(&p.pack).await?;
    let ticket = pos["position"]["stage"]["ticket_id"]
        .as_str()
        .unwrap_or_default()
        .to_owned();
    let args = json!({ "receiver_id": buyer.id(), "token_id": ticket });
    checked(
        p.borrower
            .call(w.registry.id(), "nft_transfer")
            .args_json(args)
            .deposit(common::ONE_YOCTO)
            .transact()
            .await?,
    )?;

    let res = w
        .transfer_call(&p.borrower, &p.pack, USDC, K, "\"exercise\"")
        .await?;
    assert_eq!(refused_code(&res).as_deref(), Some("E_HOLDER"));
    checked(
        w.transfer_call(&buyer, &p.pack, USDC, K, "\"exercise\"")
            .await?,
    )?;
    assert_eq!(w.balance(buyer.id(), ZEC).await?, ZEC_AMOUNT);
    Ok(())
}

#[tokio::test]
async fn pack_is_keyless_and_runs_the_global_code() -> Result<()> {
    let p = written().await?;
    let keys = p.world.worker.view_access_keys(&p.pack).await?;
    assert!(keys.is_empty(), "pack has keys: {keys:?}");
    let verifier_keys: Value = p
        .world
        .worker
        .view(p.world.verifier.id(), "public_keys_of")
        .args_json(json!({ "account_id": p.pack }))
        .await?
        .json()?;
    assert_eq!(verifier_keys, json!([]));
    let details = p.world.worker.view_account(&p.pack).await?;
    println!(
        "storage: pack {} bytes, balance {}",
        details.storage_usage, details.balance
    );
    let reg = p.world.worker.view_account(p.world.registry.id()).await?;
    println!(
        "storage: registry after one pawn {} bytes",
        reg.storage_usage
    );
    let _ = MAX_GAS;
    Ok(())
}

/// Block time of the latest block, in nanoseconds.
async fn now_ns(world: &World) -> Result<u64> {
    Ok(world.worker.view_block().await?.timestamp())
}

/// Advances the sandbox until its block time passes `target_ns`.
async fn advance_past(world: &World, target_ns: u64) -> Result<()> {
    loop {
        let now = now_ns(world).await?;
        if now > target_ns {
            return Ok(());
        }
        // One block per second of block time is the sandbox's production rate; jump in chunks.
        let gap_s = (target_ns - now) / 1_000_000_000 + 1;
        world.worker.fast_forward(gap_s.min(500_000)).await?;
    }
}

async fn expires_at(world: &World, pack: &AccountId) -> Result<u64> {
    let status = world.pack_status(pack).await?;
    Ok(status["exercise_deadline_ns"].as_u64().unwrap_or_default())
}

async fn expire(world: &World, caller: &Account, pack: &AccountId) -> Result<ExecutionFinalResult> {
    Ok(caller
        .call(world.registry.id(), "expire")
        .args_json(json!({ "pack": pack }))
        .max_gas()
        .transact()
        .await?)
}

#[tokio::test]
async fn expire_after_t_gives_lender_the_pack() -> Result<()> {
    let p = written_for(MIN_TERM_NS).await?;
    let w = &p.world;
    let t = expires_at(w, &p.pack).await?;
    let res = expire(w, &p.lender, &p.pack).await?;
    assert!(res.is_failure(), "expire before T must fail");
    advance_past(w, t).await?;
    let late = w
        .transfer_call(&p.borrower, &p.pack, USDC, K, "\"exercise\"")
        .await?;
    assert_eq!(refused_code(&late).as_deref(), Some("E_EXPIRED"));
    let res = ok(expire(w, &p.lender, &p.pack).await?)?;
    assert!(has_event(&res, "expired"), "logs: {:?}", res.logs());
    println!("gas: expire {} Tgas", gas_tgas(&res));
    let pos = w.position(&p.pack).await?;
    assert_eq!(pos["position"]["stage"]["state"], "free");
    assert!(pos["ticket_owner"].is_null());
    let to = json!({ "kind": "verifier", "account_id": p.lender.id() });
    let args = json!({ "pack": p.pack, "token_id": ZEC, "amount": ZEC_AMOUNT.to_string(), "destination": to });
    checked(
        p.lender
            .call(w.registry.id(), "withdraw")
            .args_json(args)
            .max_gas()
            .transact()
            .await?,
    )?;
    assert_eq!(w.balance(p.lender.id(), ZEC).await?, ZEC_AMOUNT);
    Ok(())
}

#[tokio::test]
async fn grace_exercise_after_verifier_pause_recorded() -> Result<()> {
    let p = written_for(MIN_TERM_NS).await?;
    let w = &p.world;
    let t = expires_at(w, &p.pack).await?;
    advance_past(w, t - HOUR_NS).await?;

    let pause = json!({ "key": "mt_transfer" });
    checked(
        w.verifier
            .call(w.verifier.id(), "pa_pause_feature")
            .args_json(pause.clone())
            .max_gas()
            .transact()
            .await?,
    )?;
    let keeper = w.user().await?;
    let res = ok(keeper
        .call(&p.pack, "record_disruption")
        .max_gas()
        .transact()
        .await?)?;
    assert!(
        has_event(&res, "disruption_recorded"),
        "logs: {:?}",
        res.logs()
    );
    assert_eq!(expires_at(w, &p.pack).await?, t + GRACE_NS);
    checked(
        w.verifier
            .call(w.verifier.id(), "pa_unpause_feature")
            .args_json(pause)
            .max_gas()
            .transact()
            .await?,
    )?;

    advance_past(w, t + HOUR_NS).await?;
    let res = expire(w, &p.lender, &p.pack).await?;
    let stage = w.position(&p.pack).await?["position"]["stage"]["state"].clone();
    assert_eq!(
        stage,
        "written",
        "expire must not end the pawn in grace: {:?}",
        res.logs()
    );
    checked(
        w.transfer_call(&p.borrower, &p.pack, USDC, K, "\"exercise\"")
            .await?,
    )?;
    assert_eq!(w.balance(p.borrower.id(), ZEC).await?, ZEC_AMOUNT);
    Ok(())
}

#[tokio::test]
async fn disruption_outside_the_window_is_not_recorded() -> Result<()> {
    let p = written_for(MIN_TERM_NS).await?;
    let keeper = p.world.user().await?;
    let res = keeper
        .call(&p.pack, "record_disruption")
        .max_gas()
        .transact()
        .await?;
    assert!(res.is_failure());
    assert!(format!("{:?}", res.into_result()).contains("E_STATE"));
    Ok(())
}

#[tokio::test]
async fn fill_refused_while_pack_locked_by_verifier() -> Result<()> {
    let (w, _borrower, lender, pack) = offered().await?;
    let lock = json!({ "account_id": pack });
    checked(
        w.verifier
            .call(w.verifier.id(), "force_lock_account")
            .args_json(lock)
            .deposit(common::ONE_YOCTO)
            .max_gas()
            .transact()
            .await?,
    )?;
    let hash = contents_hash(&w, &pack).await?;
    let res = w
        .transfer_call(
            &lender,
            w.registry.id(),
            USDC,
            PRICE,
            &fill_msg(&pack, &hash),
        )
        .await?;
    assert_eq!(refused_code(&res).as_deref(), Some("E_VERIFIER_LOCKED"));
    assert_eq!(w.balance(lender.id(), USDC).await?, PRICE);
    assert_eq!(
        w.position(&pack).await?["position"]["stage"]["state"],
        "offered"
    );
    Ok(())
}
