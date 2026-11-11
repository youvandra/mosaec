import { z } from 'zod';

import { clientIp } from '../middleware/rate-limit';

import { accountIdSchema, networkQuery } from './schemas';

import type { FaucetService } from '../services/faucet-service';
import type { Context } from 'hono';

const claimBody = z.object({ accountId: accountIdSchema });

export class FaucetController {
  constructor(private readonly faucet: FaucetService) {}

  claim = async (c: Context): Promise<Response> => {
    const { network } = networkQuery.parse(c.req.query());
    const { accountId } = claimBody.parse(await c.req.json());
    const address = clientIp(c.req.header('x-forwarded-for'));
    return c.json(await this.faucet.claim(network, accountId, address));
  };
}
