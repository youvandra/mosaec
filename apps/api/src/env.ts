import { z } from 'zod';

import { baseEnvSchema, parseEnv } from '@mosaec/config/env';

const apiEnvSchema = baseEnvSchema.extend({
  API_PORT: z.coerce.number().int().min(1).max(65_535),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  ONECLICK_PARTNER_JWT: z.string().min(1).optional(),
  /** Key of `faucet.mosaec.testnet`, which holds only test tokens. Absent: no faucet. */
  FAUCET_SECRET_KEY: z.string().startsWith('ed25519:').optional(),
});

export type ApiEnv = z.output<typeof apiEnvSchema>;

export function loadApiEnv(source: NodeJS.ProcessEnv): ApiEnv {
  return parseEnv(apiEnvSchema, source);
}
