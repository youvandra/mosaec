import { describe, expect, it } from 'vitest';

import { isNonceClash } from './chain';

describe('isNonceClash', () => {
  it('spots the RPC refusal for a nonce another transaction took', () => {
    expect(
      isNonceClash(
        new Error(
          'Transaction nonce 277236002000008 must be larger than nonce of the used access key 277236002000008',
        ),
      ),
    ).toBe(true);
  });

  it('leaves other failures alone', () => {
    expect(isNonceClash(new Error('Exceeded the prepaid gas'))).toBe(false);
    expect(isNonceClash('timeout')).toBe(false);
  });
});
