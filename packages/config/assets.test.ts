import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ASSETS, assetByTokenId, assetsWithRole } from './assets';
import {
  DEFAULT_NETWORK,
  DEFAULT_TERM_NS,
  GRACE_NS,
  MAX_TERM_NS,
  MIN_TERM_NS,
  NETWORKS,
  TESTNET_MIN_TERM_NS,
} from './networks';

import type { Asset } from './assets';

const CONSTANTS_RS = readFileSync(
  join(import.meta.dirname, '../../contracts/shared/src/constants.rs'),
  'utf8',
);

/** `pub const NAME: &str = "value";` pairs from the Rust source. */
function stringConstants(source: string): Map<string, string> {
  const found = source.matchAll(/pub const (\w+): &str =\s*"([^"]+)";/g);
  return new Map([...found].map(([, name, value]) => [name ?? '', value ?? '']));
}

/** Evaluates a `u64` constant written as a product of literals and earlier constants. */
function nsConstant(source: string, name: string): bigint {
  const match = new RegExp(`pub const ${name}: u64 = ([^;]+);`).exec(source);
  if (match?.[1] === undefined) {
    throw new Error(`${name} not found in constants.rs`);
  }
  return match[1]
    .split('*')
    .map((factor) => factor.trim())
    .reduce((product, factor) => {
      const value = /^[\d_]+$/.test(factor)
        ? BigInt(factor.replaceAll('_', ''))
        : nsConstant(source, factor);
      return product * value;
    }, 1n);
}

interface RustTokenRule {
  readonly mainnetId: string;
  readonly testnetId: string;
  readonly decimals: number;
  readonly role: string;
  readonly cap: bigint;
}

function tokenRules(source: string): RustTokenRule[] {
  const strings = stringConstants(source);
  const resolve = (name: string): string => {
    const value = strings.get(name);
    if (value === undefined) {
      throw new Error(`string constant ${name} not found`);
    }
    return value;
  };
  const blocks = source.matchAll(
    /TokenRule \{\s*mainnet_id: (\w+),\s*testnet_id: (\w+),\s*decimals: (\d+),\s*role: TokenRole::(\w+),\s*cap: ([\d_]+),/g,
  );
  return [...blocks].map(([, mainnet, testnet, decimals, role, cap]) => ({
    mainnetId: resolve(mainnet ?? ''),
    testnetId: resolve(testnet ?? ''),
    decimals: Number(decimals),
    role: (role ?? '').toLowerCase(),
    cap: BigInt((cap ?? '').replaceAll('_', '')),
  }));
}

describe('asset allowlist matches TOKEN_RULES in constants.rs', () => {
  const rules = tokenRules(CONSTANTS_RS);
  const assets = Object.values<Asset>(ASSETS);

  it('has one entry per Rust rule', () => {
    expect(rules).toHaveLength(assets.length);
  });

  it.each(assets.map((asset) => [asset.symbol, asset] as const))(
    '%s has the same ids, decimals, role and cap',
    (_symbol, asset) => {
      const rule = rules.find((r) => r.mainnetId === asset.tokenIds.mainnet);
      expect(rule).toEqual({
        mainnetId: asset.tokenIds.mainnet,
        testnetId: asset.tokenIds.testnet,
        decimals: asset.decimals,
        role: asset.role,
        cap: asset.capPerPack,
      });
    },
  );
});

describe('term constants match constants.rs', () => {
  it.each([
    ['MIN_TERM_NS', MIN_TERM_NS],
    ['MAX_TERM_NS', MAX_TERM_NS],
    ['TESTNET_MIN_TERM_NS', TESTNET_MIN_TERM_NS],
    ['DEFAULT_TERM_NS', DEFAULT_TERM_NS],
    ['GRACE_NS', GRACE_NS],
  ] as const)('%s', (name, value) => {
    expect(nsConstant(CONSTANTS_RS, name)).toBe(value);
  });

  it('the mainnet verifier matches VERIFIER_ID', () => {
    expect(stringConstants(CONSTANTS_RS).get('VERIFIER_ID')).toBe(
      NETWORKS.mainnet.verifierAccountId,
    );
  });
});

describe('networks', () => {
  it('opens on testnet while mainnet is disabled', () => {
    expect(NETWORKS.mainnet.enabled).toBe(false);
    expect(DEFAULT_NETWORK).toBe('testnet');
  });

  it.each(Object.values(NETWORKS))('$id keeps every account under its root', (network) => {
    for (const account of [network.registryAccountId, network.verifierAccountId]) {
      if (account !== 'intents.near') {
        expect(account.endsWith(`.${network.rootAccountId}`)).toBe(true);
      }
    }
  });

  it.each(Object.values(NETWORKS))('$id offers only allowlisted assets', (network) => {
    for (const symbol of network.assets) {
      expect(assetByTokenId(network.id, ASSETS[symbol].tokenIds[network.id])?.symbol).toBe(symbol);
    }
  });
});

describe('asset lookups', () => {
  it('finds an asset by its testnet token id', () => {
    expect(assetByTokenId('testnet', 'nep141:zec.mosaec.testnet')?.symbol).toBe('ZEC');
  });

  it('refuses a token id from the other network', () => {
    expect(assetByTokenId('mainnet', 'nep141:zec.mosaec.testnet')).toBeUndefined();
  });

  it('lists USDC as the only settlement asset', () => {
    expect(assetsWithRole('settlement').map((a) => a.symbol)).toEqual(['USDC']);
  });
});
