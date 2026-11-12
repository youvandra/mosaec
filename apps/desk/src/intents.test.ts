import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { IntentsQuotes } from './intents';

/** A real 1Click dry quote, 0.5 ZEC -> USDC, recorded 12 Nov 2026. */
const recorded: unknown = JSON.parse(
  readFileSync(new URL('./fixtures/oneclick-dry-quote-zec.json', import.meta.url), 'utf8'),
);

const NOW = new Date('2026-11-12T04:02:30Z');

function stub(response: Response | Error) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('IntentsQuotes.toUsdc', () => {
  it('marks kept ZEC at a recorded 1Click dry quote', async () => {
    const { fetchImpl, calls } = stub(Response.json(recorded));
    const mark = await new IntentsQuotes(undefined, fetchImpl, () => NOW).toUsdc(
      'ZEC',
      50_000_000n,
    );
    expect(mark).toEqual({
      source: 'near-intents',
      dry: true,
      amountOutUsdc: '492410430',
      quotedAt: '2026-11-12T04:02:31.249Z',
      correlationId: 'd1f408a9-4fa4-4a2b-b0b1-3fce18ae7806',
    });
    const body = JSON.parse(calls[0]?.init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      dry: true,
      originAsset: 'nep141:zec.omft.near',
      amount: '50000000',
      deadline: '2026-11-12T04:12:30.000Z',
    });
    expect(new Headers(calls[0]?.init.headers).has('authorization')).toBe(false);
  });

  it('sends the partner token when one is set', async () => {
    const { fetchImpl, calls } = stub(Response.json(recorded));
    await new IntentsQuotes('partner-token-0123456789', fetchImpl).toUsdc('BTC', 1_000_000n);
    expect(new Headers(calls[0]?.init.headers).get('authorization')).toBe(
      'Bearer partner-token-0123456789',
    );
  });

  it('returns null so the ledger keeps the reference price', async () => {
    const failing = [
      new Error('network down'),
      new Response('no route', { status: 400 }),
      Response.json({ quote: { amountOut: '0' } }),
      Response.json({ message: 'unexpected' }),
    ];
    for (const response of failing) {
      const { fetchImpl } = stub(response);
      expect(await new IntentsQuotes(undefined, fetchImpl).toUsdc('SOL', 1n)).toBeNull();
    }
  });

  it('asks nothing for an empty line', async () => {
    const { fetchImpl, calls } = stub(Response.json(recorded));
    expect(await new IntentsQuotes(undefined, fetchImpl).toUsdc('ZEC', 0n)).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
