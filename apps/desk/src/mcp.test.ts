import { describe, expect, it } from 'vitest';

import { holdsToken, mcpLimiter } from './mcp';

describe('holdsToken', () => {
  it('accepts the desk bearer token only', () => {
    expect(holdsToken('Bearer s3cret', 's3cret')).toBe(true);
    expect(holdsToken('Bearer s3cre', 's3cret')).toBe(false);
    expect(holdsToken(undefined, 's3cret')).toBe(false);
    expect(holdsToken('Bearer s3cret', undefined)).toBe(false);
  });
});

describe('mcpLimiter', () => {
  it('allows a set number of requests per address per minute', () => {
    let now = 0;
    const allow = mcpLimiter(2, () => now);
    expect([allow('a'), allow('a'), allow('a')]).toEqual([true, true, false]);
    expect(allow('b')).toBe(true);
    now = 60_000;
    expect(allow('a')).toBe(true);
  });
});
