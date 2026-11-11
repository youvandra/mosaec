'use client';

import { useEffect, useState } from 'react';

import type { Amount } from './api';

/** CoinGecko ids for the coins a pack can hold. USDC is taken at one dollar. */
const COINGECKO_IDS: Readonly<Record<string, string>> = {
  ZEC: 'zcash',
  BTC: 'bitcoin',
  SOL: 'solana',
};

export type UsdPrices = Readonly<Record<string, number>>;

const TTL_MS = 5 * 60 * 1_000;
let cache: { readonly at: number; readonly prices: UsdPrices } | null = null;
let inflight: Promise<UsdPrices> | null = null;

async function fetchPrices(): Promise<UsdPrices> {
  if (cache !== null && Date.now() - cache.at < TTL_MS) return cache.prices;
  inflight ??= fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${Object.values(COINGECKO_IDS).join(',')}&vs_currencies=usd`,
  )
    .then(async (response) => {
      if (!response.ok) throw new Error(`prices ${response.status.toString()}`);
      const body = (await response.json()) as Record<string, { usd?: number }>;
      const prices: Record<string, number> = { USDC: 1 };
      for (const [symbol, id] of Object.entries(COINGECKO_IDS)) {
        const usd = body[id]?.usd;
        if (typeof usd === 'number') prices[symbol] = usd;
      }
      cache = { at: Date.now(), prices };
      return prices;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Reference USD prices, refreshed every five minutes; `null` until loaded or when unreachable. */
export function useUsdPrices(): UsdPrices | null {
  const [prices, setPrices] = useState<UsdPrices | null>(cache?.prices ?? null);
  useEffect(() => {
    let live = true;
    const load = () => {
      fetchPrices()
        .then((value) => {
          if (live) setPrices(value);
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, TTL_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, []);
  return prices;
}

/** Dollar value of some amounts, or `null` when a price or the decimals are missing. */
export function usdValue(lines: readonly Amount[], prices: UsdPrices | null): number | null {
  if (prices === null || lines.length === 0) return null;
  let total = 0;
  for (const line of lines) {
    const price = line.symbol === null ? undefined : prices[line.symbol];
    if (price === undefined || line.decimals === null) return null;
    total += (Number(line.amount) / 10 ** line.decimals) * price;
  }
  return total;
}

/** Dollars for a glance: `$512.40`, `$1,001`, then `$12.5K`, `$1M`, `$3.4B` from 10,000 up. */
export function usdText(value: number): string {
  if (Math.abs(value) >= 10_000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}
