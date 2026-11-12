import { z } from 'zod';

import { accountIdSchema, networkQuery } from './schemas';

import type { InstantService } from '../services/instant-service';
import type { Context } from 'hono';

const units = z.string().regex(/^\d{1,39}$/, 'a base-10 integer string');
const asset = z.enum(['ZEC', 'BTC', 'SOL']);

const quoteQuery = networkQuery.extend({
  asset,
  amount: units,
  term: units,
  principal: units.optional(),
  borrower: accountIdSchema.optional(),
});

const fillBody = z.object({
  pack: accountIdSchema,
  quoteId: z.string().regex(/^[0-9a-f]{64}$/),
  network: z.string().max(16),
  asset,
  amount: units,
  principal: units,
  repayment: units,
  termNs: units,
  expiresAtMs: z.number().int().positive(),
  cardId: z.string().regex(/^\d{1,20}$/),
});

/** Parses instant desk loan requests and hands them to the desk. */
export class InstantController {
  constructor(private readonly instant: InstantService) {}

  quote = async (c: Context): Promise<Response> => {
    const { network, ...params } = quoteQuery.parse(c.req.query());
    return c.json(await this.instant.quote(network, params));
  };

  fill = async (c: Context): Promise<Response> => {
    const { network } = networkQuery.parse(c.req.query());
    const body = fillBody.parse(await c.req.json());
    return c.json(await this.instant.fill(network, body));
  };
}
