import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CONTRACT_ERROR_CODES,
  ERROR_CATALOG,
  ERROR_CODES,
  MosaecError,
  contractCodeIn,
  isErrorCode,
} from './errors';

const ERROR_RS = readFileSync(
  join(import.meta.dirname, '../../../contracts/shared/src/error.rs'),
  'utf8',
);

/** Codes returned by `MosaecError::code` in the Rust source, in order. */
function rustCodes(source: string): string[] {
  return [...source.matchAll(/Self::\w+ => "(E_[A-Z_]+)"/g)].map(([, code]) => code ?? '');
}

describe('catalog parity with contracts/shared/src/error.rs', () => {
  it('lists exactly the Rust codes, in the same order', () => {
    expect(CONTRACT_ERROR_CODES).toEqual(rustCodes(ERROR_RS));
  });
});

describe('catalog entries', () => {
  it.each(ERROR_CODES)('%s renders a message', (code) => {
    const error = new MosaecError(code);
    expect(error.message).toBe(`${code}: ${ERROR_CATALOG[code].message}`);
    expect(ERROR_CATALOG[code].message).toMatch(/^[A-Z].*\.$/);
    expect(ERROR_CATALOG[code].message).not.toContain('—');
  });

  it.each(ERROR_CODES)('%s maps to an HTTP error status', (code) => {
    const { httpStatus } = ERROR_CATALOG[code];
    expect(httpStatus).toBeGreaterThanOrEqual(400);
    expect(httpStatus).toBeLessThan(600);
  });
});

describe('contractCodeIn', () => {
  it('reads the code from a panic message', () => {
    expect(
      contractCodeIn(
        'Smart contract panicked: E_HOLDER: caller is not the direct owner of the required token',
      ),
    ).toBe('E_HOLDER');
  });

  it('ignores text without a known code', () => {
    expect(contractCodeIn('Exceeded the prepaid gas')).toBeUndefined();
    expect(contractCodeIn('E_UNKNOWN: nothing')).toBeUndefined();
  });

  it('narrows strings with isErrorCode', () => {
    expect(isErrorCode('E_CAP')).toBe(true);
    expect(isErrorCode('E_NOPE')).toBe(false);
  });
});
