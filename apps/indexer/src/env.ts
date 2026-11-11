import { z } from 'zod';

import { NETWORK_IDS } from '@mosaec/config/assets';
import { baseEnvSchema, parseEnv } from '@mosaec/config/env';

const indexerEnvSchema = baseEnvSchema.extend({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  MOSAEC_NETWORK: z.enum(NETWORK_IDS),
  INDEXER_WINDOW_BLOCKS: z.coerce.bigint().min(1n).default(5_000n),
  INDEXER_SETTLE_BLOCKS: z.coerce.bigint().min(0n).default(20n),
  FASTNEAR_API_KEY: z.string().min(1).optional(),
  INDEXER_IDLE_MS: z.coerce.number().int().min(100).default(2_000),
});

export type IndexerEnv = z.output<typeof indexerEnvSchema>;

export function loadIndexerEnv(source: NodeJS.ProcessEnv): IndexerEnv {
  return parseEnv(indexerEnvSchema, source);
}
