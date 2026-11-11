import { z } from 'zod';

import { parseContractJson } from '@mosaec/domain';

import type { ChainBlock, ReceiptOutcome } from './extract';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class SourceError extends Error {
  override readonly name = 'SourceError';
}

/** Attempts per request before a rate limit or server error is reported. */
const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 500;
/** Spacing between requests to the free API. */
const DEFAULT_INTERVAL_MS = 250;
/** Most transactions the API returns details for in one call. */
export const TX_BATCH = 20;

const height = z.union([z.bigint(), z.number().int()]).transform((v) => BigInt(v));
const timestamp = z
  .union([z.bigint(), z.number().int(), z.string().regex(/^\d+$/)])
  .transform(String);

const accountTxsSchema = z.object({
  account_txs: z.array(
    z.object({
      transaction_hash: z.string(),
      tx_block_height: height,
    }),
  ),
});

const transactionsSchema = z.object({
  transactions: z.array(
    z.object({
      transaction: z.object({ hash: z.string() }),
      receipts: z.array(
        z.object({
          receipt: z.object({ receipt_id: z.string() }),
          execution_outcome: z.object({
            block_height: height,
            block_timestamp: timestamp,
            index: z.number().int().nonnegative(),
            outcome: z.object({
              executor_id: z.string(),
              logs: z.array(z.string()),
              status: z.record(z.string(), z.unknown()),
            }),
          }),
        }),
      ),
    }),
  ),
});

export interface AccountTx {
  readonly hash: string;
  readonly height: bigint;
}

function retryable(status: number): boolean {
  return status === 429 || status >= 500;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface TxSourceOptions {
  readonly apiKey?: string;
  readonly minIntervalMs?: number;
  readonly backoffMs?: number;
}

/**
 * The FastNEAR transactions API: which transactions touched an account, and every receipt of a
 * transaction with its block. Reading per account keeps the indexer to the handful of calls the
 * Mosaec accounts need instead of every block on the chain.
 */
export class FastnearTxSource {
  private nextSlot = 0;
  private readonly minIntervalMs: number;
  private readonly backoffMs: number;

  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly options: TxSourceOptions = {},
  ) {
    this.minIntervalMs = options.minIntervalMs ?? DEFAULT_INTERVAL_MS;
    this.backoffMs = options.backoffMs ?? BASE_BACKOFF_MS;
  }

  /** Transactions touching `accountId` with `after < height <= upTo`, oldest first. */
  async accountTxs(accountId: string, after: bigint, upTo: bigint): Promise<AccountTx[]> {
    const seen = new Set<string>();
    const found: AccountTx[] = [];
    let maxHeight = upTo;
    for (;;) {
      const page = accountTxsSchema.parse(
        await this.post('/v0/account', { account_id: accountId, max_block_height: maxHeight }),
      );
      // Pages run newest first and end at `max_block_height` inclusive, so a page boundary can
      // split one height; the next page starts at that height and repeats are skipped.
      const fresh = page.account_txs.filter((t) => !seen.has(t.transaction_hash));
      if (fresh.length === 0) {
        break;
      }
      let oldest = maxHeight;
      for (const t of fresh) {
        seen.add(t.transaction_hash);
        if (t.tx_block_height < oldest) {
          oldest = t.tx_block_height;
        }
        if (t.tx_block_height > after && t.tx_block_height <= upTo) {
          found.push({ hash: t.transaction_hash, height: t.tx_block_height });
        }
      }
      if (oldest <= after) {
        break;
      }
      maxHeight = oldest;
    }
    return found.sort((a, b) => (a.height < b.height ? -1 : a.height > b.height ? 1 : 0));
  }

  /** Every receipt of the given transactions, grouped into blocks in execution order. */
  async blocksOf(hashes: readonly string[]): Promise<ChainBlock[]> {
    const byHeight = new Map<
      bigint,
      { timestampNs: string; outcomes: (ReceiptOutcome & { index: number })[] }
    >();
    for (let i = 0; i < hashes.length; i += TX_BATCH) {
      const batch = hashes.slice(i, i + TX_BATCH);
      const page = transactionsSchema.parse(
        await this.post('/v0/transactions', { tx_hashes: batch }),
      );
      for (const tx of page.transactions) {
        for (const r of tx.receipts) {
          const eo = r.execution_outcome;
          const entry = byHeight.get(eo.block_height) ?? {
            timestampNs: eo.block_timestamp,
            outcomes: [],
          };
          entry.outcomes.push({
            receiptId: r.receipt.receipt_id,
            txHash: tx.transaction.hash,
            executorId: eo.outcome.executor_id,
            logs: eo.outcome.logs,
            status: eo.outcome.status,
            index: eo.index,
          });
          byHeight.set(eo.block_height, entry);
        }
      }
    }
    return [...byHeight.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([h, { timestampNs, outcomes }]) => ({
        height: h,
        timestampNs,
        outcomes: outcomes.sort((a, b) => a.index - b.index),
      }));
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const key = this.options.apiKey;
    const url =
      key === undefined
        ? `${this.baseUrl}${path}`
        : `${this.baseUrl}${path}?apiKey=${encodeURIComponent(key)}`;
    for (let attempt = 1; ; attempt += 1) {
      await this.slot();
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body, (_k, v: unknown) => (typeof v === 'bigint' ? Number(v) : v)),
      });
      if (response.ok) {
        return parseContractJson(await response.text());
      }
      if (!retryable(response.status) || attempt === MAX_ATTEMPTS) {
        throw new SourceError(`${path}: HTTP ${response.status.toString()}`);
      }
      const retryAfter = Number(response.headers.get('retry-after'));
      await delay(retryAfter > 0 ? retryAfter * 1_000 : this.backoffMs * 2 ** (attempt - 1));
    }
  }

  /** Waits for the next request slot so requests stay evenly spaced. */
  private async slot(): Promise<void> {
    const now = Date.now();
    const at = Math.max(now, this.nextSlot);
    this.nextSlot = at + this.minIntervalMs;
    if (at > now) {
      await delay(at - now);
    }
  }
}
