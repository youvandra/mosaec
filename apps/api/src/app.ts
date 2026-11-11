import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { HealthController } from './controllers/health-controller';
import { PackController } from './controllers/pack-controller';
import { errorHandler, notFound } from './middleware/errors';
import { rateLimit } from './middleware/rate-limit';
import { PackRepository } from './repositories/pack-repository';
import { routes } from './routes';
import { HealthService } from './services/health-service';
import { PackService, systemClock } from './services/pack-service';

import type { ChainProbe } from './services/health-service';
import type { Clock } from './services/pack-service';
import type { Db } from '@mosaec/db';

export interface AppDeps {
  readonly db: Db;
  readonly chain: ChainProbe;
  readonly allowedOrigins: readonly string[];
  readonly readsPerMinute: number;
  readonly clock?: Clock;
  readonly log?: (fields: Record<string, unknown>) => void;
}

/** Wires repositories, services and controllers into one Hono app. */
export function createApp(deps: AppDeps): Hono {
  const packRepository = new PackRepository(deps.db);
  const packs = new PackController(new PackService(packRepository, deps.clock ?? systemClock));
  const health = new HealthController(new HealthService(packRepository, deps.chain));
  const log =
    deps.log ??
    ((fields) => {
      console.error(JSON.stringify({ level: 'error', ...fields }));
    });

  const app = new Hono();
  app.use(
    '*',
    cors({ origin: [...deps.allowedOrigins], allowMethods: ['GET', 'POST'], credentials: true }),
  );
  app.use('*', rateLimit(deps.readsPerMinute));
  app.route('/', routes(packs, health));
  app.onError(errorHandler(log));
  app.notFound(notFound);
  return app;
}
