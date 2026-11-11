# House desk

The house desk is a lender run by the Mosaec team. An agent reads every open pawn, checks it
against a public policy and fills the ones it chooses from `desk.mosaec.testnet`, an account that
holds only the desk budget. Every verdict is logged and served at `GET /desk/decisions`.

## Policy

The policy lives in `packages/config/desk.ts` and is validated with zod at start-up.

| Rule           | Testnet                          | Mainnet (paused until release) |
| -------------- | -------------------------------- | ------------------------------ |
| Collateral     | ZEC                              | ZEC, BTC, SOL                  |
| Loan to value  | at most 50% of a reference price | at most 50%                    |
| Rate           | at least 20% a year              | at least 20% a year            |
| Term           | 10 minutes to 90 days            | 7 to 90 days                   |
| Per pawn       | up to 250 USDC                   | up to 50 USDC                  |
| Out at once    | up to 1,000 USDC                 | up to 200 USDC                 |
| Per UTC day    | up to 1,000 USDC                 | up to 100 USDC                 |
| Fills per hour | 4                                | 2                              |

Reference prices come from CoinGecko and are used only for the loan-to-value rule; the contracts
never read a price. A missing price refuses the fill.

## How a decision is made

1. The service lists offered packs from the read model and reads each offer live from the registry.
2. The policy (`apps/desk/src/policy.ts`) is a pure function. Offers it refuses are logged with a
   `DESK_*` code without calling a model.
3. Offers that pass go to the agent, a model served on the desk's own host behind an
   OpenAI-compatible endpoint. It can only call `fill_offer` or `pass_offer`.
4. `fill_offer` re-runs the policy on fresh chain data right before it signs, whatever the agent
   proposed. The registry then checks the contents hash and terms; any mismatch refunds the USDC.

## MCP endpoint

`apps/desk` serves stateless Streamable HTTP at `/mcp`:

- `desk_policy`, `list_offers`, `quote_offer`: read-only.
- `prepare_fill`: the exact `mt_transfer_call` a caller signs to fill from their own account.
- `fill_offer`: spends the desk budget; registered only for a caller holding the desk token.

## Running it

```bash
DATABASE_URL=postgres://... MOSAEC_ENV=local MOSAEC_NETWORK=testnet \
NEAR_RPC_URL=https://rpc.testnet.fastnear.com \
LLM_BASE_URL=http://127.0.0.1:11434/v1 LLM_MODEL=qwen2.5:3b \
DESK_SECRET_KEY=ed25519:... pnpm --filter @mosaec/desk dev
```

Without `DESK_SECRET_KEY` the desk runs read-only: the MCP tools work and the loop never signs.
