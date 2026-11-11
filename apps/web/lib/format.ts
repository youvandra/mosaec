import { formatUnits as toDecimal } from '@mosaec/domain';

/**
 * Display form of a token amount: thousands separators and at most `maxFraction` decimals,
 * truncated (never rounded up), so a shown balance is never more than the real one.
 */
export function formatUnits(
  amount: bigint | string,
  decimals: number,
  maxFraction = decimals,
): string {
  const text = toDecimal(typeof amount === 'string' ? BigInt(amount) : amount, decimals);
  const [whole = '0', fraction = ''] = text.split('.');
  const shown = fraction.slice(0, maxFraction).replace(/0+$/, '');
  const grouped = BigInt(whole).toLocaleString('en-US');
  return shown === '' ? grouped : `${grouped}.${shown}`;
}

const NS_PER_MS = 1_000_000n;

/** A nanosecond timestamp as a short UTC date, such as `9 Feb 2027`. */
export function formatDateNs(ns: bigint | string): string {
  const ms = Number((typeof ns === 'string' ? BigInt(ns) : ns) / NS_PER_MS);
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(ms);
}
