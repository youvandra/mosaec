import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { schema } from '@mosaec/db';
import { createTestDb } from '@mosaec/db/testing';

import { createApp } from './app';
import { FAUCET_DAILY_CAP } from './services/faucet-service';

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

  const faucetSent: string[] = [];

  let faucetHeld = 10n ** 15n;

  function build(overrides: { chain?: ChainProbe; readsPerMinute?: number } = {}): Hono {
    return createApp({
      db,
      chain: { balanceOf: () => Promise.resolve(5_000_000n), ...(overrides.chain ?? chainOk) },
      allowedOrigins: ['https://app.mosaec.finance'],
      readsPerMinute: overrides.readsPerMinute ?? 1_000,
      clock: () => NOW_NS,
      log: () => undefined,
      faucet: {
        send: (_network, receiverId) => {
          faucetSent.push(receiverId);
          return Promise.resolve('FaucetTxHash');
        },
        accountExists: (_network, accountId) => Promise.resolve(!accountId.startsWith('ghost')),
        balances: (_network, tokenIds) => Promise.resolve(tokenIds.map(() => faucetHeld)),
      },
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

  it('returns several packs with history in one call, skipping unknown ids', async () => {
    const res = (await json(`/packs/details?ids=0.${REGISTRY},99.${REGISTRY},4.${REGISTRY}`)) as {
      status: number;
      body: { items: { id: string; history: unknown[] }[] };
    };
    expect(res.status).toBe(200);
    expect(res.body.items.map((item) => item.id)).toEqual([`0.${REGISTRY}`, `4.${REGISTRY}`]);
    expect(res.body.items[0]?.history).toEqual([]);
    const tooMany = Array.from({ length: 26 }, (_, i) => `${i.toString()}.${REGISTRY}`).join(',');
    expect((await app.request(`/packs/details?ids=${tooMany}`)).status).toBe(400);
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

  it('does not hold the local web server to one client budget', async () => {
    app = build({ readsPerMinute: 1 });
    const local = { incoming: { socket: { remoteAddress: '127.0.0.1' } } };
    for (let i = 0; i < 3; i += 1) {
      expect((await app.request('/health', {}, local)).status).toBe(200);
    }
    const proxied = { 'x-forwarded-for': '203.0.113.9' };
    await app.request('/health', { headers: proxied }, local);
    expect((await app.request('/health', { headers: proxied }, local)).status).toBe(429);
    const remote = { incoming: { socket: { remoteAddress: '198.51.100.7' } } };
    await app.request('/health', {}, remote);
    expect((await app.request('/health', {}, remote)).status).toBe(429);
  });

  it('allows the app origin only', async () => {
    const ok = await app.request('/health', { headers: { origin: 'https://app.mosaec.finance' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://app.mosaec.finance');
    const other = await app.request('/health', { headers: { origin: 'https://evil.example' } });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('serves the desk overview with its policy and an empty book', async () => {
    const res = await app.request('/desk?network=testnet');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accountId: string;
      policy: { maxLtvBps: number; maxFillUsdc: string };
      stats: { fills: number; lentUsdc: string };
      balances: { symbol: string; amount: string | null }[];
    };
    expect(body.accountId).toBe('desk.mosaec.testnet');
    expect(body.policy.maxLtvBps).toBe(5_000);
    expect(body.policy.maxFillUsdc).toBe('250000000');
    expect(body.stats).toMatchObject({ fills: 0, lentUsdc: '0' });
    expect(body.balances[0]).toMatchObject({ symbol: 'USDC', amount: '5000000' });
  });

  it('lists desk decisions newest first', async () => {
    const res = await app.request('/desk/decisions?network=testnet&limit=5');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { items: unknown[] }).items).toEqual([]);
  });

  const claim = (accountId: string, ip = '203.0.113.1', network = 'testnet') =>
    app.request(`/faucet?network=${network}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ accountId }),
    });

  async function code(res: Response): Promise<string> {
    return ((await res.json()) as { error: { code: string } }).error.code;
  }

  it('grants test tokens once a day per account, on testnet only', async () => {
    faucetSent.length = 0;
    const first = await claim('alice.testnet');
    expect(first.status).toBe(200);
    expect(((await first.json()) as { txHash: string }).txHash).toBe('FaucetTxHash');
    expect(faucetSent).toEqual(['alice.testnet']);
    const again = await claim('alice.testnet', '198.51.100.7');
    expect(again.status).toBe(429);
    expect(await code(again)).toBe('FAUCET_ACCOUNT_USED');
    expect((await claim('carol.testnet', '198.51.100.8', 'mainnet')).status).toBe(404);
  });

  it('refuses an account that does not exist, and sends nothing', async () => {
    faucetSent.length = 0;
    const res = await claim('ghost-name.testnet', '203.0.113.30');
    expect(res.status).toBe(404);
    expect(await code(res)).toBe('FAUCET_NO_ACCOUNT');
    expect(faucetSent).toEqual([]);
    expect((await claim('alice.testnet', '203.0.113.30')).status).toBe(200);
  });

  it('grants once a day per client address', async () => {
    expect((await claim('alice.testnet', '203.0.113.9')).status).toBe(200);
    const second = await claim('bob.testnet', '203.0.113.9');
    expect(second.status).toBe(429);
    expect(await code(second)).toBe('FAUCET_IP_USED');
    expect((await claim('bob.testnet', '203.0.113.10')).status).toBe(200);
  });

  it('stops at the daily cap across accounts and addresses', async () => {
    for (let i = 0; i < FAUCET_DAILY_CAP; i += 1) {
      expect((await claim(`user${i.toString()}.testnet`, `10.0.0.${i.toString()}`)).status).toBe(
        200,
      );
    }
    const over = await claim('late.testnet', '10.0.1.1');
    expect(over.status).toBe(429);
    expect(await code(over)).toBe('FAUCET_DAILY_CAP');
  });

  it('refuses while the faucet is below its reserve, and sends nothing', async () => {
    faucetSent.length = 0;
    faucetHeld = 1n;
    const res = await claim('alice.testnet', '203.0.113.20');
    faucetHeld = 10n ** 15n;
    expect(res.status).toBe(503);
    expect(await code(res)).toBe('FAUCET_LOW');
    expect(faucetSent).toEqual([]);
    expect((await claim('alice.testnet', '203.0.113.20')).status).toBe(200);
  });
});
