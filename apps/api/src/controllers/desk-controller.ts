import { z } from 'zod';

import { networkQuery } from './schemas';

import type { DeskService } from '../services/desk-service';
import type { Context } from 'hono';

const decisionsQuery = networkQuery.extend({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** Parses requests and returns the desk's public view. */
export class DeskController {
  constructor(private readonly desk: DeskService) {}

  overview = async (c: Context): Promise<Response> => {
    const { network } = networkQuery.parse(c.req.query());
    return c.json(await this.desk.overview(network));
  };

  decisions = async (c: Context): Promise<Response> => {
    const q = decisionsQuery.parse(c.req.query());
    return c.json({ items: await this.desk.decisions(q.network, q.limit) });
  };
}
