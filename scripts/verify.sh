#!/usr/bin/env bash
# Runs every no-wallet check from the README in one go and prints PASS or FAIL per claim.
# Reads NEAR mainnet, NEAR testnet, the live API and NEAR Intents (1Click); signs nothing.
# Needs: bash, curl, jq, python3 (3.11+). Usage: scripts/verify.sh
set -uo pipefail
cd "$(dirname "$0")/.."

MAINNET_RPC=${MAINNET_RPC:-https://rpc.mainnet.near.org}
TESTNET_RPC=${TESTNET_RPC:-https://test.rpc.fastnear.com}
ARCHIVAL_RPC=${ARCHIVAL_RPC:-https://archival-rpc.testnet.fastnear.com}
SITE=${SITE:-https://mosaec.finance}
ONECLICK=${ONECLICK:-https://1click.chaindefuser.com/v0/quote}

REGISTRY=v0.mosaec.testnet
VERIFIER=intents.mosaec.testnet
PACK=0.$REGISTRY
INTENTS_HASH=BtA1BEFNS619KkvXFsgcpQ21Tb5yMm32aaUkn7xNothk
PACK_HASH=4NVfLnVFYQxUPfsHRGpU6h8eKmp2AbQxNR2mYNx3Bwzc
ZEC_MAINNET=nep141:zec.omft.near
USDC_MAINNET=nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1

pass=0
fail=0
skip=0

# check <claim> <got> <want>: exact match.
check() {
  if [ "$2" = "$3" ]; then
    pass=$((pass + 1))
    printf 'PASS  %s\n      %s\n' "$1" "$2"
  else
    fail=$((fail + 1))
    printf 'FAIL  %s\n      got:  %s\n      want: %s\n' "$1" "${2:-<nothing>}" "$3"
  fi
}

skipped() {
  skip=$((skip + 1))
  printf 'SKIP  %s\n      %s\n' "$1" "$2"
}

post() { curl -sS -m 30 --retry 2 "$1" -H 'content-type: application/json' -d "$2" 2>/dev/null; }

# query <rpc> <request_type> <account> [method] [args json]
query() {
  local params
  params=$(jq -nc --arg t "$2" --arg a "$3" --arg m "${4:-}" --arg args "${5:-{\}}" \
    '{request_type: $t, finality: "final", account_id: $a}
     + (if $m == "" then {} else {method_name: $m, args_base64: ($args | @base64)} end)')
  post "$1" "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":$params}"
}

view() { query "$TESTNET_RPC" call_function "$1" "$2" "${3:-{\}}" | jq -r '.result.result | implode' 2>/dev/null; }

# tx <hash> <signer>: the failure message, or the NEP-297 events the transaction emitted.
tx() {
  post "$ARCHIVAL_RPC" "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tx\",\"params\":{\"tx_hash\":\"$1\",\"sender_account_id\":\"$2\",\"wait_until\":\"FINAL\"}}" |
    jq -r '.result | .status.Failure.ActionError.kind.FunctionCallError.ExecutionError
      // ([.receipts_outcome[].outcome.logs[] | select(startswith("EVENT_JSON:")) | ltrimstr("EVENT_JSON:") | fromjson | .event] | join(" "))' 2>/dev/null
}

# moved <hash> <signer>: who handed which NFT to whom in a transaction.
moved() {
  post "$ARCHIVAL_RPC" "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tx\",\"params\":{\"tx_hash\":\"$1\",\"sender_account_id\":\"$2\",\"wait_until\":\"FINAL\"}}" |
    jq -r '[.result.receipts_outcome[].outcome.logs[] | select(startswith("EVENT_JSON:")) | ltrimstr("EVENT_JSON:") | fromjson
      | select(.event == "nft_transfer") | .data[] | "\(.token_ids[0]) \(.old_owner_id) -> \(.new_owner_id)"] | join("; ")' 2>/dev/null
}

# refusal <hash> <signer>: the code and sender of the pack's refused event, and the refund memo.
refusal() {
  post "$ARCHIVAL_RPC" "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tx\",\"params\":{\"tx_hash\":\"$1\",\"sender_account_id\":\"$2\",\"wait_until\":\"FINAL\"}}" |
    jq -r '[.result.receipts_outcome[].outcome.logs[] | select(startswith("EVENT_JSON:")) | ltrimstr("EVENT_JSON:") | fromjson] as $e
      | "\($e | map(select(.event == "refused"))[0].data | "\(.code) \(.sender_id)") \($e | map(select(.event == "mt_transfer"))[-1].data[0] | "\(.memo) \(.amounts[0])")"' 2>/dev/null
}

for tool in curl jq python3; do
  command -v "$tool" >/dev/null || { echo "missing tool: $tool"; exit 2; }
done

echo "== The verifier"
check "mainnet intents.near runs the published v0.4.5 code hash" \
  "$(query "$MAINNET_RPC" view_account intents.near | jq -r .result.code_hash)" "$INTENTS_HASH"
check "the testnet verifier $VERIFIER runs the same bytes" \
  "$(query "$TESTNET_RPC" view_account "$VERIFIER" | jq -r .result.code_hash)" "$INTENTS_HASH"

echo "== The pack"
check "pack $PACK has no access keys" \
  "$(query "$TESTNET_RPC" view_access_key_list "$PACK" | jq -c .result.keys)" "[]"
check "pack $PACK runs the one published pack code hash" \
  "$(query "$TESTNET_RPC" view_account "$PACK" | jq -r .result.global_contract_hash)" "$PACK_HASH"
check "the registry pins that same pack code hash" \
  "$(view "$REGISTRY" config | jq -r .pack_code_hash)" "$PACK_HASH"
check "the deployed pack code names this repository as its source (NEP-330)" \
  "$(view "$PACK" contract_source_metadata | jq -r '.build_info.source_code_snapshot | sub("\\?rev=.*"; "")')" \
  "git+https://github.com/youvandra/mosaec"
if [ -f contracts/target/near/mosaec_pack/mosaec_pack.wasm ]; then
  check "pack code cannot add a key, deploy code or delete itself" \
    "$(python3 -I scripts/check-wasm-imports.py pack=contracts/target/near/mosaec_pack/mosaec_pack.wasm 2>&1 | tail -1)" \
    "pack: 20 imports, batch actions: none"
else
  skipped "pack code cannot add a key, deploy code or delete itself" \
    "build the contracts first (README, Run Locally), then run this script again"
fi

echo "== A loan settles on a payment and a clock"
check "a payment one unit short of K is refunded (pack 0)" \
  "$(tx DA6efUeUQLRbLaCYkFU4N1j96XvqGEHR2UKwVuiKnwr5 borrower.mosaec.testnet)" \
  "mt_transfer refused mt_transfer"
check "the full K returns the coins to the borrower (pack 0)" \
  "$(tx FWbhwnW2LLQy45QfD3gzfXRGsisQ5R249ZeYVi72jPVZ borrower.mosaec.testnet)" \
  "mt_transfer exercise_decided mt_transfer contents_released nft_burn"
check "the lender cannot take the coins before the date (pack 1)" \
  "$(tx BKgwJo7i3mKc6BgdUGwevZeER1Ud7Qy8twaeMiX7ymc9 lender.mosaec.testnet)" \
  "Smart contract panicked: E_STATE: pack state refuses this call"
check "after the date the loan expires with no price read (pack 1)" \
  "$(tx 2ETfJRTc6a2buLKQ8i7qapr1x1KGnETYBEtf5ehr2xwK lender.mosaec.testnet)" \
  "encumbrance_synced nft_burn expired"
check "the lender then withdraws the kept coins (pack 1)" \
  "$(tx cc8UhHawphno44JNmwWdwyVkk4w81vvR7oCtYQnbwoo lender.mosaec.testnet)" \
  "mt_transfer withdrawn"

echo "== Both halves of a running loan change hands"
check "the borrower sold the Ticket of pack 16 while the loan ran" \
  "$(moved DbFSp7nBVQSomh2vpNPeGVLwogjESpWNuoG5xz2pFv75 kenkulus.testnet)" \
  "k16.1 kenkulus.testnet -> filoooc.testnet"
check "the lender sold the Title of pack 16 while the loan ran" \
  "$(moved 3DNFHfgt6M4TkDdPWENcNtKsU1qvZumNVs3KDxBvri3N helpmosaec.testnet)" \
  "t16 helpmosaec.testnet -> balabalabuna.testnet"
check "the old Ticket holder then pays K and the pack refunds it (pack 16)" \
  "$(refusal 2o8jKZeePzRZ83gZztp5qLKKuRdN95ak3gdrLEVTfxi2 kenkulus.testnet)" \
  "E_HOLDER kenkulus.testnet refund 122400000"

echo "== The replay"
check "a 90-day pawn at 50% forfeits in 10.7% of ZEC windows, a liquidating loan in 34.6%" \
  "$(python3 -I scripts/replay/rolling_replay.py 2>/dev/null | grep -F '*' | grep -E '90d +50%' | tr -d '*' | xargs)" \
  "90d 50% 84262 10.7% 34.6%"

echo "== The House Desk"
ledger=$(curl -sS -m 30 --retry 2 "$SITE/api/desk/ledger" 2>/dev/null)
check "the desk policy caps every loan at 50% loan to value" \
  "$(jq -r .policy.maxLtvBps <<<"$ledger")" "5000"
check "the desk publishes its book" \
  "$(jq -r 'if (.book.fills | type) == "number" and .book.fills == .book.repaid + .book.forfeited + .book.running
      then "fills = repaid + forfeited + running" else "book does not add up: \(.book)" end' <<<"$ledger")" \
  "fills = repaid + forfeited + running"
echo "      now: $(jq -c '.book | {fills, repaid, forfeited, running}' <<<"$ledger")"
quote=$(curl -sS -m 30 --retry 2 "$SITE/api/desk/quote?asset=ZEC&amount=50000000&term=2592000000000000&principal=900000000" 2>/dev/null)
if [ "$(jq -r '.available // false' <<<"$quote")" = "true" ]; then
  check "a 900 USDC ask against 0.5 ZEC is cut to the cap" \
    "$(jq -r 'if .quote.ltvBps <= 5000 then "ltvBps at or below 5000" else "ltvBps \(.quote.ltvBps)" end' <<<"$quote")" \
    "ltvBps at or below 5000"
  echo "      now: $(jq -c '.quote | {principal, repayment, ltvBps}' <<<"$quote")"
else
  skipped "a 900 USDC ask against 0.5 ZEC is cut to the cap" \
    "the desk is quoting nothing right now: $(jq -c 'del(.quote)' <<<"$quote" 2>/dev/null | head -c 200)"
fi
check "outside agents get read and prepare tools, never a spend tool" \
  "$(curl -sS -m 30 --retry 2 -X POST "$SITE/mcp" -H 'content-type: application/json' \
    -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' 2>/dev/null |
    grep -o '"name":"[a-z_]*"' | cut -d'"' -f4 | sort | xargs)" \
  "desk_policy list_offers prepare_fill quote_offer"

echo "== NEAR Intents on mainnet"
deadline=$(jq -rn 'now + 600 | todate')
dry=$(post "$ONECLICK" "$(jq -nc --arg z "$ZEC_MAINNET" --arg u "$USDC_MAINNET" --arg d "$deadline" \
  '{dry: true, swapType: "EXACT_INPUT", slippageTolerance: 100, originAsset: $z, depositType: "INTENTS",
    destinationAsset: $u, amount: "50000000", refundTo: "desk.mosaec.near", refundType: "INTENTS",
    recipient: "desk.mosaec.near", recipientType: "INTENTS", deadline: $d}')")
check "a solver quotes 0.5 ZEC to USDC inside mainnet intents.near (dry, nothing is sold)" \
  "$(jq -r 'if .quoteRequest.dry == true and ((.quote.amountOut // "0") | tonumber) > 0
      then "dry quote returned" else "no quote: \(. | tostring | .[0:160])" end' <<<"$dry" 2>/dev/null)" \
  "dry quote returned"
echo "      now: 0.5 ZEC -> $(jq -r '.quote.amountOutFormatted // "?"' <<<"$dry") USDC"

echo
total=$((pass + fail))
if [ "$fail" -eq 0 ]; then
  echo "ALL CHECKS PASSED ($pass/$total)$([ "$skip" -gt 0 ] && echo ", $skip skipped")"
else
  echo "$fail of $total CHECKS FAILED"
  exit 1
fi
