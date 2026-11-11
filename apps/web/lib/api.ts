import { z } from 'zod';

import { NETWORK_IDS } from '@mosaec/config/assets';
import { PAWN_STATUSES } from '@mosaec/domain';

import type { NetworkId } from '@mosaec/config/assets';

const amountSchema = z.object({
  tokenId: z.string(),
  symbol: z.string().nullable(),
  decimals: z.number().int().nullable(),
  amount: z.string(),
});

export type Amount = z.output<typeof amountSchema>;

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
  rounds: z.number().int(),
  mintedHeight: z.string().nullable(),
  updatedHeight: z.string(),
});

export type Pack = z.output<typeof packSchema>;

const eventSchema = z.object({
  receiptId: z.string(),
  txHash: z.string().nullable(),
  height: z.string(),
  timestampNs: z.string().nullable(),
  standard: z.string(),
  event: z.string(),
  data: z.unknown(),
});

export type PackEvent = z.output<typeof eventSchema>;

const packListSchema = z.object({ items: z.array(packSchema), nextCursor: z.string().nullable() });
const packDetailSchema = packSchema.extend({ history: z.array(eventSchema) });
const positionsSchema = z.object({
  lending: z.array(packSchema),
  borrowing: z.array(packSchema),
  owned: z.array(packSchema),
});
const offersSchema = z.object({ items: z.array(packSchema) });

export type PackDetail = z.output<typeof packDetailSchema>;
export type Positions = z.output<typeof positionsSchema>;

export class ApiError extends Error {
  override readonly name = 'ApiError';
  constructor(
    message: string,
    readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** Server code calls the API directly; the browser goes through the `/api` rewrite. */
function baseUrl(): string {
  return typeof window === 'undefined'
    ? (process.env.MOSAEC_API_URL ?? 'https://api.mosaec.finance')
    : '/api';
}

const DEFAULT_REVALIDATE_SECONDS = 15;

async function getJson<T extends z.ZodType>(path: string, schema: T): Promise<z.output<T>> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, {
      next: { revalidate: DEFAULT_REVALIDATE_SECONDS },
    });
  } catch (cause) {
    throw new ApiError('The Mosaec API is unreachable.', undefined, { cause });
  }
  if (!response.ok) {
    throw new ApiError(`The Mosaec API answered ${response.status.toString()}.`, response.status);
  }
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiError('The Mosaec API returned an unexpected shape.', undefined, {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

function checkNetwork(network: NetworkId): void {
  if (!NETWORK_IDS.includes(network)) {
    throw new ApiError(`Unknown network ${network}.`);
  }
}

/** The first `limit` packs on `network` in mint order. */
export async function listPacks(network: NetworkId, limit: number): Promise<readonly Pack[]> {
  checkNetwork(network);
  const body = await getJson(`/packs?network=${network}&limit=${limit.toString()}`, packListSchema);
  return body.items;
}

/** One pack with its event history, or `null` when the indexer has no such pack. */
export async function getPack(network: NetworkId, packId: string): Promise<PackDetail | null> {
  checkNetwork(network);
  try {
    return await getJson(
      `/packs/${encodeURIComponent(packId)}?network=${network}`,
      packDetailSchema,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function listOffers(network: NetworkId, limit = 50): Promise<readonly Pack[]> {
  checkNetwork(network);
  return (await getJson(`/offers?network=${network}&limit=${limit.toString()}`, offersSchema))
    .items;
}

export async function getPositions(network: NetworkId, accountId: string): Promise<Positions> {
  checkNetwork(network);
  return getJson(
    `/accounts/${encodeURIComponent(accountId)}/positions?network=${network}`,
    positionsSchema,
  );
}
