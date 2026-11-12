import { serve } from '@hono/node-server';

import { DEPLOYMENTS } from '@mosaec/config/env';
import { NETWORKS } from '@mosaec/config/networks';
import { connect } from '@mosaec/db';
import { MosaecViews, NearRpc } from '@mosaec/sdk';

import { createApp } from './app';
import { loadApiEnv } from './env';
import { HttpInstantDesk } from './lib/desk-client';
import { NearFaucetSender } from './lib/faucet-sender';

import type { DeskBalanceProbe } from './services/desk-service';
import type { ChainProbe } from './services/health-service';
import type { NetworkId } from '@mosaec/config/assets';

/** Reads per client address per minute. */
const READS_PER_MINUTE = 60;

const env = loadApiEnv(process.env);
const { db } = connect(env.DATABASE_URL);

const rpcFor = (network: NetworkId): NearRpc => new NearRpc(NETWORKS[network].rpcUrl);
const chain: ChainProbe & DeskBalanceProbe = {
  finalHeight: async (network) => {
    const block = (await rpcFor(network).request('block', { finality: 'final' })) as {
      header: { height: number | bigint };
    };
    return BigInt(block.header.height);
  },
  registryPaused: async (network) =>
    (await new MosaecViews(network, rpcFor(network)).config()).paused,
  balanceOf: (network, accountId, tokenId) =>
    new MosaecViews(network, rpcFor(network)).balanceOf(accountId, tokenId),
};

serve({
  fetch: createApp({
    db,
    chain,
    allowedOrigins: [DEPLOYMENTS[env.MOSAEC_ENV].webBaseUrl],
    readsPerMinute: READS_PER_MINUTE,
    faucet:
      env.FAUCET_SECRET_KEY === undefined
        ? undefined
        : new NearFaucetSender('faucet.mosaec.testnet', env.FAUCET_SECRET_KEY),
    instantDesk: new HttpInstantDesk(env.DESK_URL),
    livePacks: (network) => new MosaecViews(network, rpcFor(network)),
  }).fetch,
  port: env.API_PORT,
});
