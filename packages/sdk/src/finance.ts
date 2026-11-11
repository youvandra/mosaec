/**
 * Pure pawn arithmetic in basis points and smallest units. Prices are display inputs only; the
 * contracts never see them.
 */

export const BPS = 10_000n;
const NS_PER_YEAR = 365n * 24n * 3_600_000_000_000n;

/** Loan-to-value in basis points: principal over collateral value, both in the same quote unit. */
export function ltvBps(principal: bigint, collateralValue: bigint): bigint {
  if (collateralValue <= 0n) {
    throw new RangeError('collateral value must be positive');
  }
  return (principal * BPS) / collateralValue;
}

/** Fee the borrower pays: repayment `K` less the principal. */
export function pawnFee(principal: bigint, k: bigint): bigint {
  if (k < principal) {
    throw new RangeError('repayment is below the principal');
  }
  return k - principal;
}

/** Simple annual rate in basis points implied by `K` over `principal` across `termNs`. */
export function aprBps(principal: bigint, k: bigint, termNs: bigint): bigint {
  if (principal <= 0n || termNs <= 0n) {
    throw new RangeError('principal and term must be positive');
  }
  return (pawnFee(principal, k) * BPS * NS_PER_YEAR) / (principal * termNs);
}

/** `K` for a principal at an annual rate in basis points over `termNs`, rounded up. */
export function repaymentFor(principal: bigint, aprBpsValue: bigint, termNs: bigint): bigint {
  const numerator = principal * aprBpsValue * termNs;
  const denominator = BPS * NS_PER_YEAR;
  return principal + (numerator + denominator - 1n) / denominator;
}
