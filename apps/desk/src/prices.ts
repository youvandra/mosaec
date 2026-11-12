/** CoinGecko ids of the coins the desk may take. */
export const COINGECKO_IDS = { ZEC: 'zcash', BTC: 'bitcoin', SOL: 'solana' } as const;

export type DeskSymbol = keyof typeof COINGECKO_IDS;
export type PriceMap = Readonly<Partial<Record<DeskSymbol, number>>>;

/** A fetched price is reused this long before the source is asked again. */
const MAX_AGE_MS = 5 * 60_000;
/** Past this, a price from an earlier fetch is dropped even when the source keeps failing. */
export const STALE_AFTER_MS = 15 * 60_000;

/**
 * Reference USD prices for the desk's loan-to-value check. Contracts never read them. While the
 * source fails, the last good prices serve for up to 15 minutes; after that they are absent and
 * the policy refuses rather than lending against an old price.
 */
export class ReferencePrices {
  private cache: { at: number; prices: PriceMap } | null = null;

  /** True when the last `current()` answered from the source rather than a cached copy. */
  fresh = false;

  private fallback(): PriceMap {
    this.fresh = false;
    if (this.cache === null || this.now() - this.cache.at >= STALE_AFTER_MS) return {};
    return this.cache.prices;
  }

  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async current(): Promise<PriceMap> {
    if (this.cache !== null && this.now() - this.cache.at < MAX_AGE_MS) {
      this.fresh = false;
      return this.cache.prices;
    }
    const ids = Object.values(COINGECKO_IDS).join(',');
    try {
      const response = await this.fetchImpl(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
        { headers: { accept: 'application/json' } },
      );
      if (!response.ok) return this.fallback();
      const body = (await response.json()) as Record<string, { usd?: number } | undefined>;
      const prices: Partial<Record<DeskSymbol, number>> = {};
      for (const [symbol, id] of Object.entries(COINGECKO_IDS) as [DeskSymbol, string][]) {
        const usd = body[id]?.usd;
        if (typeof usd === 'number' && usd > 0) prices[symbol] = usd;
      }
      this.cache = { at: this.now(), prices };
      this.fresh = true;
      return prices;
    } catch {
      return this.fallback();
    }
  }
}
