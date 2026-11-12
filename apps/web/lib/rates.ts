import { FAIR_MONTHLY_RATE_BPS, TERM_OPTIONS, repaymentFor } from '@mosaec/config/rates';

import type { AssetSymbol } from '@mosaec/config/assets';

export type { TermOption } from '@mosaec/config/rates';
export { TERM_OPTIONS };

/**
 * Suggested monthly rates at 50% LTV: the fair rates the desk also prices from. They are
 * suggestions only: the borrower sets the repayment.
 */
export const SUGGESTED_MONTHLY_RATE_BPS: Readonly<Partial<Record<AssetSymbol, number>>> =
  FAIR_MONTHLY_RATE_BPS;

/** Repayment the form suggests: the shared formula, interest rounded up to a whole cent. */
export const suggestedRepayment = repaymentFor;

/**
 * Suggested loan as a share of the coins' reference value. The research priced every default rate
 * at 50% loan to value; the contract reads no price, so this only fills the form.
 */
export const SUGGESTED_LTV = 0.5;

/** Suggested principal (USDC units, whole dollars, never above `cap`) for coins worth `usd`. */
export function suggestedPrincipal(usd: number, cap: bigint): bigint {
  const dollars = BigInt(Math.max(Math.floor(usd * SUGGESTED_LTV), 0));
  const units = dollars * 1_000_000n;
  return units > cap ? cap : units;
}
