import { Hono } from 'hono';

import type { DeskController } from '../controllers/desk-controller';
import type { FaucetController } from '../controllers/faucet-controller';
import type { HealthController } from '../controllers/health-controller';
import type { InstantController } from '../controllers/instant-controller';
import type { PackController } from '../controllers/pack-controller';
import type { MiddlewareHandler } from 'hono';

/** Per-route limits on top of the global read limit. */
export interface RouteLimits {
  readonly quote: MiddlewareHandler;
  readonly fill: MiddlewareHandler;
}

export function routes(
  packs: PackController,
  health: HealthController,
  desk: DeskController,
  faucet: FaucetController,
  instant: InstantController,
  limits: RouteLimits,
): Hono {
  return new Hono()
    .get('/health', health.live)
    .get('/ready', health.ready)
    .get('/packs', packs.list)
    .get('/packs/details', packs.details)
    .get('/packs/:id', packs.get)
    .get('/accounts/:id/positions', packs.positions)
    .get('/offers', packs.offers)
    .get('/desk', desk.overview)
    .get('/desk/decisions', desk.decisions)
    .get('/desk/ledger', desk.ledger)
    .get('/desk/quote', limits.quote, instant.quote)
    .post('/desk/instant-fill', limits.fill, instant.fill)
    .post('/faucet', faucet.claim);
}
