import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { NETWORKS } from '@mosaec/config/networks';
import { connect, migrateDatabase } from '@mosaec/db';
import { MosaecViews, NearRpc } from '@mosaec/sdk';

import { FastnearChainSource } from './chain';
import { loadIndexerEnv } from './env';
import { FastnearTxSource } from './fastnear';
import { Indexer, TXS_STREAM } from './indexer';
import { IndexerRepository } from './repository';

import type { Logger } from './indexer';

/** Request spacing with a FastNEAR subscription key. */
const KEYED_INTERVAL_MS = 20;

const log: Logger = {
  info: (message, fields) => {
    console.log(JSON.stringify({ level: 'info', message, ...fields }));
  },
  error: (message, fields) => {
    console.error(JSON.stringify({ level: 'error', message, ...fields }));
  },
};

async function main(): Promise<void> {
  const env = loadIndexerEnv(process.env);
  const { values } = parseArgs({ options: { from: { type: 'string' } } });
  const network = NETWORKS[env.MOSAEC_NETWORK];
  if (network.registryDeployHeight === null) {
    throw new Error(`${network.id} has no deployed registry to index`);
  }

  // The build copies the migrations next to the bundle; a source run uses the db package's own.
  const bundled = new URL('./migrations', import.meta.url).pathname;
  await migrateDatabase(env.DATABASE_URL, existsSync(bundled) ? bundled : undefined);
  const { db, close } = connect(env.DATABASE_URL);
  const repository = new IndexerRepository(db);
  if (values.from !== undefined) {
    await repository.rewind(network.id, TXS_STREAM, BigInt(values.from));
    log.info('backfill', { from: values.from });
  }

  const rpc = new NearRpc(env.NEAR_RPC_URL);
  const txs = new FastnearTxSource(
    network.txApiUrl,
    fetch,
    env.FASTNEAR_API_KEY === undefined
      ? {}
      : { apiKey: env.FASTNEAR_API_KEY, minIntervalMs: KEYED_INTERVAL_MS },
  );
  const indexer = new Indexer(
    {
      network: network.id,
      scope: { registry: network.registryAccountId, verifier: network.verifierAccountId },
      startHeight: network.registryDeployHeight,
      windowBlocks: env.INDEXER_WINDOW_BLOCKS,
      settleBlocks: env.INDEXER_SETTLE_BLOCKS,
      refreshLimit: 50,
    },
    new FastnearChainSource(rpc, txs),
    repository,
    new MosaecViews(network.id, rpc),
    log,
  );

  const controller = new AbortController();
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      controller.abort();
    });
  }
  log.info('indexer started', { network: network.id, registry: network.registryAccountId });
  await indexer.run(controller.signal, env.INDEXER_IDLE_MS);
  await close();
}

main().catch((error: unknown) => {
  log.error('indexer stopped', { error: String(error) });
  process.exit(1);
});
