import { z } from 'zod';

import { monthlyToAprBps, rateBounds } from './rates';

import type { AssetSymbol, NetworkId } from './assets';

const NS_PER_MINUTE = 60_000_000_000n;
const NS_PER_DAY = 1_440n * NS_PER_MINUTE;

const bigintString = z
  .string()
  .regex(/^\d+$/, 'a base-10 integer string')
  .transform((value) => BigInt(value));

/**
 * The house desk's lending policy. The desk server checks every rule against chain data before it
 * signs, whatever the agent proposes; the agent only chooses among offers the policy allows.
 */
export const deskPolicySchema = z.object({
  network: z.enum(['mainnet', 'testnet']),
  deskAccountId: z.string().min(2),
  /** Collateral the desk accepts. */
  assets: z.array(z.enum(['ZEC', 'BTC', 'SOL'])).min(1),
  /** Largest loan as a share of the collateral's reference value, in basis points. */
  maxLtvBps: z.number().int().min(1).max(10_000),
  /** Lowest simple yearly rate the desk lends at, per coin: fair rate plus the desk margin. */
  minAprBpsByAsset: z.record(z.enum(['ZEC', 'BTC', 'SOL']), z.number().int().min(0)),
  /** The lowest of `minAprBpsByAsset`, shown as the desk's floor. */
  minAprBps: z.number().int().min(0),
  minTermNs: bigintString,
  maxTermNs: bigintString,
  /** Smallest principal per fill, so dust offers cannot spend the hourly fill quota. */
  minFillUsdc: bigintString,
  /** Largest principal per fill, in USDC's smallest unit. */
  maxFillUsdc: bigintString,
  /** Largest principal out at once across every running desk pawn. */
  maxExposureUsdc: bigintString,
  /** Largest principal lent in one UTC day. */
  dailyBudgetUsdc: bigintString,
  /** Fills the agent loop and the MCP tool may make per hour. */
  maxFillsPerHour: z.number().int().min(0),
  /** Instant desk loans per hour, a quota of their own so the loop cannot block them. */
  maxInstantFillsPerHour: z.number().int().min(0),
  /** A paused desk quotes and refuses every fill with `DESK_PAUSED`. */
  paused: z.boolean(),
});

export type DeskPolicy = z.output<typeof deskPolicySchema>;
export type DeskPolicyInput = z.input<typeof deskPolicySchema>;

/** Desk account per network: a sub-account of the root that holds only the desk budget. */
export const DESK_ACCOUNTS: Readonly<Record<NetworkId, string>> = {
  mainnet: 'desk.mosaec.near',
  testnet: 'desk.mosaec.testnet',
};

const USDC_UNIT = 1_000_000n;

type DeskSymbol = 'ZEC' | 'BTC' | 'SOL';
const DESK_SYMBOLS: readonly DeskSymbol[] = ['ZEC', 'BTC', 'SOL'];

/** Yearly floor per coin, derived from the shared fair rates plus the desk margin. */
function aprFloors(): Record<DeskSymbol, number> {
  const entries = DESK_SYMBOLS.map((s) => [s, monthlyToAprBps(rateBounds(s).minMonthlyBps)]);
  return Object.fromEntries(entries) as Record<DeskSymbol, number>;
}

const APR_FLOORS = aprFloors();
const LOWEST_APR_FLOOR = Math.min(...Object.values(APR_FLOORS));

/**
 * Policy per network. Testnet accepts ten-minute terms so a full pawn fits into one demo; mainnet
 * follows the S1 proposal (50 USDC a fill, 200 USDC in total).
 */
export const DESK_POLICIES: Readonly<Record<NetworkId, DeskPolicyInput>> = {
  testnet: {
    network: 'testnet',
    deskAccountId: DESK_ACCOUNTS.testnet,
    assets: ['ZEC', 'BTC', 'SOL'],
    maxLtvBps: 5_000,
    minAprBpsByAsset: APR_FLOORS,
    minAprBps: LOWEST_APR_FLOOR,
    minTermNs: (10n * NS_PER_MINUTE).toString(),
    maxTermNs: (90n * NS_PER_DAY).toString(),
    minFillUsdc: (10n * USDC_UNIT).toString(),
    maxFillUsdc: (250n * USDC_UNIT).toString(),
    /* Sized to the 10,000 test USDC the testnet treasury holds. */
    maxExposureUsdc: (5_000n * USDC_UNIT).toString(),
    dailyBudgetUsdc: (5_000n * USDC_UNIT).toString(),
    maxFillsPerHour: 4,
    maxInstantFillsPerHour: 20,
    paused: false,
  },
  mainnet: {
    network: 'mainnet',
    deskAccountId: DESK_ACCOUNTS.mainnet,
    assets: ['ZEC', 'BTC', 'SOL'],
    maxLtvBps: 5_000,
    minAprBpsByAsset: APR_FLOORS,
    minAprBps: LOWEST_APR_FLOOR,
    minTermNs: (7n * NS_PER_DAY).toString(),
    maxTermNs: (90n * NS_PER_DAY).toString(),
    minFillUsdc: (10n * USDC_UNIT).toString(),
    maxFillUsdc: (50n * USDC_UNIT).toString(),
    maxExposureUsdc: (200n * USDC_UNIT).toString(),
    dailyBudgetUsdc: (100n * USDC_UNIT).toString(),
    maxFillsPerHour: 2,
    maxInstantFillsPerHour: 4,
    paused: true,
  },
};

/** The validated policy for `network`. Throws when the table above breaks the schema. */
export function deskPolicy(network: NetworkId): DeskPolicy {
  return deskPolicySchema.parse(DESK_POLICIES[network]);
}

/** Collateral the desk could ever accept, for type narrowing. */
export function isDeskAsset(symbol: string): symbol is Exclude<AssetSymbol, 'USDC'> {
  return symbol === 'ZEC' || symbol === 'BTC' || symbol === 'SOL';
}
