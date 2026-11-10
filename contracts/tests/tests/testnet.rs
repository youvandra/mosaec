//! Testnet as `mosaec-deploy` builds it from an empty `mosaec.testnet`: our deploy of the mainnet
//! verifier bytes, test tokens, the pack code and `v0.mosaec.testnet`. Terms start at ten minutes,
//! so a rehearsal sees a full pawn through expiry inside the hour.

#![cfg(feature = "sandbox")]

mod common;

use anyhow::Result;
use common::{World, checked, has_event, ok, refused_code};
use mosaec_shared::constants::{TESTNET_MIN_TERM_NS, ZEC};
use serde_json::json;

const ZEC_AMOUNT: u128 = 50_000_000; // 0.5 test ZEC
const PRICE: u128 = 100_000_000; // 100 test USDC
const K: u128 = 107_500_000; // 107.5 test USDC

fn terms(w: &World) -> serde_json::Value {
    json!({ "k_token": w.usdc_id, "k_amount": K.to_string(), "term_ns": TESTNET_MIN_TERM_NS })
}

fn offer(
    w: &World,
    pack: &near_workspaces::AccountId,
    token: &str,
    amount_price: u128,
) -> serde_json::Value {
    json!({
        "pack": pack, "token_ids": [token], "terms": terms(w), "pay_token": w.usdc_id,
        "price": amount_price.to_string(), "offer_expires_at_ns": u64::MAX / 2,
    })
}

#[tokio::test]
async fn testnet_deploy_runs_a_ten_minute_pawn_to_expiry() -> Result<()> {
    let w = World::testnet().await?;
    assert_eq!(w.registry.id().as_str(), "v0.mosaec.testnet");
    let config = w.view_registry("config", json!({})).await?;
    assert_eq!(config["network"], "Testnet");
    assert_eq!(config["verifier"], "intents.mosaec.testnet");

    let borrower = w.user().await?;
    let lender = w.user().await?;
    w.fund(&borrower, w.zec_id, ZEC_AMOUNT).await?;
    w.fund(&lender, w.usdc_id, PRICE).await?;
    assert_eq!(w.balance(borrower.id(), w.zec_id).await?, ZEC_AMOUNT);

    let pack = w.mint(&borrower).await?;
    assert_eq!(pack.as_str(), "0.v0.mosaec.testnet");
    assert_eq!(
        w.pack_status(&pack).await?["verifier"],
        "intents.mosaec.testnet"
    );
    checked(
        w.transfer_in_verifier(&borrower, &pack, w.zec_id, ZEC_AMOUNT)
            .await?,
    )?;
    checked(
        borrower
            .call(w.registry.id(), "offer")
            .args_json(offer(&w, &pack, w.zec_id, PRICE))
            .max_gas()
            .transact()
            .await?,
    )?;
    let hash = w.position(&pack).await?["position"]["stage"]["contents_hash"]
        .as_str()
        .unwrap_or_default()
        .to_owned();
    let msg =
        json!({ "fill": { "pack": pack, "terms": terms(&w), "contents_hash": hash } }).to_string();
    checked(
        w.transfer_call(&lender, w.registry.id(), w.usdc_id, PRICE, &msg)
            .await?,
    )?;
    assert_eq!(w.balance(borrower.id(), w.usdc_id).await?, PRICE);

    let t = w.pack_status(&pack).await?["exercise_deadline_ns"]
        .as_u64()
        .unwrap_or_default();
    let now = common::now_ns(&w).await?;
    assert!(
        t > now && t - now <= TESTNET_MIN_TERM_NS,
        "testnet T should be ten minutes out"
    );
    common::advance_past(&w, t).await?;
    let res = ok(lender
        .call(w.registry.id(), "expire")
        .args_json(json!({ "pack": pack }))
        .max_gas()
        .transact()
        .await?)?;
    assert!(has_event(&res, "expired"), "logs: {:?}", res.logs());
    assert_eq!(w.position(&pack).await?["title_owner"], json!(lender.id()));
    Ok(())
}

#[tokio::test]
async fn testnet_refuses_mainnet_tokens_and_oversized_collateral() -> Result<()> {
    let w = World::testnet().await?;
    let borrower = w.user().await?;
    w.fund(&borrower, w.zec_id, 200_000_000).await?;
    let pack = w.mint(&borrower).await?;
    checked(
        w.transfer_in_verifier(&borrower, &pack, w.zec_id, 200_000_000)
            .await?,
    )?;

    let res = borrower
        .call(w.registry.id(), "offer")
        .args_json(offer(&w, &pack, w.zec_id, PRICE))
        .max_gas()
        .transact()
        .await?;
    assert_eq!(refused_code(&res).as_deref(), Some("E_CAP"));

    let res = borrower
        .call(w.registry.id(), "offer")
        .args_json(offer(&w, &pack, ZEC, PRICE))
        .max_gas()
        .transact()
        .await?;
    assert_eq!(refused_code(&res).as_deref(), Some("E_TOKEN"));
    assert_eq!(
        w.position(&pack).await?["position"]["stage"]["state"],
        "free"
    );
    Ok(())
}
