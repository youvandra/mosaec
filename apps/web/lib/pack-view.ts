import { formatUnits, padCents } from './format';

import type { Amount } from './api';

const NS_PER_DAY = 86_400_000_000_000n;
const NS_PER_MINUTE = 60_000_000_000n;
const DISPLAY_DECIMALS = 4;

/** `1.25 ZEC`, or the raw token id when the token is outside the allowlist. */
export function amountText(amount: Amount, maxFraction = DISPLAY_DECIMALS): string {
  if (amount.decimals === null) return `${amount.amount} ${amount.tokenId}`;
  return `${formatUnits(amount.amount, amount.decimals, maxFraction)} ${amount.symbol ?? ''}`.trim();
}

/** A term in days, or in minutes for the short testnet terms. */
export function termText(termNs: string | null): string {
  if (termNs === null) return '–';
  const ns = BigInt(termNs);
  if (ns >= NS_PER_DAY) {
    const days = ns / NS_PER_DAY;
    return `${days.toString()} day${days === 1n ? '' : 's'}`;
  }
  return `${(ns / NS_PER_MINUTE).toString()} min`;
}

/** A settlement amount to the cent, such as `512.50 USDC`. */
export function cashText(amount: Amount): string {
  if (amount.decimals === null) return amountText(amount);
  return `${padCents(formatUnits(amount.amount, amount.decimals, 2))} ${amount.symbol ?? ''}`.trim();
}

/** Only the number of a settlement amount, to the cent. */
export function cashNumber(amount: Amount): string {
  if (amount.decimals === null) return amount.amount;
  return padCents(formatUnits(amount.amount, amount.decimals, 2));
}
