import { z } from 'zod';

import { NETWORK_IDS } from '@mosaec/config/assets';
import { baseEnvSchema, parseEnv } from '@mosaec/config/env';

const deskEnvSchema = baseEnvSchema.extend({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  MOSAEC_NETWORK: z.enum(NETWORK_IDS),
  /** Full-access key of the desk account (holds only its budget). Absent: read-only dry run. */
  DESK_SECRET_KEY: z.string().startsWith('ed25519:').optional(),
  /** Bearer token that unlocks `fill_offer` on the MCP endpoint. */
  DESK_MCP_TOKEN: z.string().min(24).optional(),
  DESK_MCP_PORT: z.coerce.number().int().min(1).max(65_535).default(8790),
  DESK_INTERVAL_SECONDS: z.coerce.number().int().min(30).default(300),
  /** OpenAI-compatible endpoint of the model that decides, served on the desk's host. */
  LLM_BASE_URL: z.url(),
  LLM_MODEL: z.string().min(1),
  LLM_API_KEY: z.string().min(1).optional(),
});

export type DeskEnv = z.output<typeof deskEnvSchema>;

export function loadDeskEnv(source: NodeJS.ProcessEnv): DeskEnv {
  return parseEnv(deskEnvSchema, source);
}
