//! `mosaec-deploy`: dry-run first, idempotent deploy of the pack code and the registry.
//!
//! ```text
//! mosaec-deploy key-new                      create the deployer key in the keychain, print its public key
//! mosaec-deploy key-show                     print the deployer public key
//! mosaec-deploy plan  --env staging          print every step and its cost; sends nothing
//! mosaec-deploy apply --env staging --yes    send the steps, then verify
//! ```
//! Options: `--root <account>` (default mosaec.near), `--rpc <url>`, `--pack <wasm>`, `--registry <wasm>`.

use anyhow::{Result, bail, ensure};
use mosaec_deploy::plan::{format_near, plan};
use mosaec_deploy::rpc::Rpc;
use mosaec_deploy::target::{DEFAULT_RPC, Env, MAINNET_CHAIN_ID, Target};
use mosaec_deploy::{apply, keychain, load_artifacts, observe, verify};
use near_primitives::types::AccountId;

const DEFAULT_ROOT: &str = "mosaec.near";
const DEFAULT_PACK_WASM: &str = "target/near/mosaec_pack/mosaec_pack.wasm";
const DEFAULT_REGISTRY_WASM: &str = "target/near/mosaec_registry/mosaec_registry.wasm";

struct Args {
    command: String,
    env: Option<Env>,
    root: String,
    rpc: String,
    pack: String,
    registry: String,
    yes: bool,
}

fn parse_args() -> Result<Args> {
    let mut it = std::env::args().skip(1);
    let command = it.next().unwrap_or_default();
    let mut args = Args {
        command,
        env: None,
        root: DEFAULT_ROOT.to_owned(),
        rpc: DEFAULT_RPC.to_owned(),
        pack: DEFAULT_PACK_WASM.to_owned(),
        registry: DEFAULT_REGISTRY_WASM.to_owned(),
        yes: false,
    };
    while let Some(flag) = it.next() {
        let mut value = || {
            it.next()
                .ok_or_else(|| anyhow::anyhow!("{flag} needs a value"))
        };
        match flag.as_str() {
            "--env" => args.env = Some(Env::parse(&value()?)?),
            "--root" => args.root = value()?,
            "--rpc" => args.rpc = value()?,
            "--pack" => args.pack = value()?,
            "--registry" => args.registry = value()?,
            "--yes" => args.yes = true,
            other => bail!("unknown option {other}"),
        }
    }
    Ok(args)
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = parse_args()?;
    let root: AccountId = args.root.parse()?;
    match args.command.as_str() {
        "key-new" => {
            let pk = keychain::create(&root)?;
            println!("deployer public key for {root}: {pk}");
            println!("add it to {root} as a full-access key");
        }
        "key-show" => println!("{}", keychain::load(&root)?.public_key()),
        "plan" | "apply" => run(&args, &root).await?,
        _ => bail!(
            "usage: mosaec-deploy <key-new|key-show|plan|apply> [--env staging|production] [--yes]"
        ),
    }
    Ok(())
}

async fn run(args: &Args, root: &AccountId) -> Result<()> {
    let env = args
        .env
        .ok_or_else(|| anyhow::anyhow!("--env is required"))?;
    let target = Target::for_env(env, root.as_str())?;
    let artifacts = load_artifacts(&args.pack, &args.registry)?;
    let key = keychain::load(root)?;
    let rpc = Rpc::connect(&args.rpc);
    let chain = rpc.chain_id().await?;
    ensure!(
        chain == MAINNET_CHAIN_ID,
        "connected to chain `{chain}`, expected mainnet"
    );

    println!("target: {target:?}");
    println!("artifacts: {artifacts:?}");
    let observed = observe(&rpc, &target, &artifacts, &key.public_key()).await?;
    println!("observed: {observed:?}");
    let steps = plan(&target, &artifacts, &observed)?;
    if steps.is_empty() {
        println!("nothing to do");
    }
    for (i, step) in steps.iter().enumerate() {
        println!("step {}: {}", i + 1, step.describe(&target, &artifacts));
    }
    if args.command == "plan" {
        return Ok(());
    }
    ensure!(
        args.yes,
        "apply sends real transactions; rerun with --yes after reading the plan"
    );
    for (step, sent) in apply(&rpc, &target, &artifacts, &key, &steps).await? {
        println!("sent {:?}: tx {}", step, sent.tx_hash);
    }
    verify(&rpc, &target, &artifacts).await?;
    println!(
        "verified {}: registry code {}, pack code {}, funding {} NEAR",
        target.registry,
        artifacts.registry_hash(),
        artifacts.pack_hash(),
        format_near(target.registry_funding)
    );
    Ok(())
}
