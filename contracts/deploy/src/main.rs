//! `mosaec-deploy`: dry-run first, idempotent deploy of the Mosaec contracts.
//!
//! ```text
//! mosaec-deploy key-new  --env testnet                 create the deployer key, print its public key
//! mosaec-deploy key-show --env testnet                 print the deployer public key
//! mosaec-deploy plan     --env testnet                 print every step and its cost; sends nothing
//! mosaec-deploy apply    --env testnet --yes           send the steps, then verify
//! mosaec-deploy fund     --env testnet --asset zec --account alice.testnet --amount 50000000
//! ```
//! Options: `--root <account>`, `--rpc <url>`, `--assets zec,usdc` (testnet test tokens),
//! `--dir <contracts workspace>` (default `.`).

use std::path::PathBuf;

use anyhow::{Context, Result, bail, ensure};
use mosaec_deploy::plan::{format_near, plan, root_spend, slots};
use mosaec_deploy::rpc::Rpc;
use mosaec_deploy::target::{DEFAULT_TEST_ASSETS, Env, Target};
use mosaec_deploy::{apply, fund, keychain, load_artifacts, observe, verify};
use near_primitives::types::AccountId;

struct Args {
    command: String,
    env: Env,
    root: Option<String>,
    rpc: Option<String>,
    assets: Vec<String>,
    dir: PathBuf,
    asset: Option<String>,
    account: Option<String>,
    amount: Option<u128>,
    yes: bool,
}

fn parse_args() -> Result<Args> {
    let mut it = std::env::args().skip(1);
    let command = it.next().unwrap_or_default();
    let mut env = None;
    let mut args = Args {
        command,
        env: Env::Testnet,
        root: None,
        rpc: None,
        assets: DEFAULT_TEST_ASSETS
            .iter()
            .map(|s| (*s).to_owned())
            .collect(),
        dir: PathBuf::from("."),
        asset: None,
        account: None,
        amount: None,
        yes: false,
    };
    while let Some(flag) = it.next() {
        let mut value = || {
            it.next()
                .ok_or_else(|| anyhow::anyhow!("{flag} needs a value"))
        };
        match flag.as_str() {
            "--env" => env = Some(Env::parse(&value()?)?),
            "--root" => args.root = Some(value()?),
            "--rpc" => args.rpc = Some(value()?),
            "--assets" => args.assets = value()?.split(',').map(str::to_owned).collect(),
            "--dir" => args.dir = PathBuf::from(value()?),
            "--asset" => args.asset = Some(value()?),
            "--account" => args.account = Some(value()?),
            "--amount" => args.amount = Some(value()?.parse()?),
            "--yes" => args.yes = true,
            other => bail!("unknown option {other}"),
        }
    }
    args.env = env.context("--env mainnet|testnet is required")?;
    Ok(args)
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = parse_args()?;
    let assets: Vec<&str> = args.assets.iter().map(String::as_str).collect();
    let target = Target::for_env(args.env, args.root.as_deref(), &assets)?;
    match args.command.as_str() {
        "key-new" => {
            let pk = keychain::create(&target.root)?;
            println!("deployer public key for {}: {pk}", target.root);
            println!("add it to {} as a full-access key", target.root);
        }
        "key-show" => println!("{}", keychain::load(&target.root)?.public_key()),
        "plan" | "apply" => deploy(&args, &target).await?,
        "fund" => {
            let (rpc, key) = connect(&args, &target).await?;
            let asset = args.asset.as_deref().context("--asset is required")?;
            let account: AccountId = args
                .account
                .as_deref()
                .context("--account is required")?
                .parse()?;
            let amount = args.amount.context("--amount is required")?;
            let sent = fund(&rpc, &target, &key, asset, &account, amount).await?;
            println!(
                "credited {amount} {asset} to {account}: tx {}",
                sent.tx_hash
            );
        }
        _ => bail!("usage: mosaec-deploy <key-new|key-show|plan|apply|fund> --env mainnet|testnet"),
    }
    Ok(())
}

async fn connect(args: &Args, target: &Target) -> Result<(Rpc, keychain::DeployKey)> {
    let key = keychain::load(&target.root)?;
    let rpc = Rpc::connect(args.rpc.as_deref().unwrap_or(target.env.default_rpc()));
    let chain = rpc.chain_id().await?;
    ensure!(
        chain == target.env.chain_id(),
        "connected to chain `{chain}`, expected {}",
        target.env.chain_id()
    );
    Ok((rpc, key))
}

async fn deploy(args: &Args, target: &Target) -> Result<()> {
    let (rpc, key) = connect(args, target).await?;
    let artifacts = load_artifacts(&args.dir, target)?;
    let slots = slots(target, &artifacts)?;
    println!(
        "target: {} registry {}, verifier {}",
        target.root, target.registry, target.verifier
    );
    println!("artifacts: {artifacts:?}");
    let observed = observe(&rpc, target, &artifacts, &slots, &key.public_key()).await?;
    let steps = plan(&slots, &observed, &target.root)?;
    if steps.is_empty() {
        println!("nothing to do");
    }
    for (i, step) in steps.iter().enumerate() {
        println!(
            "step {}: {}",
            i + 1,
            step.describe(target, &artifacts, &slots)
        );
    }
    println!(
        "{} spends {} NEAR plus gas",
        target.root,
        format_near(root_spend(&steps, &artifacts, &slots))
    );
    if args.command == "plan" {
        return Ok(());
    }
    ensure!(
        args.yes,
        "apply sends real transactions; rerun with --yes after reading the plan"
    );
    for (step, sent) in apply(&rpc, target, &artifacts, &slots, &key, &steps).await? {
        println!("sent {step:?}: tx {}", sent.tx_hash);
    }
    verify(&rpc, target, &artifacts, &slots).await?;
    println!("verified {} against {}", target.registry, target.verifier);
    Ok(())
}
