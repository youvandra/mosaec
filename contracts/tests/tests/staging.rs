//! The staging registry as `mosaec-deploy` creates it on mainnet: staging caps and short terms,
//! so a rehearsal sees a full pawn through expiry inside the hour.

#![cfg(feature = "sandbox")]

mod common;

use anyhow::Result;
use common::{World, checked, has_event, ok, refused_code};
use mosaec_shared::constants::{STAGING_MIN_TERM_NS, USDC, ZEC};
use serde_json::json;

const ZEC_AMOUNT: u128 = 2_000_000; // 0.02 ZEC, under the 0.05 staging cap
const PRICE: u128 = 1_000_000; // 1 USDC
const K: u128 = 1_100_000; // 1.1 USDC

fn terms() -> serde_json::Value {
    json!({ "k_token": USDC, "k_amount": K.to_string(), "term_ns": STAGING_MIN_TERM_NS })
}

#[tokio::test]
async fn ten_minute_pawn_expires_on_staging() -> Result<()> {
    let w = World::staging().await?;
    assert_eq!(w.registry.id().as_str(), "staging.mosaec.near");
    assert_eq!(
        w.view_registry("config", json!({})).await?["profile"],
        "Staging"
    );

    let borrower = w.user().await?;
    let lender = w.user().await?;
    w.fund(&borrower, ZEC, ZEC_AMOUNT).await?;
    w.fund(&lender, USDC, PRICE).await?;
    let pack = w.mint(&borrower).await?;
    assert_eq!(pack.as_str(), "0.staging.mosaec.near");
    checked(
        w.transfer_in_verifier(&borrower, &pack, ZEC, ZEC_AMOUNT)
            .await?,
    )?;

    let offer = json!({
        "pack": pack, "token_ids": [ZEC], "terms": terms(), "pay_token": USDC,
        "price": PRICE.to_string(), "offer_expires_at_ns": u64::MAX / 2,
    });
    checked(
        borrower
            .call(w.registry.id(), "offer")
            .args_json(offer)
            .max_gas()
            .transact()
            .await?,
    )?;
    let hash = w.position(&pack).await?["position"]["stage"]["contents_hash"]
        .as_str()
        .unwrap_or_default()
        .to_owned();
    let msg =
        json!({ "fill": { "pack": pack, "terms": terms(), "contents_hash": hash } }).to_string();
    checked(
        w.transfer_call(&lender, w.registry.id(), USDC, PRICE, &msg)
            .await?,
    )?;
    assert_eq!(w.balance(borrower.id(), USDC).await?, PRICE);

    let t = w.pack_status(&pack).await?["exercise_deadline_ns"]
        .as_u64()
        .unwrap_or_default();
    let now = common::now_ns(&w).await?;
    assert!(
        t > now && t - now <= STAGING_MIN_TERM_NS,
        "staging T should be ten minutes out"
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
async fn staging_caps_refuse_production_sizes() -> Result<()> {
    let w = World::staging().await?;
    let borrower = w.user().await?;
    w.fund(&borrower, ZEC, 100_000_000).await?;
    let pack = w.mint(&borrower).await?;
    checked(
        w.transfer_in_verifier(&borrower, &pack, ZEC, 100_000_000)
            .await?,
    )?;
    let offer = json!({
        "pack": pack, "token_ids": [ZEC], "terms": terms(), "pay_token": USDC,
        "price": PRICE.to_string(), "offer_expires_at_ns": u64::MAX / 2,
    });
    let res = borrower
        .call(w.registry.id(), "offer")
        .args_json(offer)
        .max_gas()
        .transact()
        .await?;
    assert_eq!(refused_code(&res).as_deref(), Some("E_CAP"));
    assert_eq!(
        w.position(&pack).await?["position"]["stage"]["state"],
        "free"
    );
    Ok(())
}
