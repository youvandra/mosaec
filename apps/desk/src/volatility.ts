import { COINGECKO_IDS } from './prices';

import type { DeskSymbol } from './prices';

/** Daily closes are fetched again after this long. */
export const VOLATILITY_CACHE_MS = 6 * 3_600_000;
const DAYS = 30;
const DAYS_PER_YEAR = 365;

/** Annualised volatility of daily log returns, in basis points; null below two returns. */
export function realisedVolBps(closes: readonly number[]): number | null {
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    const previous = closes[i - 1];
    const current = closes[i];
    if (previous !== undefined && current !== undefined && previous > 0 && current > 0) {
      returns.push(Math.log(current / previous));
    }
  }
  if (returns.length < 2) return null;
  const mean = returns.reduce((total, r) => total + r, 0) / returns.length;
  const variance = returns.reduce((total, r) => total + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.round(Math.sqrt(variance * DAYS_PER_YEAR) * 10_000);
}

/** 30-day realised volatility per coin from CoinGecko daily closes, cached for six hours. */
export class RealisedVolatility {
  private readonly cache = new Map<DeskSymbol, { at: number; bps: number | null }>();

  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async of(symbol: DeskSymbol): Promise<number | null> {
    const hit = this.cache.get(symbol);
    if (hit !== undefined && this.now() - hit.at < VOLATILITY_CACHE_MS) return hit.bps;
    const url = `https://api.coingecko.com/api/v3/coins/${COINGECKO_IDS[symbol]}/market_chart?vs_currency=usd&days=${DAYS.toString()}&interval=daily`;
    try {
      const response = await this.fetchImpl(url, { headers: { accept: 'application/json' } });
      if (!response.ok) return hit?.bps ?? null;
      const body = (await response.json()) as { prices?: readonly (readonly number[])[] };
      const closes = (body.prices ?? []).map((point) => point[1] ?? 0);
      const bps = realisedVolBps(closes);
      this.cache.set(symbol, { at: this.now(), bps });
      return bps;
    } catch {
      return hit?.bps ?? null;
    }
  }
}
