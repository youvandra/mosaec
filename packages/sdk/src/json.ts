const BIGINT_TAG = '__mosaec_u64__:';

/**
 * `JSON.stringify` that writes every `bigint` as a bare JSON number. Contract `u64` arguments such
 * as nanosecond times exceed the safe integer range, so they travel as `bigint` until this point.
 * Amounts (`U128`) are passed as decimal strings by the builders and never reach this path.
 */
export function stringifyContractJson(value: unknown): string {
  const text = JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'bigint' ? `${BIGINT_TAG}${item.toString()}` : item,
  );
  return text.replace(new RegExp(`"${BIGINT_TAG}(\\d+)"`, 'g'), '$1');
}
