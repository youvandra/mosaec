import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/**
 * Read model of the Mosaec contracts. The indexer is the only writer; the API reads. Token amounts
 * (`U128`) are `numeric(39, 0)` and nanosecond times `numeric(20, 0)`, both read as strings so no
 * value passes through a JS number.
 */

const u128 = (name: string) => numeric(name, { precision: 39, scale: 0 });
const u64 = (name: string) => numeric(name, { precision: 20, scale: 0 });
const height = (name: string) => bigint(name, { mode: 'bigint' });
const network = () => text('network').notNull();

/** Last block each indexer stream has fully processed. */
export const checkpoints = pgTable(
  'checkpoints',
  {
    network: network(),
    stream: text('stream').notNull(),
    lastHeight: height('last_height').notNull(),
    lastBlockTimestampNs: u64('last_block_timestamp_ns').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.network, t.stream] })],
);

/** Every NEP-297 event a Mosaec contract emitted, and verifier transfers touching a pack. */
export const events = pgTable(
  'events',
  {
    network: network(),
    receiptId: text('receipt_id').notNull(),
    logIndex: integer('log_index').notNull(),
    blockHeight: height('block_height').notNull(),
    blockTimestampNs: u64('block_timestamp_ns').notNull(),
    txHash: text('tx_hash'),
    executorId: text('executor_id').notNull(),
    standard: text('standard').notNull(),
    event: text('event').notNull(),
    packId: text('pack_id'),
    data: jsonb('data').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.receiptId, t.logIndex] }),
    index('events_pack_idx').on(t.network, t.packId, t.blockHeight),
    index('events_height_idx').on(t.network, t.blockHeight),
  ],
);

/** Latest state of each pack, refreshed from `position_of` and the pack's `status`. */
export const packs = pgTable(
  'packs',
  {
    network: network(),
    packId: text('pack_id').notNull(),
    packIndex: height('pack_index').notNull(),
    titleId: text('title_id').notNull(),
    titleOwner: text('title_owner'),
    ticketId: text('ticket_id'),
    ticketOwner: text('ticket_owner'),
    state: text('state', { enum: ['free', 'offered', 'written'] }).notNull(),
    rounds: integer('rounds').notNull(),
    payToken: text('pay_token'),
    price: u128('price'),
    makerId: text('maker_id'),
    kToken: text('k_token'),
    kAmount: u128('k_amount'),
    termNs: u64('term_ns'),
    offerExpiresAtNs: u64('offer_expires_at_ns'),
    expiresAtNs: u64('expires_at_ns'),
    /** The pack's exercise deadline, which includes grace after a recorded disruption. */
    deadlineNs: u64('deadline_ns'),
    disruptedAtNs: u64('disrupted_at_ns'),
    contents: jsonb('contents'),
    contentsHash: text('contents_hash'),
    ticketPending: boolean('ticket_pending').notNull().default(false),
    commandInFlight: boolean('command_in_flight').notNull().default(false),
    /** `Redeemed` or `Forfeited`, set by the last closing event. */
    lastOutcome: text('last_outcome', { enum: ['Redeemed', 'Forfeited'] }),
    mintedHeight: height('minted_height'),
    refreshedHeight: height('refreshed_height').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.network, t.packId] }),
    index('packs_state_idx').on(t.network, t.state),
    index('packs_title_owner_idx').on(t.network, t.titleOwner),
    index('packs_ticket_owner_idx').on(t.network, t.ticketOwner),
  ],
);

/** Every offer ever opened, keyed by the receipt that opened it. */
export const offers = pgTable(
  'offers',
  {
    network: network(),
    receiptId: text('receipt_id').notNull(),
    packId: text('pack_id').notNull(),
    makerId: text('maker_id').notNull(),
    payToken: text('pay_token').notNull(),
    price: u128('price').notNull(),
    kToken: text('k_token').notNull(),
    kAmount: u128('k_amount').notNull(),
    termNs: u64('term_ns').notNull(),
    offerExpiresAtNs: u64('offer_expires_at_ns').notNull(),
    contents: jsonb('contents').notNull(),
    contentsHash: text('contents_hash').notNull(),
    status: text('status', { enum: ['open', 'filled', 'cancelled', 'title_moved'] }).notNull(),
    openedHeight: height('opened_height').notNull(),
    closedHeight: height('closed_height'),
  },
  (t) => [
    primaryKey({ columns: [t.network, t.receiptId] }),
    index('offers_open_idx').on(t.network, t.status, t.packId),
  ],
);

/** Current owner of each Title and Ticket. */
export const tokens = pgTable(
  'tokens',
  {
    network: network(),
    tokenId: text('token_id').notNull(),
    kind: text('kind', { enum: ['title', 'ticket'] }).notNull(),
    packId: text('pack_id').notNull(),
    ownerId: text('owner_id'),
    burned: boolean('burned').notNull().default(false),
    updatedHeight: height('updated_height').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.network, t.tokenId] }),
    index('tokens_owner_idx').on(t.network, t.ownerId),
  ],
);

/** Each change of a Title or Ticket owner. */
export const holdersHistory = pgTable(
  'holders_history',
  {
    network: network(),
    tokenId: text('token_id').notNull(),
    receiptId: text('receipt_id').notNull(),
    logIndex: integer('log_index').notNull(),
    ownerId: text('owner_id'),
    fromHeight: height('from_height').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.network, t.receiptId, t.logIndex, t.tokenId] }),
    index('holders_token_idx').on(t.network, t.tokenId, t.fromHeight),
  ],
);

/** Verifier balances last read for accounts the app shows. */
export const balancesSnapshot = pgTable(
  'balances_snapshot',
  {
    network: network(),
    accountId: text('account_id').notNull(),
    tokenId: text('token_id').notNull(),
    amount: u128('amount').notNull(),
    height: height('height').notNull(),
  },
  (t) => [primaryKey({ columns: [t.network, t.accountId, t.tokenId] })],
);

/** Display prices only; contracts never read them. */
export const prices = pgTable(
  'prices',
  {
    symbol: text('symbol').notNull(),
    usd: numeric('usd', { precision: 30, scale: 10 }).notNull(),
    source: text('source').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.symbol, t.observedAt] })],
);

/** Single-use NEP-413 sign-in nonces. */
export const authNonces = pgTable('auth_nonces', {
  nonce: text('nonce').primaryKey(),
  network: network(),
  accountId: text('account_id').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
});

/** Signed-in sessions; the cookie holds the id, stored here only as a hash. */
export const sessions = pgTable(
  'sessions',
  {
    idHash: text('id_hash').primaryKey(),
    network: network(),
    accountId: text('account_id').notNull(),
    csrfToken: text('csrf_token').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('sessions_account_idx').on(t.network, t.accountId)],
);

/**
 * One row per desk decision: what the agent proposed for an offer, the policy verdict, and the
 * transaction when the desk filled. The desk service is the only writer.
 */
export const deskDecisions = pgTable(
  'desk_decisions',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    network: network(),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
    /** `run` groups the decisions of one loop pass. */
    runId: text('run_id').notNull(),
    packId: text('pack_id'),
    /** Which offer on the pack the verdict is about; a re-offered pack gets a new key. */
    offerKey: text('offer_key'),
    /**
     * `fill` signed, `pass` declined by the agent, `refused` blocked by policy, `error` failed,
     * `collect` moved a repayment or kept coins out of a desk pack.
     */
    verdict: text('verdict', { enum: ['fill', 'pass', 'refused', 'error', 'collect'] }).notNull(),
    /** Catalog code for `refused` and `error` (`DESK_POLICY`, `DESK_BUDGET`, ...). */
    code: text('code'),
    /** Plain reason shown on the desk page. */
    reason: text('reason').notNull(),
    /** The quote the policy computed: principal, repayment, apr, ltv, term. */
    quote: jsonb('quote'),
    principal: u128('principal'),
    txHash: text('tx_hash'),
    /** Model that proposed the action, `policy` for checks without a model, `instant` for quotes. */
    actor: text('actor').notNull(),
    /** Borrower who made the offer, for the one-open-instant-loan-per-borrower rule. */
    makerId: text('maker_id'),
  },
  (t) => [index('desk_decisions_recent_idx').on(t.network, t.decidedAt)],
);

/**
 * Monthly rate per coin the desk quotes instant loans at. The agent proposes one an hour; the
 * server clamps it to the shared bounds, or writes the fallback card when the model fails.
 */
export const deskRateCards = pgTable(
  'desk_rate_cards',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    network: network(),
    asset: text('asset').notNull(),
    monthlyBps: integer('monthly_bps').notNull(),
    maxLtvBps: integer('max_ltv_bps').notNull(),
    /** What the card was set from: volatility, utilisation, book results, previous card. */
    inputs: jsonb('inputs').notNull(),
    reason: text('reason').notNull(),
    /** `model` when the agent's proposal stood (after clamping), `fallback` otherwise. */
    source: text('source', { enum: ['model', 'fallback'] }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('desk_rate_cards_latest_idx').on(t.network, t.asset, t.createdAt)],
);

/** The desk's kill switch, one row per network, flipped by the control CLI on the server. */
export const deskControls = pgTable('desk_controls', {
  network: text('network').primaryKey(),
  paused: boolean('paused').notNull(),
  reason: text('reason').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Testnet faucet grants: one per account per day. The API is the only writer. */
export const faucetClaims = pgTable(
  'faucet_claims',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    network: network(),
    accountId: text('account_id').notNull(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
    txHash: text('tx_hash'),
  },
  (t) => [index('faucet_claims_account_idx').on(t.network, t.accountId, t.claimedAt)],
);
