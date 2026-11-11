import { z } from 'zod';

/**
 * Zod schemas for what the contracts return from views and emit as events. Amounts arrive as
 * decimal strings (`U128`) and nanosecond times as JSON numbers; both parse to `bigint`.
 */

const u128 = z
  .string()
  .regex(/^\d+$/, 'expected an unsigned integer string')
  .transform((value) => BigInt(value));

/** Nanosecond times and u64 counters. Large values must reach the schema as `bigint`. */
const ns = z
  .union([z.bigint().nonnegative(), z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
  .transform((value) => BigInt(value));

const accountId = z.string().min(2).max(64);

export const contentLineSchema = z.object({ token_id: z.string(), amount: u128 });
export const contentsSchema = z.array(contentLineSchema);

export const termsSchema = z.object({
  k_token: z.string(),
  k_amount: u128,
  term_ns: ns,
});

export const encumbranceSchema = z.object({
  k_token: z.string(),
  k_amount: u128,
  expires_at_ns: ns,
  contents: contentsSchema,
});

export const offerSchema = z.object({
  maker_id: accountId,
  terms: termsSchema,
  pay_token: z.string(),
  price: u128,
  open_until_ns: ns,
  contents: contentsSchema,
  contents_hash: z.string().regex(/^[0-9a-f]{64}$/),
});

export const payoutSchema = z.object({
  maker_id: accountId,
  token_id: z.string(),
  amount: u128,
  in_flight: z.boolean(),
});

export const stageSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('free') }),
  offerSchema.extend({ state: z.literal('offered') }),
  z.object({
    state: z.literal('written'),
    encumbrance: encumbranceSchema,
    ticket_id: z.string(),
    synced: z.boolean(),
  }),
]);

export const positionSchema = z.object({
  index: ns,
  title_id: z.string(),
  rounds: z.number().int().nonnegative(),
  stage: stageSchema,
  payout: payoutSchema.nullable(),
  command_in_flight: z.boolean(),
});

/** `position_of` on the registry. */
export const positionViewSchema = z.object({
  pack: accountId,
  position: positionSchema,
  title_owner: accountId.nullable(),
  ticket_owner: accountId.nullable(),
  title_pending: z.boolean(),
  ticket_pending: z.boolean(),
});

/** `config` on the registry. */
export const registryConfigSchema = z.object({
  guardian: accountId,
  pack_code_hash: z.string(),
  network: z.enum(['Mainnet', 'Testnet']),
  verifier: accountId,
  paused: z.boolean(),
  packs_created: ns,
  mint_deposit: u128,
});

export const phaseSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('free') }),
  z.object({
    state: z.literal('written'),
    encumbrance: encumbranceSchema,
    disrupted_at_ns: ns.nullable(),
  }),
  z.object({
    state: z.literal('releasing'),
    encumbrance: encumbranceSchema,
    owed_to: accountId,
  }),
]);

/** `status` on a pack. */
export const packStatusSchema = z.object({
  registry: accountId,
  verifier: accountId,
  phase: phaseSchema,
  delivery_in_flight: z.boolean(),
  exercise_in_flight: z.boolean(),
  exercise_deadline_ns: ns.nullable(),
});

/** Every `mosaec` NEP-297 event name, matching `MosaecEvent` in `events.rs`. */
export const EVENT_NAMES = [
  'pack_minted',
  'offer_created',
  'offer_cancelled',
  'filled',
  'refused',
  'payout_delivered',
  'encumbrance_synced',
  'exercise_decided',
  'contents_released',
  'nft_burned',
  'expired',
  'disruption_recorded',
  'withdrawn',
  'paused',
  'unpaused',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

/** NEP-297 envelope of a `mosaec` event; `data` is checked per event by the consumer. */
export const eventEnvelopeSchema = z.object({
  standard: z.literal('mosaec'),
  version: z.string(),
  event: z.enum(EVENT_NAMES),
  data: z.record(z.string(), z.unknown()),
});

export type ContentLine = z.output<typeof contentLineSchema>;
export type Terms = z.output<typeof termsSchema>;
export type Encumbrance = z.output<typeof encumbranceSchema>;
export type Offer = z.output<typeof offerSchema>;
export type Stage = z.output<typeof stageSchema>;
export type Position = z.output<typeof positionSchema>;
export type PositionView = z.output<typeof positionViewSchema>;
export type RegistryConfig = z.output<typeof registryConfigSchema>;
export type Phase = z.output<typeof phaseSchema>;
export type PackStatus = z.output<typeof packStatusSchema>;
export type EventEnvelope = z.output<typeof eventEnvelopeSchema>;

/**
 * `JSON.parse` that keeps every integer beyond the safe range exact as a `bigint`. Contracts send
 * nanosecond times (around 1.8e18) as JSON numbers, which plain `JSON.parse` rounds.
 */
export function parseContractJson(text: string): unknown {
  return JSON.parse(text, (_key, value: unknown, context?: { source?: string }) => {
    const source = context?.source;
    if (
      typeof value === 'number' &&
      !Number.isSafeInteger(value) &&
      source !== undefined &&
      /^\d+$/.test(source)
    ) {
      return BigInt(source);
    }
    return value;
  });
}

const EVENT_PREFIX = 'EVENT_JSON:';

/** Parses one receipt log line into a `mosaec` event, or `undefined` for any other log. */
export function parseEventLog(line: string): EventEnvelope | undefined {
  if (!line.startsWith(EVENT_PREFIX)) {
    return undefined;
  }
  let raw: unknown;
  try {
    raw = parseContractJson(line.slice(EVENT_PREFIX.length));
  } catch {
    return undefined;
  }
  const parsed = eventEnvelopeSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}
