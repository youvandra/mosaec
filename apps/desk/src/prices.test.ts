import { describe, expect, it } from 'vitest';

import { ReferencePrices, STALE_AFTER_MS } from './prices';

const ok = () =>
  Promise.resolve(
    new Response(
      JSON.stringify({ zcash: { usd: 1_000 }, bitcoin: { usd: 90_000 }, solana: { usd: 200 } }),
    ),
  );
const down = () => Promise.resolve(new Response('slow down', { status: 429 }));

describe('ReferencePrices', () => {
  it('serves the last good prices while the source fails, then drops them', async () => {
    let now = 0;
    let source: () => Promise<Response> = ok;
    const prices = new ReferencePrices(
      () => source(),
      () => now,
    );

    expect(await prices.current()).toEqual({ ZEC: 1_000, BTC: 90_000, SOL: 200 });
    expect(prices.fresh).toBe(true);

    source = down;
    now = 10 * 60_000;
    expect((await prices.current()).ZEC).toBe(1_000);
    expect(prices.fresh).toBe(false);

    now = STALE_AFTER_MS;
    expect(await prices.current()).toEqual({});
    expect(prices.fresh).toBe(false);
  });

  it('has no price before the first good answer', async () => {
    const prices = new ReferencePrices(
      () => Promise.reject(new Error('offline')),
      () => 0,
    );
    expect(await prices.current()).toEqual({});
  });

  it('reports every fresh read, whichever caller made it, and never a cached one', async () => {
    let now = 0;
    const beats: number[] = [];
    const prices = new ReferencePrices(
      ok,
      () => now,
      (observed) => {
        beats.push(observed.ZEC ?? 0);
        return Promise.resolve();
      },
    );
    await prices.current();
    now = 60_000;
    await prices.current();
    now = 6 * 60_000;
    await prices.current();
    expect(beats).toEqual([1_000, 1_000]);
  });
});
