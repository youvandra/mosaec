import { MosaecError } from '@mosaec/domain';

import { fillResultSchema, quoteAnswerSchema } from '../services/instant-service';

import type {
  FillParams,
  FillResult,
  InstantDeskClient,
  QuoteAnswer,
  QuoteParams,
} from '../services/instant-service';
import type { z } from 'zod';

/** A fill waits for the desk to sign and the chain to settle; past this the API gives up. */
export const DESK_TIMEOUT_MS = 20_000;

/** Calls the desk's loopback HTTP server; any transport failure or odd answer is `DESK_UNAVAILABLE`. */
export class HttpInstantDesk implements InstantDeskClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  quote(params: QuoteParams): Promise<QuoteAnswer> {
    const query = new URLSearchParams({
      asset: params.asset,
      amount: params.amount,
      term: params.term,
    });
    if (params.principal !== undefined) query.set('principal', params.principal);
    if (params.borrower !== undefined) query.set('borrower', params.borrower);
    return this.call(`/instant/quote?${query.toString()}`, { method: 'GET' }, quoteAnswerSchema);
  }

  fill(params: FillParams): Promise<FillResult> {
    return this.call(
      '/instant/fill',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(params),
      },
      fillResultSchema,
    );
  }

  private async call<T extends z.ZodType>(
    path: string,
    init: RequestInit,
    schema: T,
  ): Promise<z.output<T>> {
    let body: unknown;
    try {
      const response = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
        ...init,
        signal: AbortSignal.timeout(DESK_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`desk answered ${response.status.toString()}`);
      body = await response.json();
    } catch (cause) {
      throw new MosaecError('DESK_UNAVAILABLE', { cause });
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new MosaecError('DESK_UNAVAILABLE', { cause: parsed.error });
    return parsed.data;
  }
}
