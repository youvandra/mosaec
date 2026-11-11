/** CoinGecko ids of the coins the desk may take. */
const COINGECKO_IDS = { ZEC: 'zcash', BTC: 'bitcoin', SOL: 'solana' } as const;

export type DeskSymbol = keyof typeof COINGECKO_IDS;
export type PriceMap = Readonly<Partial<Record<DeskSymbol, number>>>;

const MAX_AGE_MS = 5 * 60_000;

/**
 * Reference USD prices for the desk's loan-to-value check. Contracts never read them; a failed
 * source leaves the price absent and the policy refuses rather than guessing.
 */
export class ReferencePrices {
  private cache: { at: number; prices: PriceMap } | null = null;

  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async current(): Promise<PriceMap> {
    if (this.cache !== null && this.now() - this.cache.at < MAX_AGE_MS) return this.cache.prices;
    const ids = Object.values(COINGECKO_IDS).join(',');
    try {
      const response = await this.fetchImpl(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
        { headers: { accept: 'application/json' } },
      );
      if (!response.ok) return this.cache?.prices ?? {};
      const body = (await response.json()) as Record<string, { usd?: number } | undefined>;
      const prices: Partial<Record<DeskSymbol, number>> = {};
      for (const [symbol, id] of Object.entries(COINGECKO_IDS) as [DeskSymbol, string][]) {
        const usd = body[id]?.usd;
        if (typeof usd === 'number' && usd > 0) prices[symbol] = usd;
      }
      this.cache = { at: this.now(), prices };
      return prices;
    } catch {
      return this.cache?.prices ?? {};
    }
  }
}
