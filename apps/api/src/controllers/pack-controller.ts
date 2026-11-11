import {
  accountIdSchema,
  detailsQuery,
  listPacksQuery,
  networkQuery,
  offersQuery,
} from './schemas';

import type { PackService } from '../services/pack-service';
import type { Context } from 'hono';

/** Parses requests, calls the pack service, returns JSON. No business rules live here. */
export class PackController {
  constructor(private readonly packs: PackService) {}

  list = async (c: Context): Promise<Response> => {
    const q = listPacksQuery.parse(c.req.query());
    return c.json(
      await this.packs.list({
        network: q.network,
        limit: q.limit,
        ...(q.state === undefined ? {} : { state: q.state }),
        ...(q.owner === undefined ? {} : { owner: q.owner }),
        ...(q.cursor === undefined ? {} : { cursor: q.cursor }),
      }),
    );
  };

  get = async (c: Context): Promise<Response> => {
    const { network } = networkQuery.parse(c.req.query());
    const packId = accountIdSchema.parse(c.req.param('id'));
    return c.json(await this.packs.get(network, packId));
  };

  details = async (c: Context): Promise<Response> => {
    const q = detailsQuery.parse(c.req.query());
    return c.json({ items: await this.packs.details(q.network, q.ids) });
  };

  positions = async (c: Context): Promise<Response> => {
    const { network } = networkQuery.parse(c.req.query());
    const accountId = accountIdSchema.parse(c.req.param('id'));
    return c.json(await this.packs.positions(network, accountId));
  };

  offers = async (c: Context): Promise<Response> => {
    const q = offersQuery.parse(c.req.query());
    return c.json({ items: await this.packs.openOffers(q.network, q.limit) });
  };
}
