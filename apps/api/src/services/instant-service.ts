import { z } from 'zod';

import { MosaecError } from '@mosaec/domain';

import type { NetworkId } from '@mosaec/config/assets';

const units = z.string().regex(/^\d+$/);

/** An instant quote as the desk issues it; every amount is a base-10 string. */
export const instantQuoteSchema = z.object({
  network: z.string(),
  asset: z.enum(['ZEC', 'BTC', 'SOL']),
  amount: units,
  principal: units,
  repayment: units,
  termNs: units,
  expiresAtMs: z.number().int(),
  cardId: z.string(),
  quoteId: z.string(),
  aprBps: z.number().int(),
  ltvBps: z.number().int(),
  monthlyBps: z.number().int(),
});

export const quoteAnswerSchema = z.discriminatedUnion('available', [
  z.object({ available: z.literal(true), quote: instantQuoteSchema }),
  z.object({ available: z.literal(false), code: z.string(), reason: z.string() }),
]);

export const fillResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('filled'), txHash: z.string() }),
  z.object({
    status: z.enum(['refused', 'error']),
    code: z.string(),
    reason: z.string(),
    txHash: z.string().optional(),
  }),
]);

export type QuoteAnswer = z.output<typeof quoteAnswerSchema>;
export type FillResult = z.output<typeof fillResultSchema>;

export interface QuoteParams {
  readonly asset: 'ZEC' | 'BTC' | 'SOL';
  readonly amount: string;
  readonly term: string;
  readonly principal?: string | undefined;
  readonly borrower?: string | undefined;
}

export interface FillParams {
  readonly pack: string;
  readonly quoteId: string;
  readonly network: string;
  readonly asset: string;
  readonly amount: string;
  readonly principal: string;
  readonly repayment: string;
  readonly termNs: string;
  readonly expiresAtMs: number;
  readonly cardId: string;
}

/** The desk's loopback server, as the API reaches it. Throws `DESK_UNAVAILABLE` when it is down. */
export interface InstantDeskClient {
  quote(params: QuoteParams): Promise<QuoteAnswer>;
  fill(params: FillParams): Promise<FillResult>;
}

/**
 * The public face of instant desk loans. The desk serves one network; a request for another one
 * is answered as unavailable rather than priced against the wrong chain.
 */
export class InstantService {
  constructor(private readonly desk: InstantDeskClient | null) {}

  private client(): InstantDeskClient {
    if (this.desk === null) throw new MosaecError('DESK_UNAVAILABLE');
    return this.desk;
  }

  async quote(network: NetworkId, params: QuoteParams): Promise<QuoteAnswer> {
    const answer = await this.client().quote(params);
    if (answer.available && answer.quote.network !== network) {
      throw new MosaecError('DESK_UNAVAILABLE');
    }
    return answer;
  }

  async fill(network: NetworkId, params: FillParams): Promise<FillResult> {
    if (params.network !== network) throw new MosaecError('DESK_UNAVAILABLE');
    return this.client().fill(params);
  }
}
