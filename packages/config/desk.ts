import { z } from 'zod';

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
  /** Lowest simple yearly rate the desk lends at, in basis points. */
  minAprBps: z.number().int().min(0),
  minTermNs: bigintString,
  maxTermNs: bigintString,
  /** Largest principal per fill, in USDC's smallest unit. */
  maxFillUsdc: bigintString,
  /** Largest principal out at once across every running desk pawn. */
  maxExposureUsdc: bigintString,
  /** Largest principal lent in one UTC day. */
  dailyBudgetUsdc: bigintString,
  maxFillsPerHour: z.number().int().min(0),
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
    /* BTC prices at about 12% a year (1% a month); 10% keeps all three coins in reach. */
    minAprBps: 1_000,
    minTermNs: (10n * NS_PER_MINUTE).toString(),
    maxTermNs: (90n * NS_PER_DAY).toString(),
    maxFillUsdc: (250n * USDC_UNIT).toString(),
    maxExposureUsdc: (1_000n * USDC_UNIT).toString(),
    dailyBudgetUsdc: (1_000n * USDC_UNIT).toString(),
    maxFillsPerHour: 4,
    paused: false,
  },
  mainnet: {
    network: 'mainnet',
    deskAccountId: DESK_ACCOUNTS.mainnet,
    assets: ['ZEC', 'BTC', 'SOL'],
    maxLtvBps: 5_000,
    minAprBps: 2_000,
    minTermNs: (7n * NS_PER_DAY).toString(),
    maxTermNs: (90n * NS_PER_DAY).toString(),
    maxFillUsdc: (50n * USDC_UNIT).toString(),
    maxExposureUsdc: (200n * USDC_UNIT).toString(),
    dailyBudgetUsdc: (100n * USDC_UNIT).toString(),
    maxFillsPerHour: 2,
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
