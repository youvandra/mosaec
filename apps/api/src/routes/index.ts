import { Hono } from 'hono';

import type { HealthController } from '../controllers/health-controller';
import type { PackController } from '../controllers/pack-controller';

export function routes(packs: PackController, health: HealthController): Hono {
  return new Hono()
    .get('/health', health.live)
    .get('/ready', health.ready)
    .get('/packs', packs.list)
    .get('/packs/:id', packs.get)
    .get('/accounts/:id/positions', packs.positions)
    .get('/offers', packs.offers);
}
