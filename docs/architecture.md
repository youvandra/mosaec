# Mosaec architecture

Status: v0 specification. Constants marked `measured` are filled from the gas and storage report before the production deploy.

## 1. What Mosaec is

Mosaec is a pawn ticket for native assets. A keyless NEAR account, the **pack**, holds balances inside the NEAR Intents verifier (`intents.near`). Two NFTs split the rights over it:

- **Title**: owns the pack and everything in it, subject to any live Ticket.
- **Ticket** `(K, T)`: may take the pack's contents by paying `K` into the pack at or before `T`.

Sell the Title and keep the Ticket: a fixed-term loan with no price oracle and no liquidation. The contracts read no prices. The only events are a payment and a clock.

## 2. Components

```
                     ┌──────────────────────────── NEAR mainnet ─────────────────────────────┐
 wallet ──signs──►   │  intents.near (verifier)  ◄──── mt_* / ft_withdraw ────  <n>.v0.mosaec.near (pack)
                     │        ▲   │ mt_on_transfer                                   ▲  │
                     │        │   ▼                                                  │  │ begin/end_exercise
                     │   v0.mosaec.near (registry: Title + Ticket NFTs, offers) ◄───┘  ▼
                     │        ▲ guardian: pause_new / unpause_new only                   │
                     │   mosaec.near (root, keyed)                                       │
                     └───────────────────────────────────────────────────────────────────┘
                                  │ blocks (neardata)
                       indexer ──► Postgres ◄── API (Hono) ◄── web (Next.js: landing + app)
                                                    ▲
                                       desk (autonomous lender, MCP server)
```

| Account              | Code                                 | Keys                                       | Role                                                          |
| -------------------- | ------------------------------------ | ------------------------------------------ | ------------------------------------------------------------- |
| `mosaec.near`        | none                                 | owner key (later multisig)                 | Root. Creates registries. Guardian of each registry           |
| `v0.mosaec.near`     | `registry`                           | none after the first full production cycle | NEP-171 collection for Titles and Tickets, offers, settlement |
| `<n>.v0.mosaec.near` | `pack`, global contract by code hash | none, ever                                 | Holds verifier balances; enforces its own encumbrance         |
| `v0.mosaec.testnet`  | `registry`                           | keyed                                      | Testnet registry against our verifier deploy (section 2.1)    |
| `desk.mosaec.near`   | none                                 | one key on the desk server                 | Team-run lender; holds only its budget                        |

Upgrades never mutate a live registry. A new version deploys at `v1.mosaec.near`; `v0` packs run to term under `v0` code.

### 2.1 Networks

The registry takes its `network` and its `verifier` at init and passes the verifier to every pack it creates. A mainnet registry accepts only `intents.near`; every registry and verifier must sit under its network's top-level suffix (`.near` or `.testnet`), so a testnet build can never run as mainnet.

|                                  | Mainnet                                   | Testnet                                                                            |
| -------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------- |
| Root                             | `mosaec.near`                             | `mosaec.testnet`                                                                   |
| Registry                         | `v0.mosaec.near`                          | `v0.mosaec.testnet`                                                                |
| Verifier                         | `intents.near`                            | `intents.mosaec.testnet`, our deploy of the mainnet v0.4.5 bytes (`contracts/res`) |
| Collateral and settlement tokens | mainnet ids (ZEC, BTC, SOL, USDC)         | test tokens `zec`, `btc`, `sol`, `usdc` `.mosaec.testnet`                          |
| Shortest term                    | 7 days                                    | 10 minutes                                                                         |
| Home-chain withdrawals           | closed until bridge minimums are measured | closed (no bridge)                                                                 |

NEAR Intents runs on mainnet only, so testnet uses its own copy of the verifier; the flows, the receipt chains and every refusal are the same code on both. `mosaec-deploy` builds either network from an empty root and is the same path the sandbox tests run.

## 3. Design principle: decide in one receipt, deliver by retryable promises

The verifier's `mt_resolve_transfer` refunds the full amount when the receiver's promise chain fails, capped at the receiver's remaining balance (`contracts/defuse/src/contract/tokens/nep245/resolver.rs:32-36`, verified against mainnet `intents.near` v0.4.5, commit `16d04f6`). The receiver's `mt_on_transfer` gets all leftover gas; the resolve step reserves 10 + 5n Tgas. A chain that pays out first and decides later can therefore pay twice: contents leave, then a late failure refunds the payment.

Every Mosaec chain that receives value follows one rule:

1. **Check** with read-only calls.
2. **Decide** in a single callback, the value-returning receipt. It writes the decision to state and returns `[0]` (keep) or `[amount]` (refund). It performs no cross-contract value transfer itself and runs under a fixed gas reserve. Entry points refuse a call whose prepaid gas cannot cover the whole chain (`E_GAS`), so this receipt cannot run out of gas.
3. **Deliver** with detached promises that are idempotent and permissionlessly retryable (`claim`, `sync`, `finalize_exercise`). A delivery failure leaves value parked in a known place, owed to a recorded account, and anyone can push it through again.

Consequences:

- A failed decision refunds a payment that nothing has spent.
- A failed delivery never refunds; it waits for a retry.
- No receipt both moves value out and determines whether value came in.

## 4. Pack state machine

```
          offer                     fill (decided)                 exercise (decided)
  Free ──────────► Offered ─────────────────────────► Written ─────────────────────────► Releasing ──► Free
   ▲   ◄────────── cancel                               │  │                                (contents owed to exerciser;
   │                                                    │  │ T passes (no grace)               K owned by Title holder)
   │                                                    │  ▼
   └──────────────────────────────── expire ◄───────────┴── Grace (disruption recorded in [T-24h, T]; until T+24h)
```

- `Free`: one holder owns the Title. Deposits arrive by plain transfer; the Title holder may offer or withdraw.
- `Offered`: contents committed by hash; withdraw refused. Any Title transfer cancels the offer in the same receipt (`offer_cancelled` event, reason `title_moved`).
- `Written`: Title held by the lender, Ticket held by the borrower; the recorded contents are frozen by the pack's own code.
- `Grace`: a verifier pause or a lock of this pack was recorded in the last 24 hours before `T`; exercise stays open until `T + 24 h`; `expire` refused.
- `Releasing`: exercise decided; contents owed to the exerciser until delivery lands.
- `Pending` (flag on the Ticket or Title): a decision chain or an `nft_transfer_call` is in flight; NFT transfers, `offer`, `withdraw`, `expire` and `begin_exercise` touching that token are refused with `E_PENDING`. Every flag has a permissionless clearing call (5.10).

v0 writes pawns only: the maker (borrower) sells the Title and keeps the Ticket. Covered calls and puts ship in a later registry.

## 5. Flows

Notation: `A -> B::method` is a function call receipt. `(decide)` marks the value-returning receipt.

### 5.1 Mint

`user -> registry::mint()` with attached NEAR covering pack storage, the pack's operating reserve (1 yoctoNEAR per outbound call) and prepaid NFT and offer storage. One batch creates `<n>.<registry>`, attaches the global pack code by hash, adds zero keys, funds the reserve and calls `pack::init(registry)`. The Title mints to the caller. Refused while paused (`E_PAUSED`).

### 5.2 Deposit

Contents arrive in the pack by a plain `intents.near::mt_transfer(receiver = pack)` or by a bridge deposit addressed to the pack. A `mt_transfer_call` to a pack outside an exercise is refunded in full with `E_STATE`. Balances are read from `mt_batch_balance_of(pack)`.

### 5.3 Offer and cancel

`Title holder -> registry::offer(pack, token_ids, terms { k_token, k_amount, term_ns }, pay_token, price, offer_expires_at_ns)`:
checks token count at most 10 (`E_BATCH`), `pay_token` equals `k_token` and is the settlement token, `price <= k_amount`, `term_ns` inside the registry profile's term bounds (`E_TERMS`), `offer_expires_at_ns > now` (`E_EXPIRED`), not paused (`E_PAUSED`), Title not `Pending`, no earlier maker's payout still undelivered (`E_PENDING`); reads `mt_batch_balance_of(pack, token_ids)`; the callback builds the contents from those balances, each token allowlisted collateral under its cap (`E_TOKEN`, `E_CAP`, `E_AMOUNT` for a zero balance); the callback stores the offer with the contents vector and its hash; state `Offered`. `price` is the principal, `k_amount` the repayment. `cancel` returns the pack to `Free` and is never blocked by a pause; a Title transfer cancels too (section 4).

### 5.4 Fill

```
taker -> intents.near::mt_transfer_call(receiver = registry, pay_token, price,
                                         msg { fill: pack, k_token, k_amount, term_ns, contents_hash })
intents.near -> registry::mt_on_transfer
  checks: offer exists, now <= offer_expires_at, msg equals offer terms, taker != maker,
          not paused, Title not Pending, prepaid gas >= FILL_GAS
  joined reads on intents.near: public_keys_of(pack), is_auth_by_predecessor_id_enabled(pack),
                                is_account_locked(pack), mt_batch_balance_of(pack)
registry::on_fill_checked (decide)
  pass: T = now + term_ns; state = Written; mint Ticket to maker; move Title to taker;
        record maker payout owed; return [0]
        detached: intents.near::mt_transfer(maker, price)              -> registry::on_paid      (retry: claim_payout)
        detached: pack::encumber(k_token, k_amount, T, contents)       -> registry::on_encumbered (retry: sync_encumbrance)
  fail: emit typed finding; return [price]
```

`contents` is the vector recorded at offer (token id, amount). The pack freezes and later releases exactly that vector; anything else in the pack, including `K` and later deposits, belongs to the Title holder. Exercise before `encumber` lands is refunded by the pack (no terms stored) and succeeds after `sync_encumbrance`.

### 5.5 Exercise (two-phase)

```
holder -> intents.near::mt_transfer_call(receiver = pack, k_token, K, msg { exercise })
intents.near -> pack::mt_on_transfer
  checks: predecessor is intents.near; terms stored; token and amount equal K;
          now <= T, or now <= T + 24 h when a disruption was recorded in [T - 24 h, T];
          prepaid gas >= EXERCISE_GAS
pack -> registry::begin_exercise(pack, sender_id)
  checks: caller is a pack of this registry; sender_id is the Ticket's direct owner (a Ticket
          deposited in intents.near is owned by intents.near and refused with E_HOLDER; the holder
          withdraws it first); Ticket not Pending
  sets Ticket Pending; returns ok
pack::on_begin (decide)
  ok:   state = Releasing { owed_to: sender_id }; return [0]      (K stays in the pack)
        detached: intents.near::mt_batch_transfer(recorded contents -> sender_id) -> pack::on_released (retry: pack::claim)
        detached: registry::end_exercise(pack, true)                              (retry: registry::finalize_exercise)
  fail: detached: registry::end_exercise(pack, false); return [K]
```

After release the pack holds `K`; the Title holder owns a `Free` pack. The Ticket burns in `end_exercise`. Withdraw stays refused while the pack is `Releasing`.

The pack sets `exercise_in_flight` when it accepts a payment and clears it in the decide receipt. While it is set, a second exercise and `unencumber` are refused with `E_PENDING`, so an exercise accepted before `T` can never lose to an `expire` that lands after `T`.

`registry::finalize_exercise(pack)` is permissionless and reads `pack::status()`: `Releasing` or `Free` burns the Ticket; `Written` with no exercise in flight clears `Pending`. A pack locked by the verifier admin keeps `K` and owes the contents until the lock lifts; `pack::claim` delivers then.

On the mainnet checklist: `exercise_in_flight` is cleared only by the decide receipt. If that receipt fails, the flag stays set and the exercise, `unencumber` and `finalize_exercise` all wait on it. Before the registry becomes keyless, each in-flight flag gets the block height it was set at and a permissionless clear after a bound, with a sandbox test that fails the decide receipt and proves recovery.

### 5.6 Grace window

`anyone -> pack::record_disruption()` while `Written` and `now` in `[T - 24 h, T]`: reads the verifier pause state (`pa_all_paused()`, a disruption when it contains `ALL`, `mt_transfer` or `intents`; these are the keys guarding `mt_transfer`, `mt_batch_transfer`, `mt_transfer_call` and `execute_intents` in v0.4.5, `nep245/core.rs:34,58,79`, `intents/mod.rs:26`) and `is_account_locked(pack)`; stores `disrupted_at` only when either is true. With a record, exercise stays open until `T + 24 h` and `expire` is refused with `E_GRACE` until then. Without a record, `T` is final. Any account can call `record_disruption`; a keeper that calls it for every `Written` pack in its window is on the mainnet checklist.

### 5.7 Expire

`anyone -> registry::expire(pack)` after `T`, refused while the Ticket is `Pending`: `registry -> pack::unencumber()`, which succeeds only after the exercise deadline the pack computes itself (`T`, or `T + 24 h` with a recorded disruption) and with no exercise in flight. Only on that success does the callback burn the Ticket and set the position `Free`; a refusal (`E_GRACE`, `E_PENDING`) changes nothing and `expire` can run again later. Never blocked by a pause.

### 5.8 Withdraw

`Title holder -> registry::withdraw(pack, token, amount, destination)` on a `Free` pack:

- to a verifier account: `pack -> intents.near::mt_batch_transfer`;
- to a home chain: `pack -> intents.near::ft_withdraw(token, receiver_id = token, amount, memo = "WITHDRAW_TO:<address>")`, refused under the token's minimum (`E_MIN_WITHDRAW`). ZEC (`zec.omft.near`) runs the Omni bridge token contract, which forwards such a transfer to its relayer. Home-chain withdrawals of a token stay closed (`E_MIN_WITHDRAW`) until its minimum is measured on mainnet and written into the token table.
  The Title is `Pending` until the callback; a Title sale in that window returns `E_PENDING`.

### 5.9 Guardian

`mosaec.near -> registry::pause_new()` / `unpause_new()`. A pause refuses `mint`, `offer` and `fill` (a refused fill refunds in full). It never blocks `cancel`, exercise, `expire`, `withdraw`, `record_disruption`, retries, or NFT transfers. The guardian has no method that moves funds or changes holders, terms or caps.

### 5.10 NFT transfers

- `nft_transfer`: refused while the token is `Pending`. A Title transfer on an `Offered` pack cancels the offer in the same receipt.
- `nft_transfer_call`: moves the token, sets it `Pending` until `nft_resolve_transfer` settles the owner, so no exercise, withdraw or offer runs against an owner that the resolve step may still revert. The resolve step carries its own static gas, so it always runs and always clears the flag.
- Approvals (NEP-178) are unsupported in v0: `approval_id` must be absent. Marketplaces list through `nft_transfer_call` or the verifier.
- A Title or Ticket deposited in `intents.near` (for trading by `token_diff`) is owned by `intents.near`. Exercise, offer and withdraw need the direct owner, so the holder runs `nft_withdraw` first; the app does this in one step.

## 6. Invariants

1. Contents leave a `Written` pack only to the account recorded by a decided exercise, or by registry command after `T` (after `T + 24 h` in grace).
2. A decided exercise implies `K` sits in the pack.
3. A refunded payment implies no value left the pack or the registry for that chain.
4. Each pack has exactly one Title and at most one Ticket; the Ticket holder at decision time is the only account contents can be owed to.
5. The pack's access-key set and its verifier public-key set stay empty for life.
6. Sum of maker payouts owed plus paid equals sum of fills kept.
7. A pause changes the outcome of no call on an existing position.
8. The Ticket's `Pending` flag is cleared by a permissionless call once its chain has settled. Title `Pending`, `command_in_flight`, `payout.in_flight` and the pack's in-flight flags are cleared by their callbacks; a permissionless clear after a bound is on the mainnet checklist (section 5.5).
9. An exercise releases exactly the contents vector recorded at fill; the pack's other balances never leave on an exercise.
10. `T` equals fill time plus the offered term.

## 7. Threat model

Test names are functions in `contracts/` (unit tests and the sandbox suite in `contracts/tests`). Rows marked Planned have no test yet.

| #   | Actor                | Attack                                                                | Defence                                                        | Test                                                                        |
| --- | -------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | Maker                | Drain the pack between the taker's look and the fill                  | Offer freezes; fill compares the contents hash                 | `fill_refuses_auth_off_locked_or_drained`                                   |
| 2   | Maker                | Keep a key at the verifier                                            | Pack code has no key-registering call; fill requires zero keys | `scripts/check-wasm-imports.py` (CI), `fill_refuses_keyed_account`          |
| 3   | Maker                | Change terms after the taker looked                                   | Taker's msg commits to terms and contents hash                 | `bait_and_switch_refunded`                                                  |
| 4   | Title holder         | Withdraw while a Ticket is live                                       | `Written` refuses outbound commands                            | `written_withdraw_refused`                                                  |
| 5   | Title holder         | Sell the Title to escape the Ticket                                   | Ticket binds the pack                                          | Planned                                                                     |
| 6   | Title holder         | Expire early or race the deadline                                     | Clock checks in both paths; grace                              | `early_expire_refused`, `second_exercise_and_unencumber_wait_for_the_first` |
| 7   | Ticket holder        | Exercise late or short                                                | Clock and amount checks; full refund                           | `late_exercise_refunded`, `short_pay_refunded`                              |
| 8   | Old Ticket holder    | Exercise after selling                                                | Holder read at `begin_exercise`                                | `sold_ticket_cannot_exercise`                                               |
| 9   | Ticket holder        | Sell the Ticket during an exercise                                    | Ticket `Pending`                                               | `ticket_transfer_refused_during_exercise`                                   |
| 10  | Anyone               | Transfer an NFT during an outbound promise                            | `Pending`                                                      | `sale_mid_fill_refused`                                                     |
| 11  | Anyone               | Dust to change the contents hash                                      | Offer fixes the token set                                      | `dust_does_not_block_fill`                                                  |
| 12  | Anyone               | Forge a pack                                                          | Registry checks its own pack set                               | `exercise_hooks_refuse_other_callers`                                       |
| 13  | Exerciser            | Receive contents and a refund                                         | Decide-then-deliver                                            | Planned                                                                     |
| 14  | Taker                | Refund after the maker was paid                                       | Decide-then-deliver                                            | Planned                                                                     |
| 15  | Non-registry account | Call pack methods                                                     | Predecessor checks                                             | `pack_refuses_non_registry`                                                 |
| 16  | Guardian             | Touch an existing position                                            | Pause covers new activity only                                 | `guardian_pause_allows_existing_positions`, `only_guardian_pauses`          |
| 17  | Verifier admin       | Pause or lock across `T`                                              | Grace window; anyone records it                                | `grace_exercise_after_pause_recorded`                                       |
| 18  | Title seller         | Sell the Title while `Offered` so the principal goes to the old owner | Title transfer cancels the offer                               | `title_transfer_cancels_offer`                                              |
| 19  | Anyone               | Exercise against an owner that `nft_resolve_transfer` later reverts   | `Pending` during `nft_transfer_call`                           | `exercise_refused_during_nft_transfer_call`                                 |
| 20  | Exerciser            | Take `K` or later deposits along with the contents                    | Release the recorded vector only                               | `exercise_releases_contents_and_keeps_k`                                    |
| 21  | Anyone               | Freeze a Ticket by failing the decide receipt                         | `finalize_exercise` reads pack state                           | Planned                                                                     |
| 22  | Ticket holder        | Exercise a Ticket parked in `intents.near`                            | Direct owner required                                          | `ticket_in_verifier_refused`                                                |

## 8. Trust model

1. **Verifier.** `intents.near` admins can lock an account, force-disable predecessor authentication and pause the contract. Fills read the lock and auth flags; the grace window covers a disruption at expiry. These powers are shared by every verifier user.
2. **Bridge custody.** Verifier balances are claims on bridged assets; "native" means redeemable to the home chain.
3. **Registry.** `v0` has no keys after its first full production cycle and cannot be upgraded. Before that, the root key can redeploy it; caps bound the value at risk.
4. **Guardian.** Can stop new activity only.
5. **Price.** None read.

## 9. Constants

Defined once in `contracts/shared/src/constants.rs`; measured values filled before production.

| Name                                                               | Value                                                                                                                                                                              |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GRACE_NS`                                                         | 24 h                                                                                                                                                                               |
| Term bounds, default term                                          | 7 d to 180 d, default 90 d; testnet from 10 min                                                                                                                                    |
| `BATCH_MAX_TOKENS`                                                 | 10 (verifier limit)                                                                                                                                                                |
| `FILL_GAS`, `EXERCISE_GAS`, `DECIDE_GAS_RESERVE`                   | measured, 30% headroom                                                                                                                                                             |
| `PACK_STORAGE`, `PACK_OPS_RESERVE`, `NFT_STORAGE`, `OFFER_STORAGE` | measured                                                                                                                                                                           |
| Caps per pack                                                      | ZEC 1, BTC 0.01, SOL 5, USDC 1,000 (same on testnet)                                                                                                                               |
| `MIN_WITHDRAW` per token                                           | from the bridge, measured                                                                                                                                                          |
| Token ids                                                          | ZEC `nep141:zec.omft.near` (8), BTC `nep141:btc.omft.near` (8), SOL `nep141:sol.omft.near` (9), USDC `nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1` (6) |

## 10. Off-chain

- **Indexer** reads the transactions of the registry and of each pack account from the FastNEAR transactions API and stores NEP-297 events idempotently by receipt id. The permissionless retries (`claim_payout`, `sync_encumbrance`, `pack::claim`, `finalize_exercise`) and `record_disruption` are open to any account; a keeper that sends them automatically is on the mainnet checklist.
- **API** (routes, controllers, services, repositories) serves packs, pack details in batches, positions, offers, the desk book and the testnet faucet. The app's Verify page re-runs the pack checks in the browser against public RPC.
- **Web** serves the landing at `mosaec.finance` and the app at `mosaec.finance/app`.
- **Desk** is a team-run autonomous lender behind an MCP server; its policy is enforced in code and its account holds only its budget.
