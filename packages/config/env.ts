import { z } from 'zod';

export const MOSAEC_ENVS = ['local', 'staging', 'production'] as const;

export type MosaecEnv = (typeof MOSAEC_ENVS)[number];

/**
 * Hosts fixed per environment. Chain values live in `networks.ts`; host-specific values and secrets
 * come from the process environment.
 */
export interface Deployment {
  readonly webBaseUrl: string;
  readonly apiBaseUrl: string;
}

export const DEPLOYMENTS = {
  local: {
    webBaseUrl: 'http://localhost:3000',
    apiBaseUrl: 'http://localhost:8787',
  },
  staging: {
    webBaseUrl: 'https://staging.mosaec.finance',
    apiBaseUrl: 'https://api-staging.mosaec.finance',
  },
  production: {
    webBaseUrl: 'https://app.mosaec.finance',
    apiBaseUrl: 'https://api.mosaec.finance',
  },
} as const satisfies Record<MosaecEnv, Deployment>;

/** Longest valid NEAR account id. */
export const MAX_ACCOUNT_ID_LENGTH = 64;

/** Longest token id the vendored verifier accepts (`MAX_TOKEN_ID_LEN` in `defuse-core`). */
export const MAX_VERIFIER_TOKEN_ID_LENGTH = 127;

/** Packs are sub-accounts of the registry named by a u64 index. */
export function packAccountId(registryAccountId: string, index: bigint): string {
  return `${index.toString()}.${registryAccountId}`;
}

/** Id under which the verifier tracks an NFT deposited from `contractId`. */
export function verifierNftTokenId(contractId: string, tokenId: string): string {
  return `nep171:${contractId}:${tokenId}`;
}

/** Variables every service reads. Services extend this schema with their own. */
export const baseEnvSchema = z.object({
  MOSAEC_ENV: z.enum(MOSAEC_ENVS),
  NEAR_RPC_URL: z.url(),
});

export class EnvError extends Error {
  override readonly name = 'EnvError';
}

/** Parses `source` against `schema`, throwing an `EnvError` that names every invalid variable. */
export function parseEnv<TSchema extends z.ZodType>(
  schema: TSchema,
  source: Readonly<Record<string, string | undefined>>,
): z.output<TSchema> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new EnvError(`Invalid environment\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
