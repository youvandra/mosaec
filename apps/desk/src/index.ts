import { existsSync } from 'node:fs';

import { DESK_ACCOUNTS, deskPolicy } from '@mosaec/config/desk';
import { connect, migrateDatabase } from '@mosaec/db';

import { runDesk } from './agent';
import { NearDeskChain } from './chain';
import { DeskService } from './desk-service';
import { loadDeskEnv } from './env';
import { serveMcp } from './mcp';
import { OpenAiCompatibleModel } from './model';
import { ReferencePrices } from './prices';
import { DeskRepository } from './repository';

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
  const prices = new ReferencePrices();
  const chain = new NearDeskChain(
    network,
    DESK_ACCOUNTS[network],
    env.NEAR_RPC_URL,
    env.DESK_SECRET_KEY,
  );
  const service = new DeskService(network, deskPolicy(network), chain, repository, prices);
  const model = new OpenAiCompatibleModel(env.LLM_BASE_URL, env.LLM_MODEL, env.LLM_API_KEY);

  serveMcp(service, env.DESK_MCP_PORT, env.DESK_MCP_TOKEN);
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
      const observed = await prices.current();
      /* Only a fresh read is a heartbeat; a cached or stale answer must not look live. */
      if (prices.fresh) await repository.savePrices(observed, 'coingecko');
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
  await tick();
  setInterval(() => void tick(), env.DESK_INTERVAL_SECONDS * 1_000);
}

void main();
