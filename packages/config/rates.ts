import type { AssetSymbol } from './assets';

/** Coins that can sit in a pack as collateral and carry a fair rate. */
export type CollateralSymbol = Exclude<AssetSymbol, 'USDC'>;

/**
 * Fair monthly rate at 50% loan to value, from the 11 Nov 2026 pricing run (lognormal model, full
 * hourly history). The app suggests it to borrowers; the house desk adds its margin on top.
 */
export const FAIR_MONTHLY_RATE_BPS: Readonly<Record<CollateralSymbol, number>> = {
  ZEC: 250,
  BTC: 100,
  SOL: 225,
};

/** What the house desk charges above the fair rate, per month. */
export const DESK_MARGIN_BPS = 25;

/** The highest rate card is this many times the fair rate, so a model cannot price a coin away. */
const MAX_RATE_MULTIPLE = 3;

export interface RateBounds {
  /** Fair rate plus the desk margin: the desk never lends below it. */
  readonly minMonthlyBps: number;
  readonly maxMonthlyBps: number;
}

/** The band every desk rate card for `symbol` must sit in. */
export function rateBounds(symbol: CollateralSymbol): RateBounds {
  const fair = FAIR_MONTHLY_RATE_BPS[symbol];
  const minMonthlyBps = fair + DESK_MARGIN_BPS;
  return { minMonthlyBps, maxMonthlyBps: Math.max(fair * MAX_RATE_MULTIPLE, minMonthlyBps) };
}

const NS_PER_MINUTE = 60_000_000_000n;
export const NS_PER_DAY = 1_440n * NS_PER_MINUTE;
const DAYS_PER_MONTH = 30n;
const DAYS_PER_YEAR = 365n;
const BPS = 10_000n;
/** One cent of USDC (6 decimals): repayments are priced in whole cents. */
const CENT = 10_000n;

/** Simple yearly rate of a monthly rate (30-day month, 365-day year), rounded down. */
export function monthlyToAprBps(monthlyBps: number): number {
  return Number((BigInt(monthlyBps) * DAYS_PER_YEAR) / DAYS_PER_MONTH);
}

/**
 * Repayment for `principal` (USDC units) at a monthly rate over `termNs`. Interest rounds up to a
 * whole cent, so even a minutes-long rehearsal term gives a readable amount.
 */
export function repaymentFor(principal: bigint, monthlyRateBps: number, termNs: bigint): bigint {
  const monthNs = DAYS_PER_MONTH * NS_PER_DAY;
  const numerator = principal * BigInt(monthlyRateBps) * termNs;
  const denominator = BPS * monthNs * CENT;
  return principal + ((numerator + denominator - 1n) / denominator) * CENT;
}

export interface TermOption {
  readonly id: string;
  readonly label: string;
  readonly termNs: bigint;
  /** Offered on testnet only, so a full loan fits into one sitting. */
  readonly testnetOnly?: boolean;
}

export const TERM_OPTIONS: readonly TermOption[] = [
  { id: 'q15', label: '15 minutes', termNs: 15n * NS_PER_MINUTE, testnetOnly: true },
  { id: 'd30', label: '30 days', termNs: 30n * NS_PER_DAY },
  { id: 'd60', label: '60 days', termNs: 60n * NS_PER_DAY },
  { id: 'd90', label: '90 days', termNs: 90n * NS_PER_DAY },
];
