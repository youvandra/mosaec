import { z } from 'zod';

import { NETWORK_IDS } from '@mosaec/config/assets';
import { PAWN_STATUSES } from '@mosaec/domain';

import type { NetworkId } from '@mosaec/config/assets';

const amountSchema = z.object({
  tokenId: z.string(),
  symbol: z.string().nullable(),
  decimals: z.number().int().nullable(),
  amount: z.string(),
});

export type Amount = z.output<typeof amountSchema>;

export const packSchema = z.object({
  id: z.string(),
  index: z.string(),
  state: z.enum(['free', 'offered', 'written']),
  status: z.enum(PAWN_STATUSES).nullable(),
  title: z.object({ id: z.string(), owner: z.string().nullable() }),
  ticket: z.object({ id: z.string(), owner: z.string().nullable() }).nullable(),
  contents: z.array(amountSchema),
  contentsHash: z.string().nullable(),
  offer: z
    .object({
      maker: z.string().nullable(),
      price: amountSchema,
      expiresAtNs: z.string().nullable(),
    })
    .nullable(),
  terms: z
    .object({
      repayment: amountSchema,
      termNs: z.string().nullable(),
      expiresAtNs: z.string().nullable(),
      deadlineNs: z.string().nullable(),
      disruptedAtNs: z.string().nullable(),
    })
    .nullable(),
  rounds: z.number().int(),
  mintedHeight: z.string().nullable(),
  updatedHeight: z.string(),
});

export type Pack = z.output<typeof packSchema>;

const eventSchema = z.object({
  receiptId: z.string(),
  txHash: z.string().nullable(),
  height: z.string(),
  timestampNs: z.string().nullable(),
  standard: z.string(),
  event: z.string(),
  data: z.unknown(),
});

export type PackEvent = z.output<typeof eventSchema>;

const packListSchema = z.object({ items: z.array(packSchema), nextCursor: z.string().nullable() });
const packDetailSchema = packSchema.extend({ history: z.array(eventSchema) });
const positionsSchema = z.object({
  lending: z.array(packSchema),
  borrowing: z.array(packSchema),
  owned: z.array(packSchema),
});
const offersSchema = z.object({ items: z.array(packSchema) });

export type PackDetail = z.output<typeof packDetailSchema>;
export type Positions = z.output<typeof positionsSchema>;

export class ApiError extends Error {
  override readonly name = 'ApiError';
  constructor(
    message: string,
    readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** Server code calls the API directly; the browser goes through the `/api` rewrite. */
function baseUrl(): string {
  return typeof window === 'undefined'
    ? (process.env.MOSAEC_API_URL ?? 'http://127.0.0.1:8787')
    : '/api';
}

const DEFAULT_REVALIDATE_SECONDS = 15;

/**
 * Lists may be up to 15 s old; one pack and one account's positions are always read fresh, since
 * they are what a person just changed with a transaction.
 */
async function getJson<T extends z.ZodType>(
  path: string,
  schema: T,
  fresh = false,
): Promise<z.output<T>> {
  let response: Response;
  try {
    response = await fetch(
      `${baseUrl()}${path}`,
      fresh ? { cache: 'no-store' } : { next: { revalidate: DEFAULT_REVALIDATE_SECONDS } },
    );
  } catch (cause) {
    throw new ApiError('The Mosaec API is unreachable.', undefined, { cause });
  }
  if (!response.ok) {
    throw new ApiError(`The Mosaec API answered ${response.status.toString()}.`, response.status);
  }
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiError('The Mosaec API returned an unexpected shape.', undefined, {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

function checkNetwork(network: NetworkId): void {
  if (!NETWORK_IDS.includes(network)) {
    throw new ApiError(`Unknown network ${network}.`);
  }
}

/** The first `limit` packs on `network` in mint order. */
export async function listPacks(network: NetworkId, limit: number): Promise<readonly Pack[]> {
  checkNetwork(network);
  const body = await getJson(`/packs?network=${network}&limit=${limit.toString()}`, packListSchema);
  return body.items;
}

/** One pack with its event history, or `null` when the indexer has no such pack. */
/** Most ids the API takes in one details request. */
const DETAILS_PER_REQUEST = 25;

/**
 * Packs with their history, read in batches of 25. Lists may be up to 15 s old like every list;
 * unknown ids are left out.
 */
export async function getPackDetails(
  network: NetworkId,
  packIds: readonly string[],
): Promise<readonly PackDetail[]> {
  checkNetwork(network);
  const batches: string[][] = [];
  for (let i = 0; i < packIds.length; i += DETAILS_PER_REQUEST) {
    batches.push(packIds.slice(i, i + DETAILS_PER_REQUEST));
  }
  const pages = await Promise.all(
    batches.map((ids) =>
      getJson(
        `/packs/details?network=${network}&ids=${ids.map(encodeURIComponent).join(',')}`,
        z.object({ items: z.array(packDetailSchema) }),
      ),
    ),
  );
  return pages.flatMap((page) => page.items);
}

export async function getPack(network: NetworkId, packId: string): Promise<PackDetail | null> {
  checkNetwork(network);
  try {
    return await getJson(
      `/packs/${encodeURIComponent(packId)}?network=${network}`,
      packDetailSchema,
      true,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function listOffers(network: NetworkId, limit = 50): Promise<readonly Pack[]> {
  checkNetwork(network);
  return (await getJson(`/offers?network=${network}&limit=${limit.toString()}`, offersSchema))
    .items;
}

export async function getPositions(network: NetworkId, accountId: string): Promise<Positions> {
  checkNetwork(network);
  return getJson(
    `/accounts/${encodeURIComponent(accountId)}/positions?network=${network}`,
    positionsSchema,
    true,
  );
}

const deskBalanceSchema = z.object({
  symbol: z.string(),
  tokenId: z.string(),
  decimals: z.number().int(),
  amount: z.string().nullable(),
});

const deskOverviewSchema = z.object({
  network: z.enum(NETWORK_IDS),
  accountId: z.string(),
  policy: z.object({
    assets: z.array(z.string()),
    maxLtvBps: z.number().int(),
    minAprBps: z.number().int(),
    minTermNs: z.string(),
    maxTermNs: z.string(),
    minFillUsdc: z.string(),
    maxFillUsdc: z.string(),
    maxExposureUsdc: z.string(),
    dailyBudgetUsdc: z.string(),
    maxFillsPerHour: z.number().int(),
    paused: z.boolean(),
  }),
  balances: z.array(deskBalanceSchema),
  stats: z.object({
    fills: z.number().int(),
    lentUsdc: z.string(),
    openExposureUsdc: z.string(),
    running: z.number().int(),
    repaid: z.number().int(),
    earnedUsdc: z.string(),
    coinsKept: z.number().int(),
  }),
  prices: z.array(z.object({ symbol: z.string(), usd: z.string(), observedAt: z.string() })),
});

const deskDecisionSchema = z.object({
  id: z.string(),
  decidedAt: z.string(),
  runId: z.string(),
  packId: z.string().nullable(),
  verdict: z.enum(['fill', 'pass', 'refused', 'error']),
  code: z.string().nullable(),
  reason: z.string(),
  quote: z
    .object({
      collateral: z.object({ symbol: z.string(), amount: z.string() }),
      principal: z.string(),
      repayment: z.string(),
      interest: z.string(),
      termNs: z.string(),
      aprBps: z.number(),
      ltvBps: z.number(),
    })
    .partial()
    .nullable(),
  principal: z.string().nullable(),
  txHash: z.string().nullable(),
  actor: z.string(),
});

export type DeskOverview = z.output<typeof deskOverviewSchema>;
export type DeskDecision = z.output<typeof deskDecisionSchema>;

/** The house desk's holdings, results and policy. */
export async function getDesk(network: NetworkId): Promise<DeskOverview> {
  checkNetwork(network);
  return getJson(`/desk?network=${network}`, deskOverviewSchema);
}

/** The desk's latest decisions, newest first. */
export async function getDeskDecisions(
  network: NetworkId,
  limit = 30,
): Promise<readonly DeskDecision[]> {
  checkNetwork(network);
  return (
    await getJson(
      `/desk/decisions?network=${network}&limit=${limit.toString()}`,
      z.object({ items: z.array(deskDecisionSchema) }),
    )
  ).items;
}

const rateCardSchema = z.object({
  asset: z.string(),
  monthlyBps: z.number().int(),
  maxLtvBps: z.number().int(),
  fairMonthlyBps: z.number().int().nullable(),
  minMonthlyBps: z.number().int().nullable(),
  source: z.enum(['model', 'fallback']),
  reason: z.string(),
  createdAt: z.string(),
});

const ledgerEventSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.enum(['fill', 'collect']),
    at: z.string(),
    packId: z.string().nullable(),
    symbol: z.string().nullable(),
    amount: z.string(),
    decimals: z.number().int().nullable(),
    txHash: z.string().nullable(),
    actor: z.string(),
  }),
  z.object({
    kind: z.literal('card'),
    at: z.string(),
    asset: z.string(),
    monthlyBps: z.number().int(),
    previousBps: z.number().int().nullable(),
    source: z.string(),
    reason: z.string(),
  }),
  z.object({ kind: z.enum(['pause', 'resume']), at: z.string(), reason: z.string() }),
]);

const deskLedgerSchema = z.object({
  network: z.enum(NETWORK_IDS),
  accountId: z.string(),
  generatedAt: z.string(),
  status: z.object({
    state: z.enum(['live', 'paused']),
    by: z.enum(['config', 'switch']).nullable(),
    reason: z.string().nullable(),
    since: z.string().nullable(),
  }),
  treasury: z.object({ balances: z.array(deskBalanceSchema), usdc: z.string().nullable() }),
  book: z.object({
    fills: z.number().int(),
    lentTotalUsdc: z.string(),
    lentNowUsdc: z.string(),
    running: z.number().int(),
    repaid: z.number().int(),
    realisedInterestUsdc: z.string(),
    forfeited: z.number().int(),
    keptCoins: z.array(
      z.object({
        packId: z.string(),
        symbol: z.string(),
        amount: z.string(),
        decimals: z.number().int(),
        principal: z.string(),
        markUsdc: z.string().nullable(),
        markSource: z.string(),
        quotedAt: z.string().nullable().optional(),
      }),
    ),
    utilisationBps: z.number().int(),
    lentTodayUsdc: z.string(),
    budgetLeftTodayUsdc: z.string(),
  }),
  rateCard: z.object({ current: z.array(rateCardSchema), history: z.array(rateCardSchema) }),
  policy: deskOverviewSchema.shape.policy.extend({
    minAprBpsByAsset: z.record(z.string(), z.number().int()),
    maxInstantFillsPerHour: z.number().int(),
  }),
  events: z.array(ledgerEventSchema),
});

export type DeskLedger = z.output<typeof deskLedgerSchema>;
export type DeskRateCard = z.output<typeof rateCardSchema>;
export type DeskLedgerEvent = z.output<typeof ledgerEventSchema>;

/** The desk's books: treasury, loans out, results, rate card, rules and recent moves. */
export async function getDeskLedger(network: NetworkId): Promise<DeskLedger> {
  checkNetwork(network);
  return getJson(`/desk/ledger?network=${network}`, deskLedgerSchema, true);
}

export interface FaucetGrant {
  readonly accountId: string;
  readonly txHash: string;
}

/** Asks the testnet faucet for test ZEC, BTC, SOL and USDC. Throws `ApiError` with the API's message. */
export async function claimFaucet(accountId: string): Promise<FaucetGrant> {
  const response = await fetch(`${baseUrl()}/faucet?network=testnet`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accountId }),
  });
  const body = (await response.json()) as {
    txHash?: string;
    accountId?: string;
    error?: { message?: string };
  };
  if (!response.ok || body.txHash === undefined) {
    throw new ApiError(body.error?.message ?? 'The faucet is unavailable.', response.status);
  }
  return { accountId: body.accountId ?? accountId, txHash: body.txHash };
}

const instantQuoteSchema = z.object({
  network: z.string(),
  asset: z.enum(['ZEC', 'BTC', 'SOL']),
  amount: z.string(),
  principal: z.string(),
  repayment: z.string(),
  termNs: z.string(),
  expiresAtMs: z.number().int(),
  cardId: z.string(),
  quoteId: z.string(),
  aprBps: z.number().int(),
  ltvBps: z.number().int(),
  monthlyBps: z.number().int(),
});

const quoteAnswerSchema = z.discriminatedUnion('available', [
  z.object({ available: z.literal(true), quote: instantQuoteSchema }),
  z.object({ available: z.literal(false), code: z.string(), reason: z.string() }),
]);

const instantFillSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('filled'), txHash: z.string() }),
  z.object({
    status: z.enum(['refused', 'error']),
    code: z.string(),
    reason: z.string(),
    txHash: z.string().optional(),
  }),
]);

export type InstantQuote = z.output<typeof instantQuoteSchema>;
export type InstantQuoteAnswer = z.output<typeof quoteAnswerSchema>;
export type InstantFillResult = z.output<typeof instantFillSchema>;

export interface InstantQuoteRequest {
  readonly asset: 'ZEC' | 'BTC' | 'SOL';
  readonly amount: bigint;
  readonly termNs: bigint;
  readonly principal?: bigint | undefined;
  readonly borrower?: string | undefined;
}

/** Reads the API's error body into an `ApiError` carrying the catalog message. */
async function apiFailure(response: Response, fallback: string): Promise<ApiError> {
  const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  return new ApiError(body.error?.message ?? fallback, response.status);
}

/** A House Desk quote for coins about to be offered, valid for ten minutes. */
export async function getInstantQuote(
  network: NetworkId,
  request: InstantQuoteRequest,
): Promise<InstantQuoteAnswer> {
  checkNetwork(network);
  const query = new URLSearchParams({
    network,
    asset: request.asset,
    amount: request.amount.toString(),
    term: request.termNs.toString(),
  });
  if (request.principal !== undefined) query.set('principal', request.principal.toString());
  if (request.borrower !== undefined) query.set('borrower', request.borrower);
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}/desk/quote?${query.toString()}`, { cache: 'no-store' });
  } catch (cause) {
    throw new ApiError('The Mosaec API is unreachable.', undefined, { cause });
  }
  if (!response.ok) throw await apiFailure(response, 'The House Desk is unavailable.');
  return quoteAnswerSchema.parse(await response.json());
}

/** Asks the House Desk to fill `pack`, whose open offer carries the terms of `quote`. */
export async function requestInstantFill(
  network: NetworkId,
  pack: string,
  quote: InstantQuote,
): Promise<InstantFillResult> {
  checkNetwork(network);
  const terms = {
    network: quote.network,
    asset: quote.asset,
    amount: quote.amount,
    principal: quote.principal,
    repayment: quote.repayment,
    termNs: quote.termNs,
    expiresAtMs: quote.expiresAtMs,
    cardId: quote.cardId,
    quoteId: quote.quoteId,
  };
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}/desk/instant-fill?network=${network}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...terms, pack }),
    });
  } catch (cause) {
    throw new ApiError('The Mosaec API is unreachable.', undefined, { cause });
  }
  if (!response.ok) throw await apiFailure(response, 'The House Desk is unavailable.');
  return instantFillSchema.parse(await response.json());
}
