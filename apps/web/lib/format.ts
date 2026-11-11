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

const COMPACT: readonly (readonly [bigint, string])[] = [
  [10n ** 18n, 'Qn'],
  [10n ** 15n, 'Q'],
  [10n ** 12n, 'T'],
  [10n ** 9n, 'B'],
  [10n ** 6n, 'M'],
];

/**
 * A token amount short enough for a card: below a million it is `formatUnits`, above it one
 * truncated decimal and a suffix, such as `1.2M` or `9.9Qn`.
 */
export function formatCompact(amount: bigint, decimals: number, maxFraction = decimals): string {
  const whole = amount / 10n ** BigInt(decimals);
  const step = COMPACT.find(([size]) => whole >= size);
  if (step === undefined) return formatUnits(amount, decimals, maxFraction);
  const [size, suffix] = step;
  const tenths = (whole * 10n) / size;
  const text = `${(tenths / 10n).toLocaleString('en-US')}.${(tenths % 10n).toString()}`;
  return `${text.replace(/\.0$/, '')}${suffix}`;
}

/** A display amount padded to cents, such as `512.5` to `512.50`. */
export function padCents(value: string): string {
  const [whole = '0', fraction = ''] = value.split('.');
  return `${whole}.${fraction.padEnd(2, '0')}`;
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

/** A nanosecond timestamp as date and UTC time, such as `9 Feb 2027, 14:05 UTC`. */
export function formatDateTimeNs(ns: bigint | string): string {
  const ms = Number((typeof ns === 'string' ? BigInt(ns) : ns) / NS_PER_MS);
  const text = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
  }).format(ms);
  return `${text} UTC`;
}
