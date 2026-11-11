import type { AssetSymbol } from '@mosaec/config/assets';

/**
 * Suggested monthly rates at 50% LTV from the 11 Nov 2026 pricing run (lognormal model, full
 * hourly history). They are suggestions only: the borrower sets the repayment.
 */
export const SUGGESTED_MONTHLY_RATE_BPS: Readonly<Partial<Record<AssetSymbol, number>>> = {
  ZEC: 250,
  BTC: 100,
  SOL: 225,
};

const NS_PER_MINUTE = 60_000_000_000n;
const NS_PER_DAY = 1_440n * NS_PER_MINUTE;
const DAYS_PER_MONTH = 30n;
const BPS = 10_000n;

export interface TermOption {
  readonly id: string;
  readonly label: string;
  readonly termNs: bigint;
  /** Shown on testnet only, so a full loan fits into one sitting. */
  readonly testnetOnly?: boolean;
}

export const TERM_OPTIONS: readonly TermOption[] = [
  { id: 'q15', label: '15 minutes', termNs: 15n * NS_PER_MINUTE, testnetOnly: true },
  { id: 'd30', label: '30 days', termNs: 30n * NS_PER_DAY },
  { id: 'd60', label: '60 days', termNs: 60n * NS_PER_DAY },
  { id: 'd90', label: '90 days', termNs: 90n * NS_PER_DAY },
];

/** Repayment for `principal` at a monthly rate over `termNs`, rounded up to the smallest unit. */
export function suggestedRepayment(
  principal: bigint,
  monthlyRateBps: number,
  termNs: bigint,
): bigint {
  const monthNs = DAYS_PER_MONTH * NS_PER_DAY;
  const numerator = principal * BigInt(monthlyRateBps) * termNs;
  const denominator = BPS * monthNs;
  return principal + (numerator + denominator - 1n) / denominator;
}
