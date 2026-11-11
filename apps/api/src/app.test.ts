import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { schema } from '@mosaec/db';
import { createTestDb } from '@mosaec/db/testing';

import { createApp } from './app';

import type { ChainProbe } from './services/health-service';
import type { Db } from '@mosaec/db';
import type { Hono } from 'hono';

const NOW_NS = 1_794_360_000_000_000_000n;
const HOUR_NS = 3_600_000_000_000n;
const DAY_NS = 24n * HOUR_NS;
const REGISTRY = 'v0.mosaec.testnet';
const ZEC = 'nep141:zec.mosaec.testnet';
const USDC = 'nep141:usdc.mosaec.testnet';

type PackInsert = typeof schema.packs.$inferInsert;

function pack(index: number, fields: Partial<PackInsert>): PackInsert {
  return {
    network: 'testnet',
    packId: `${index.toString()}.${REGISTRY}`,
    packIndex: BigInt(index),
    titleId: `t${index.toString()}`,
    titleOwner: 'borrower.testnet',
    state: 'free',
    rounds: 0,
    refreshedHeight: 100n,
    ...fields,
  };
}

function written(index: number, expiresAt: bigint, deadline = expiresAt): Partial<PackInsert> {
  return {
    state: 'written',
    rounds: 1,
    titleOwner: 'lender.testnet',
    ticketId: `k${index.toString()}.1`,
    ticketOwner: 'borrower.testnet',
    kToken: USDC,
    kAmount: '107500000',
    expiresAtNs: expiresAt.toString(),
    deadlineNs: deadline.toString(),
    contents: [{ token_id: ZEC, amount: '50000000' }],
  };
}

const chainOk: ChainProbe = {
  finalHeight: () => Promise.resolve(1_000n),
  registryPaused: () => Promise.resolve(false),
};

interface PackJson {
  id: string;
  status: string | null;
  terms: { repayment: { symbol: string; amount: string }; expiresAtNs: string } | null;
  contents: { symbol: string; decimals: number; amount: string }[];
}

describe('API', () => {
  let db: Db;
  let close: () => Promise<void>;
  let app: Hono;

  function build(overrides: { chain?: ChainProbe; readsPerMinute?: number } = {}): Hono {
    return createApp({
      db,
      chain: overrides.chain ?? chainOk,
      allowedOrigins: ['https://app.mosaec.finance'],
      readsPerMinute: overrides.readsPerMinute ?? 1_000,
      clock: () => NOW_NS,
      log: () => undefined,
    });
  }

  async function json(
    path: string,
    init?: RequestInit,
  ): Promise<{ status: number; body: unknown }> {
    const res = await app.request(path, init);
    return { status: res.status, body: await res.json() };
  }

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    await db.insert(schema.packs).values([
      pack(0, written(0, NOW_NS + 30n * DAY_NS)),
      pack(1, written(1, NOW_NS + HOUR_NS)),
      pack(2, written(2, NOW_NS - HOUR_NS, NOW_NS + 23n * HOUR_NS)),
      pack(3, written(3, NOW_NS - HOUR_NS)),
      pack(4, { state: 'free', rounds: 1, titleOwner: 'lender.testnet', lastOutcome: 'Redeemed' }),
      pack(5, {
        state: 'offered',
        makerId: 'borrower.testnet',
        payToken: USDC,
        price: '100000000',
        kToken: USDC,
        kAmount: '107500000',
        termNs: '600000000000',
        offerExpiresAtNs: (NOW_NS + DAY_NS).toString(),
      }),
      pack(6, {
        state: 'offered',
        makerId: 'borrower.testnet',
        payToken: USDC,
        price: '1',
        offerExpiresAtNs: (NOW_NS - 1n).toString(),
      }),
    ]);
    app = build();
  });

  afterEach(async () => {
    await close();
  });

  it('answers /health', async () => {
    expect(await json('/health')).toEqual({ status: 200, body: { ok: true } });
  });

  it('lists packs with one status per stage and exact amounts', async () => {
    const { body } = (await json('/packs?network=testnet')) as {
      status: number;
      body: { items: PackJson[] };
    };
    expect(body.items.map((p) => p.status)).toEqual([
      'Active',
      'Due Soon',
      'Grace',
      'Forfeited',
      'Redeemed',
      'Open',
      'Open',
    ]);
    const [first] = body.items;
    expect(first?.terms?.repayment).toMatchObject({ symbol: 'USDC', amount: '107500000' });
    expect(first?.contents[0]).toMatchObject({ symbol: 'ZEC', decimals: 8, amount: '50000000' });
  });

  it('pages with a cursor', async () => {
    const page1 = (await json('/packs?limit=3')) as {
      status: number;
      body: { items: PackJson[]; nextCursor: string };
    };
    expect(page1.body.items).toHaveLength(3);
    const page2 = (await json(`/packs?limit=3&cursor=${page1.body.nextCursor}`)) as {
      status: number;
      body: { items: PackJson[] };
    };
    expect(page2.body.items[0]?.id).toBe(`3.${REGISTRY}`);
  });

  it('returns one pack with its history, and NOT_FOUND for an unknown one', async () => {
    await db.insert(schema.events).values({
      network: 'testnet',
      receiptId: 'r1',
      logIndex: 0,
      blockHeight: 90n,
      blockTimestampNs: '1794359000000000000',
      executorId: REGISTRY,
      standard: 'mosaec',
      event: 'filled',
      packId: `0.${REGISTRY}`,
      data: { pack: `0.${REGISTRY}` },
    });
    const found = (await json(`/packs/0.${REGISTRY}`)) as {
      status: number;
      body: { history: { event: string }[] };
    };
    expect(found.body.history.map((h) => h.event)).toEqual(['filled']);
    const missing = (await json(`/packs/99.${REGISTRY}`)) as {
      status: number;
      body: { error: { code: string } };
    };
    expect(missing).toMatchObject({ status: 404, body: { error: { code: 'NOT_FOUND' } } });
  });

  it('refuses a malformed account with VALIDATION', async () => {
    const res = (await json('/packs?owner=Not%20An%20Account')) as {
      status: number;
      body: { error: { code: string } };
    };
    expect(res).toMatchObject({ status: 400, body: { error: { code: 'VALIDATION' } } });
  });

  it('groups an account into lending, borrowing and owned', async () => {
    const lender = (await json('/accounts/lender.testnet/positions')) as {
      status: number;
      body: Record<string, PackJson[]>;
    };
    expect(lender.body.lending?.map((p) => p.id)).toHaveLength(4);
    expect(lender.body.owned?.map((p) => p.id)).toEqual([`4.${REGISTRY}`]);
    const borrower = (await json('/accounts/borrower.testnet/positions')) as {
      status: number;
      body: Record<string, PackJson[]>;
    };
    expect(borrower.body.borrowing).toHaveLength(4);
  });

  it('lists only offers still open', async () => {
    const { body } = (await json('/offers')) as { status: number; body: { items: PackJson[] } };
    expect(body.items.map((p) => p.id)).toEqual([`5.${REGISTRY}`]);
  });

  it('is ready with a fresh, close checkpoint and not ready when it falls behind', async () => {
    await db.insert(schema.checkpoints).values({
      network: 'testnet',
      stream: 'txs',
      lastHeight: 980n,
      lastBlockTimestampNs: '0',
    });
    expect(((await json('/ready')) as { status: number; body: { ok: boolean } }).status).toBe(200);

    app = build({
      chain: {
        finalHeight: () => Promise.resolve(5_000n),
        registryPaused: () => Promise.resolve(false),
      },
    });
    const behind = (await json('/ready')) as {
      status: number;
      body: { ok: boolean; networks: { lagBlocks: string }[] };
    };
    expect(behind.status).toBe(503);
    expect(behind.body.networks[0]?.lagBlocks).toBe('4020');
  });

  it('limits reads per client and says when to retry', async () => {
    app = build({ readsPerMinute: 2 });
    const headers = { 'x-forwarded-for': '203.0.113.9' };
    await app.request('/health', { headers });
    await app.request('/health', { headers });
    const res = await app.request('/health', { headers });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).not.toBeNull();
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('RATE_LIMITED');
    expect(
      (await app.request('/health', { headers: { 'x-forwarded-for': '198.51.100.1' } })).status,
    ).toBe(200);
  });

  it('allows the app origin only', async () => {
    const ok = await app.request('/health', { headers: { origin: 'https://app.mosaec.finance' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://app.mosaec.finance');
    const other = await app.request('/health', { headers: { origin: 'https://evil.example' } });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });
});
