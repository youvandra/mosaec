import { describe, expect, it } from 'vitest';

import { NETWORK_IDS } from './assets';
import {
  baseEnvSchema,
  EnvError,
  MAX_ACCOUNT_ID_LENGTH,
  MAX_VERIFIER_TOKEN_ID_LENGTH,
  packAccountId,
  parseEnv,
  verifierNftTokenId,
} from './env';
import { NETWORKS } from './networks';

const U64_MAX = 2n ** 64n - 1n;

describe('parseEnv', () => {
  it('returns typed values for a complete environment', () => {
    const env = parseEnv(baseEnvSchema, {
      MOSAEC_ENV: 'staging',
      NEAR_RPC_URL: 'https://rpc.mainnet.near.org',
    });
    expect(env).toEqual({ MOSAEC_ENV: 'staging', NEAR_RPC_URL: 'https://rpc.mainnet.near.org' });
  });

  it('names every missing variable', () => {
    expect(() => parseEnv(baseEnvSchema, {})).toThrow(EnvError);
    expect(() => parseEnv(baseEnvSchema, {})).toThrow(/MOSAEC_ENV[\s\S]*NEAR_RPC_URL/);
  });

  it('rejects an unknown environment name', () => {
    expect(() =>
      parseEnv(baseEnvSchema, { MOSAEC_ENV: 'dev', NEAR_RPC_URL: 'http://127.0.0.1:3030' }),
    ).toThrow(/MOSAEC_ENV/);
  });
});

describe.each(NETWORK_IDS)('%s registry names', (network) => {
  const { registryAccountId } = NETWORKS[network];
  const longestPack = packAccountId(registryAccountId, U64_MAX);

  it('keeps the longest pack account id within the account id limit', () => {
    expect(longestPack.length).toBeLessThan(MAX_ACCOUNT_ID_LENGTH);
  });

  it('keeps a verifier NFT id within the token id limit for token ids up to a pack id long', () => {
    const tokenId = verifierNftTokenId(registryAccountId, longestPack);
    expect(tokenId.length).toBeLessThan(MAX_VERIFIER_TOKEN_ID_LENGTH);
  });
});
