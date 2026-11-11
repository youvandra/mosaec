import { z } from 'zod';

import { NETWORK_IDS } from '@mosaec/config/assets';
import { PAWN_STATUSES } from '@mosaec/domain';

import { SITE } from './site';

import type { NetworkId } from '@mosaec/config/assets';

const amountSchema = z.object({
  tokenId: z.string(),
  symbol: z.string().nullable(),
  decimals: z.number().int().nullable(),
  amount: z.string(),
});

export const packSchema = z.object({
  id: z.string(),
  index: z.string(),
  state: z.enum(['free', 'offered', 'written']),
  status: z.enum(PAWN_STATUSES).nullable(),
  title: z.object({ id: z.string(), owner: z.string().nullable() }),
  ticket: z.object({ id: z.string(), owner: z.string().nullable() }).nullable(),
  contents: z.array(amountSchema),
  contentsHash: z.string().nullable(),
  offer: z
    .object({
      maker: z.string().nullable(),
      price: amountSchema,
      expiresAtNs: z.string().nullable(),
    })
    .nullable(),
  terms: z
    .object({
      repayment: amountSchema,
      termNs: z.string().nullable(),
      expiresAtNs: z.string().nullable(),
      deadlineNs: z.string().nullable(),
      disruptedAtNs: z.string().nullable(),
    })
    .nullable(),
  mintedHeight: z.string().nullable(),
  updatedHeight: z.string(),
});

export type Pack = z.output<typeof packSchema>;

const packListSchema = z.object({ items: z.array(packSchema), nextCursor: z.string().nullable() });

export class ApiError extends Error {
  override readonly name = 'ApiError';
}

async function getJson(path: string, revalidateSeconds: number): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${SITE.apiUrl}${path}`, { next: { revalidate: revalidateSeconds } });
  } catch (cause) {
    throw new ApiError('API unreachable', { cause });
  }
  if (!response.ok) {
    throw new ApiError(`API answered ${response.status.toString()}`);
  }
  return response.json();
}

/** The first `limit` packs on `network` in mint order. */
export async function listPacks(
  network: NetworkId,
  limit: number,
  revalidateSeconds = 30,
): Promise<readonly Pack[]> {
  if (!NETWORK_IDS.includes(network)) {
    throw new ApiError(`unknown network ${network}`);
  }
  const body = await getJson(
    `/packs?network=${network}&limit=${limit.toString()}`,
    revalidateSeconds,
  );
  const parsed = packListSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError('API returned an unexpected shape', { cause: parsed.error });
  }
  return parsed.data.items;
}
