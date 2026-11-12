import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';

import { DESK_ACCOUNTS, deskPolicy } from '@mosaec/config/desk';
import { connect, migrateDatabase } from '@mosaec/db';

import { runDesk } from './agent';
import { NearDeskChain } from './chain';
import { DeskService } from './desk-service';
import { loadDeskEnv } from './env';
import { InstantDesk } from './instant';
import { OpenAiCompatibleModel } from './model';
import { ReferencePrices } from './prices';
import { QuoteSigner } from './quote-token';
import { CARD_INTERVAL_MS, RateCards } from './rate-card';
import { DeskRepository } from './repository';
import { serveDesk } from './server';
import { RealisedVolatility } from './volatility';

function log(message: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ level: 'info', message, ...fields }));
}

async function main(): Promise<void> {
  const env = loadDeskEnv(process.env);
  const bundled = new URL('./migrations', import.meta.url).pathname;
  await migrateDatabase(env.DATABASE_URL, existsSync(bundled) ? bundled : undefined);
  const { db } = connect(env.DATABASE_URL);

  const network = env.MOSAEC_NETWORK;
  const repository = new DeskRepository(db);
  /* Each fresh read is the desk's heartbeat; a cached or stale answer must not look live. */
  const prices = new ReferencePrices(fetch, Date.now, (observed) =>
    repository.savePrices(observed, 'coingecko'),
  );
  const chain = new NearDeskChain(
    network,
    DESK_ACCOUNTS[network],
    env.NEAR_RPC_URL,
    env.DESK_SECRET_KEY,
  );
  const service = new DeskService(network, deskPolicy(network), chain, repository, prices);
  const model = new OpenAiCompatibleModel(env.LLM_BASE_URL, env.LLM_MODEL, env.LLM_API_KEY);
  const cards = new RateCards(service, repository, new RealisedVolatility(), model);
  const signer = new QuoteSigner(env.DESK_QUOTE_SECRET ?? randomBytes(32).toString('hex'));
  const instant = new InstantDesk(service, repository, cards, signer);

  serveDesk(service, instant, env.DESK_MCP_PORT, env.DESK_MCP_TOKEN);
  log('desk started', {
    network,
    account: DESK_ACCOUNTS[network],
    mode: env.DESK_SECRET_KEY === undefined ? 'read-only' : 'live',
    model: model.id,
    mcpPort: env.DESK_MCP_PORT,
  });

  let running = false;
  const tick = async () => {
    if (running || env.DESK_SECRET_KEY === undefined) return;
    running = true;
    try {
      await prices.current();
      const summary = await runDesk(service, model, log);
      log('desk run', { ...summary });
      for (const item of await service.collect()) {
        log('desk collect', { ...item, amount: item.amount.toString() });
      }
    } catch (cause) {
      console.error(
        JSON.stringify({ level: 'error', message: 'desk run failed', cause: String(cause) }),
      );
    } finally {
      running = false;
    }
  };
  const setCards = async () => {
    try {
      for (const card of await cards.refresh()) {
        log('desk rate card', {
          asset: card.asset,
          monthlyBps: card.monthlyBps,
          maxLtvBps: card.maxLtvBps,
          source: card.source,
          reason: card.reason,
        });
      }
    } catch (cause) {
      console.error(
        JSON.stringify({ level: 'error', message: 'rate card failed', cause: String(cause) }),
      );
    }
  };
  /* A model on the desk's CPU takes minutes per card; the loop does not wait for it. */
  void setCards();
  setInterval(() => void setCards(), CARD_INTERVAL_MS);

  await tick();
  setInterval(() => void tick(), env.DESK_INTERVAL_SECONDS * 1_000);
}

void main();
