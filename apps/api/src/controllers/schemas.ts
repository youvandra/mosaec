import { z } from 'zod';

import { NETWORK_IDS } from '@mosaec/config/assets';
import { DEFAULT_NETWORK } from '@mosaec/config/networks';

/** NEAR account ids: 2 to 64 lowercase characters in dot-separated parts. */
export const accountIdSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/, 'not a NEAR account id');

export const networkQuery = z.object({ network: z.enum(NETWORK_IDS).default(DEFAULT_NETWORK) });

export const listPacksQuery = networkQuery.extend({
  state: z.enum(['free', 'offered', 'written']).optional(),
  owner: accountIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().regex(/^\d+$/).optional(),
});

export const offersQuery = networkQuery.extend({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
