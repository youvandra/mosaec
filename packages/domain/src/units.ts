/** Conversions between a token's smallest unit (`bigint`) and the decimal text people read. */

export class UnitsError extends Error {
  override readonly name = 'UnitsError';
}

/** `formatUnits(150000000n, 8)` is `"1.5"`. Trailing zeros are dropped. */
export function formatUnits(amount: bigint, decimals: number): string {
  if (amount < 0n) {
    throw new UnitsError('amount must not be negative');
  }
  const base = 10n ** BigInt(decimals);
  const whole = amount / base;
  const fraction = (amount % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction === '' ? whole.toString() : `${whole.toString()}.${fraction}`;
}

/** `parseUnits("1.5", 8)` is `150000000n`. Refuses more fraction digits than `decimals`. */
export function parseUnits(text: string, decimals: number): bigint {
  const match = /^(\d+)(?:\.(\d*))?$/.exec(text.trim());
  if (match === null) {
    throw new UnitsError(`"${text}" is not a decimal amount`);
  }
  const [, whole = '0', fraction = ''] = match;
  if (fraction.length > decimals) {
    throw new UnitsError(`at most ${decimals.toString()} decimal places`);
  }
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
}
