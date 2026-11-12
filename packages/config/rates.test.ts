import { describe, expect, it } from 'vitest';

import { deskPolicy } from './desk';
import {
  DESK_MARGIN_BPS,
  FAIR_MONTHLY_RATE_BPS,
  NS_PER_DAY,
  monthlyToAprBps,
  rateBounds,
  repaymentFor,
} from './rates';

import type { CollateralSymbol } from './rates';

const USDC = 1_000_000n;
const MINUTE = 60_000_000_000n;
const SYMBOLS = Object.keys(FAIR_MONTHLY_RATE_BPS) as CollateralSymbol[];

/** The web app's formula before it moved here (apps/web/lib/rates.ts at c7c8281). */
function previousWebRepayment(principal: bigint, monthlyRateBps: number, termNs: bigint): bigint {
  const monthNs = 30n * NS_PER_DAY;
  const numerator = principal * BigInt(monthlyRateBps) * termNs;
  const denominator = 10_000n * monthNs * 10_000n;
  return principal + ((numerator + denominator - 1n) / denominator) * 10_000n;
}

describe('repaymentFor', () => {
  it.each([
    [100n * USDC, 250, 15n * MINUTE],
    [1_000n * USDC, 250, 30n * NS_PER_DAY],
    [200n * USDC, 100, 15n * MINUTE],
    [777_777_777n, 225, 90n * NS_PER_DAY],
    [10n * USDC, 275, 60n * NS_PER_DAY],
  ])('matches the previous web formula for %s at %i bps over %s ns', (principal, bps, term) => {
    expect(repaymentFor(principal, bps, term)).toBe(previousWebRepayment(principal, bps, term));
  });

  it('charges one full month of interest over 30 days, in whole cents', () => {
    expect(repaymentFor(1_000n * USDC, 250, 30n * NS_PER_DAY)).toBe(1_025n * USDC);
    expect(repaymentFor(100n * USDC, 250, 15n * MINUTE) % 10_000n).toBe(0n);
  });
});

describe('rateBounds', () => {
  it.each(SYMBOLS)('never lets %s sit below fair rate plus margin', (symbol) => {
    const { minMonthlyBps, maxMonthlyBps } = rateBounds(symbol);
    expect(minMonthlyBps).toBe(FAIR_MONTHLY_RATE_BPS[symbol] + DESK_MARGIN_BPS);
    expect(maxMonthlyBps).toBeGreaterThanOrEqual(minMonthlyBps);
  });

  it('feeds the desk policy floor per coin', () => {
    const policy = deskPolicy('testnet');
    for (const symbol of SYMBOLS) {
      expect(policy.minAprBpsByAsset[symbol]).toBe(
        monthlyToAprBps(rateBounds(symbol).minMonthlyBps),
      );
    }
    expect(policy.minAprBps).toBe(Math.min(...Object.values(policy.minAprBpsByAsset)));
  });
});
