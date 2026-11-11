import { Hono } from 'hono';

import type { DeskController } from '../controllers/desk-controller';
import type { FaucetController } from '../controllers/faucet-controller';
import type { HealthController } from '../controllers/health-controller';
import type { PackController } from '../controllers/pack-controller';

export function routes(
  packs: PackController,
  health: HealthController,
  desk: DeskController,
  faucet: FaucetController,
): Hono {
  return new Hono()
    .get('/health', health.live)
    .get('/ready', health.ready)
    .get('/packs', packs.list)
    .get('/packs/:id', packs.get)
    .get('/accounts/:id/positions', packs.positions)
    .get('/offers', packs.offers)
    .get('/desk', desk.overview)
    .get('/desk/decisions', desk.decisions)
    .post('/faucet', faucet.claim);
}
