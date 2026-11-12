import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestDb } from '@mosaec/db/testing';

import { INSTANT_FILLS_PER_MINUTE, QUOTES_PER_MINUTE, createApp } from './app';
import { HttpInstantDesk } from './lib/desk-client';

import type { FillParams, InstantDeskClient, QuoteParams } from './services/instant-service';
import type { Db } from '@mosaec/db';

const QUOTE = {
  network: 'testnet',
  asset: 'ZEC' as const,
  amount: '50000000',
  principal: '200000000',
  repayment: '205500000',
  termNs: '2592000000000000',
  expiresAtMs: 1_800_000_000_000,
  cardId: '7',
  quoteId: 'a'.repeat(64),
  aprBps: 3_345,
  ltvBps: 4_000,
  monthlyBps: 275,
};

const FILL: FillParams = {
  pack: '9.v0.mosaec.testnet',
  quoteId: QUOTE.quoteId,
  network: 'testnet',
  asset: 'ZEC',
  amount: QUOTE.amount,
  principal: QUOTE.principal,
  repayment: QUOTE.repayment,
  termNs: QUOTE.termNs,
  expiresAtMs: QUOTE.expiresAtMs,
  cardId: QUOTE.cardId,
};

const QUERY = `/desk/quote?network=testnet&asset=ZEC&amount=50000000&term=${QUOTE.termNs}`;

describe('instant desk routes', () => {
  let db: Db;
  let close: () => Promise<void>;
  const asked: QuoteParams[] = [];
  const filled: FillParams[] = [];

  const stub: InstantDeskClient = {
    quote: (params) => {
      asked.push(params);
      return Promise.resolve({ available: true, quote: QUOTE });
    },
    fill: (params) => {
      filled.push(params);
      return Promise.resolve({ status: 'filled', txHash: 'DeskFillHash' });
    },
  };

  const build = (instantDesk?: InstantDeskClient) =>
    createApp({
      db,
      chain: {
        finalHeight: () => Promise.resolve(1n),
        registryPaused: () => Promise.resolve(false),
        balanceOf: () => Promise.resolve(0n),
      },
      allowedOrigins: [],
      readsPerMinute: 1_000,
      log: () => undefined,
      instantDesk,
    });

  const forwarded = (ip: string, init: RequestInit = {}): RequestInit => ({
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), 'x-forwarded-for': ip },
  });

  const post = (ip: string, body: unknown) =>
    forwarded(ip, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    asked.length = 0;
    filled.length = 0;
  });

  afterEach(async () => {
    await close();
  });

  it('passes a valid quote request to the desk and returns its answer', async () => {
    const res = await build(stub).request(
      `${QUERY}&borrower=persona.testnet`,
      forwarded('1.1.1.1'),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: true, quote: QUOTE });
    expect(asked[0]).toMatchObject({ asset: 'ZEC', borrower: 'persona.testnet' });
  });

  it('refuses a malformed quote request without asking the desk', async () => {
    const res = await build(stub).request('/desk/quote?asset=DOGE&amount=1&term=1');
    expect(res.status).toBe(400);
    expect(asked).toHaveLength(0);
  });

  it('answers a quote for another network as unavailable', async () => {
    const res = await build(stub).request(QUERY.replace('testnet', 'mainnet'));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: { code: 'DESK_UNAVAILABLE' } });
  });

  it('passes a valid fill to the desk', async () => {
    const res = await build(stub).request(
      '/desk/instant-fill?network=testnet',
      post('1.1.1.1', FILL),
    );
    expect(await res.json()).toEqual({ status: 'filled', txHash: 'DeskFillHash' });
    expect(filled).toEqual([FILL]);
  });

  it('refuses a fill with a malformed quote id', async () => {
    const res = await build(stub).request(
      '/desk/instant-fill?network=testnet',
      post('1.1.1.1', { ...FILL, quoteId: 'nope' }),
    );
    expect(res.status).toBe(400);
    expect(filled).toHaveLength(0);
  });

  it('rate limits quotes and fills per client address', async () => {
    const app = build(stub);
    for (let i = 0; i < QUOTES_PER_MINUTE; i += 1) {
      expect((await app.request(QUERY, forwarded('2.2.2.2'))).status).toBe(200);
    }
    expect((await app.request(QUERY, forwarded('2.2.2.2'))).status).toBe(429);
    for (let i = 0; i < INSTANT_FILLS_PER_MINUTE; i += 1) {
      await app.request('/desk/instant-fill?network=testnet', post('3.3.3.3', FILL));
    }
    const over = await app.request('/desk/instant-fill?network=testnet', post('3.3.3.3', FILL));
    expect(over.status).toBe(429);
  });

  it('answers DESK_UNAVAILABLE when the desk is down', async () => {
    const down = new HttpInstantDesk('http://127.0.0.1:1', () =>
      Promise.reject(new Error('connect ECONNREFUSED')),
    );
    const res = await build(down).request(QUERY);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: { code: 'DESK_UNAVAILABLE' } });
  });

  it('answers DESK_UNAVAILABLE when the desk returns an odd shape', async () => {
    const odd = new HttpInstantDesk('http://desk', () =>
      Promise.resolve(new Response(JSON.stringify({ hello: 'world' }))),
    );
    const res = await build(odd).request(QUERY);
    expect(res.status).toBe(503);
  });

  it('answers DESK_UNAVAILABLE when no desk is configured', async () => {
    const res = await build().request(QUERY);
    expect(res.status).toBe(503);
  });
});
