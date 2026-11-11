import { aprBps } from '@mosaec/sdk';

import { formatUnits } from './format';

import type { Amount, Pack } from './api';

const NS_PER_DAY = 86_400_000_000_000n;
const NS_PER_MINUTE = 60_000_000_000n;
const DISPLAY_DECIMALS = 4;

/** `1.25 ZEC`, or the raw token id when the token is outside the allowlist. */
export function amountText(amount: Amount, maxFraction = DISPLAY_DECIMALS): string {
  if (amount.decimals === null) return `${amount.amount} ${amount.tokenId}`;
  return `${formatUnits(amount.amount, amount.decimals, maxFraction)} ${amount.symbol ?? ''}`.trim();
}

export function contentsText(pack: Pack): string {
  return pack.contents.length === 0
    ? 'Empty'
    : pack.contents.map((line) => amountText(line)).join(' + ');
}

/** A term in days, or in minutes for the short testnet terms. */
export function termText(termNs: string | null): string {
  if (termNs === null) return 'n/a';
  const ns = BigInt(termNs);
  if (ns >= NS_PER_DAY) {
    const days = ns / NS_PER_DAY;
    return `${days.toString()} day${days === 1n ? '' : 's'}`;
  }
  return `${(ns / NS_PER_MINUTE).toString()} min`;
}

/** Simple yearly rate the borrower pays, from the offer's price and repayment. */
export function aprText(pack: Pack): string | null {
  const price = pack.offer?.price;
  const terms = pack.terms;
  if (price === undefined || terms?.termNs == null) return null;
  if (price.tokenId !== terms.repayment.tokenId) return null;
  try {
    const bps = aprBps(BigInt(price.amount), BigInt(terms.repayment.amount), BigInt(terms.termNs));
    return `${(Number(bps) / 100).toFixed(1)}%`;
  } catch {
    return null;
  }
}

/** First collateral symbol, for the row's mark. */
export function leadSymbol(pack: Pack): string | null {
  return pack.contents[0]?.symbol ?? null;
}
