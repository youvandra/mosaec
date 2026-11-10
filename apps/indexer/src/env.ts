import { z } from 'zod';

import { baseEnvSchema, parseEnv } from '@mosaec/config/env';

const indexerEnvSchema = baseEnvSchema.extend({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

export type IndexerEnv = z.output<typeof indexerEnvSchema>;

export function loadIndexerEnv(source: NodeJS.ProcessEnv): IndexerEnv {
  return parseEnv(indexerEnvSchema, source);
}
