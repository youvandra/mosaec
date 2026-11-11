import { NETWORK_IDS } from '@mosaec/config/assets';
import { NETWORKS } from '@mosaec/config/networks';

import type { PackRepository } from '../repositories/pack-repository';
import type { NetworkId } from '@mosaec/config/assets';
import type { NetworkConfig } from '@mosaec/config/networks';

/** Indexer counts as live while its last step is this recent and this close to final. */
export const MAX_INDEXER_SILENCE_MS = 120_000;
export const MAX_INDEXER_LAG_BLOCKS = 150n;

/** Chain reads `/ready` needs. */
export interface ChainProbe {
  finalHeight(network: NetworkId): Promise<bigint>;
  registryPaused(network: NetworkId): Promise<boolean>;
}

export interface NetworkReadiness {
  readonly network: NetworkId;
  readonly ok: boolean;
  readonly indexedHeight: string | null;
  readonly finalHeight: string | null;
  readonly lagBlocks: string | null;
  readonly lastStepAgoMs: number | null;
  readonly registryPaused: boolean | null;
}

export class HealthService {
  constructor(
    private readonly packs: PackRepository,
    private readonly chain: ChainProbe,
    private readonly nowMs: () => number = Date.now,
  ) {}

  /** Readiness of every enabled network with a deployed registry. */
  async ready(): Promise<{ ok: boolean; networks: NetworkReadiness[] }> {
    const live = NETWORK_IDS.filter((id) => {
      const config: NetworkConfig = NETWORKS[id];
      return config.enabled && config.registryDeployHeight !== null;
    });
    const networks = await Promise.all(live.map((id) => this.network(id)));
    return { ok: networks.every((n) => n.ok), networks };
  }

  private async network(network: NetworkId): Promise<NetworkReadiness> {
    const checkpoint = await this.packs.checkpoint(network);
    const [final, paused] = await Promise.all([
      this.chain.finalHeight(network).catch(() => null),
      this.chain.registryPaused(network).catch(() => null),
    ]);
    const lag = checkpoint === undefined || final === null ? null : final - checkpoint.lastHeight;
    const ago = checkpoint === undefined ? null : this.nowMs() - checkpoint.updatedAt.getTime();
    const ok =
      lag !== null &&
      lag <= MAX_INDEXER_LAG_BLOCKS &&
      ago !== null &&
      ago <= MAX_INDEXER_SILENCE_MS;
    return {
      network,
      ok,
      indexedHeight: checkpoint?.lastHeight.toString() ?? null,
      finalHeight: final?.toString() ?? null,
      lagBlocks: lag?.toString() ?? null,
      lastStepAgoMs: ago,
      registryPaused: paused,
    };
  }
}
