import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { DeskController } from './controllers/desk-controller';
import { FaucetController } from './controllers/faucet-controller';
import { HealthController } from './controllers/health-controller';
import { InstantController } from './controllers/instant-controller';
import { PackController } from './controllers/pack-controller';
import { errorHandler, notFound } from './middleware/errors';
import { rateLimit } from './middleware/rate-limit';
import { DeskRepository } from './repositories/desk-repository';
import { FaucetRepository } from './repositories/faucet-repository';
import { PackRepository } from './repositories/pack-repository';
import { routes } from './routes';
import { DeskService } from './services/desk-service';
import { FaucetService } from './services/faucet-service';
import { HealthService } from './services/health-service';
import { InstantService } from './services/instant-service';
import { PackService, systemClock } from './services/pack-service';

import type { DeskBalanceProbe } from './services/desk-service';
import type { FaucetSender } from './services/faucet-service';
import type { ChainProbe } from './services/health-service';
import type { InstantDeskClient } from './services/instant-service';
import type { Clock, LivePacks } from './services/pack-service';
import type { Db } from '@mosaec/db';

export interface AppDeps {
  readonly db: Db;
  readonly chain: ChainProbe & DeskBalanceProbe;
  readonly allowedOrigins: readonly string[];
  readonly readsPerMinute: number;
  /** Absent: the faucet answers 404. */
  readonly faucet?: FaucetSender | undefined;
  /** Absent: instant desk routes answer `DESK_UNAVAILABLE`. */
  readonly instantDesk?: InstantDeskClient | undefined;
  readonly clock?: Clock;
  /** Absent: pack pages read the read model only. */
  readonly livePacks?: LivePacks | undefined;
  readonly log?: (fields: Record<string, unknown>) => void;
}

/** Instant desk quotes per client address per minute. */
export const QUOTES_PER_MINUTE = 30;
/** Instant desk fills per client address per minute. */
export const INSTANT_FILLS_PER_MINUTE = 5;

/** Wires repositories, services and controllers into one Hono app. */
export function createApp(deps: AppDeps): Hono {
  const packRepository = new PackRepository(deps.db);
  const packs = new PackController(
    new PackService(packRepository, deps.clock ?? systemClock, deps.livePacks ?? null),
  );
  const health = new HealthController(new HealthService(packRepository, deps.chain));
  const desk = new DeskController(new DeskService(new DeskRepository(deps.db), deps.chain));
  const faucet = new FaucetController(
    new FaucetService(new FaucetRepository(deps.db), deps.faucet ?? null),
  );
  const instant = new InstantController(new InstantService(deps.instantDesk ?? null));
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
  app.route(
    '/',
    routes(packs, health, desk, faucet, instant, {
      quote: rateLimit(QUOTES_PER_MINUTE),
      fill: rateLimit(INSTANT_FILLS_PER_MINUTE),
    }),
  );
  app.onError(errorHandler(log));
  app.notFound(notFound);
  return app;
}
