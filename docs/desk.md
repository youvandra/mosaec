# House desk

The house desk is a lender run by the Mosaec team. An agent reads every open pawn, checks it
against a public policy and fills the ones it chooses from `desk.mosaec.testnet`, an account that
holds only the desk budget. Every verdict is logged and served at `GET /desk/decisions`.

## Policy

The policy lives in `packages/config/desk.ts` and is validated with zod at start-up. Fair rates,
the desk margin and the repayment formula live in `packages/config/rates.ts`, shared with the app.

| Rule                   | Testnet                          | Mainnet (paused until release) |
| ---------------------- | -------------------------------- | ------------------------------ |
| Collateral             | ZEC, BTC, SOL                    | ZEC, BTC, SOL                  |
| Loan to value          | at most 50% of a reference price | at most 50%                    |
| Rate                   | fair rate + 0.25% a month        | fair rate + 0.25% a month      |
| Term                   | 10 minutes to 90 days            | 7 to 90 days                   |
| Per pawn               | 10 to 250 USDC                   | 10 to 50 USDC                  |
| Out at once            | up to 5,000 USDC                 | up to 200 USDC                 |
| Per UTC day            | up to 5,000 USDC                 | up to 100 USDC                 |
| Fills per hour         | 4                                | 2                              |
| Instant loans per hour | 20                               | 4                              |

Fair monthly rates at 50% loan to value: ZEC 2.5%, BTC 1.0%, SOL 2.25%. Reference prices come
from CoinGecko and are used only for the loan-to-value rule; the contracts never read a price. A
missing or stale price refuses the fill.

## How a decision is made

1. The service lists offered packs from the read model and reads each offer live from the registry.
2. The policy (`apps/desk/src/policy.ts`) is a pure function. Offers it refuses are logged with a
   `DESK_*` code without calling a model.
3. Offers that pass go to the agent, a model served on the desk's own host behind an
   OpenAI-compatible endpoint. It can only call `fill_offer` or `pass_offer`.
4. `fill_offer` re-runs the policy on fresh chain data right before it signs, whatever the agent
   proposed. The registry then checks the contents hash and terms; any mismatch refunds the USDC.

Every fill path (the loop, the MCP tool and instant loans) runs under one lock, so two fills
cannot both pass a budget check that only one of them fits. The loop leaves an offer to the
instant path for its first two minutes.

## Rate card

Once an hour the agent proposes a monthly rate and a loan-to-value limit per coin from 30-day
realised volatility, the desk's utilisation, repaid and forfeited pawns and the previous card.
The server keeps each card inside the shared bounds (fair rate plus margin up to three times the
fair rate), moves it at most 0.5% a month per hour, and writes the fallback card (fair rate plus
margin) whenever the model fails. Cards are stored in `desk_rate_cards` with a one-line reason.

## Instant loans

The desk quotes a loan on coins a borrower is about to seal and fills the matching offer at once,
with no model in the path. Both routes listen on loopback for the Mosaec API and answer 404 to
anything Caddy forwards.

- `GET /instant/quote?asset&amount&term[&principal][&borrower]`: principal capped by the card's
  loan to value, repayment from the current card, APR, and a `quoteId` valid for 10 minutes; or
  `{ available: false, code, reason }`.
- `POST /instant/fill`: the quote fields, its `quoteId` and the pack. The desk checks the id (an
  HMAC over the terms) and the expiry, reads the offer live from the registry, requires the exact
  quoted terms and a maker who holds the Title, re-runs the policy, and fills. The quoted loan to
  value stands while the quote is valid. A second call for the same quote returns the first fill.

One instant loan runs per borrower at a time.

The Mosaec API exposes both publicly, validated with zod and passed to the desk with a 20 s
timeout: `GET /desk/quote?network&asset&amount&term[&principal][&borrower]` (30 a minute per
address) and `POST /desk/instant-fill?network` (5 a minute per address). A desk that is down or
answers oddly gives `DESK_UNAVAILABLE`. In the app, Borrow step 3 offers the desk quote beside the
open market; the borrower signs the normal offer at the quoted terms and the app asks for the fill.
A refused fill leaves the offer open on the market.

## Ledger

`GET /desk/ledger?network` returns the desk's books: treasury (live verifier balances), principal
lent now and its share of the exposure limit, interest from repaid pawns, coins kept from forfeits,
what is left of today's budget, the current rate card per coin and the last 24 hours of cards with
their reasons, the policy, the kill switch state, and the latest events (loans, collects, card
changes, pauses) with transaction hashes. `/app/desk` is built on it.

Kept coins are marked at a NEAR Intents quote. When the desk collects coins from a forfeited pack,
it asks 1Click for a `dry: true` quote of the same amount of the mainnet coin into USDC (Intents
has no testnet) and stores it with the collect. The ledger shows that quote, labelled as a quote
that was never executed. If the quote fails, the coins are marked at the reference price. An
optional `ONECLICK_PARTNER_JWT` in the desk env is sent with each quote.

## Kill switch

`desk_controls` holds a pause flag per network. The desk reads it before every quote and every
signature, collects included. The config flag `paused` is a floor the switch cannot lift. On the
server:

```bash
pnpm --filter @mosaec/desk control pause --reason "why"
pnpm --filter @mosaec/desk control resume --reason "why"
pnpm --filter @mosaec/desk control status
```

The CLI needs only `DATABASE_URL` and `MOSAEC_NETWORK`. There is no public admin endpoint.

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

Without `DESK_SECRET_KEY` the desk runs read-only: the MCP tools and quotes work and nothing is
signed. `DESK_QUOTE_SECRET` (32+ characters) signs quote ids; without it each start picks a random
one, so open quotes end on a restart.
