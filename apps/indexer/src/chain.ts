import type { ChainBlock } from './extract';
import type { AccountTx, FastnearTxSource } from './fastnear';
import type { ChainSource } from './indexer';
import type { NearRpc } from '@mosaec/sdk';

/** Final height from NEAR RPC, history from the FastNEAR transactions API. */
export class FastnearChainSource implements ChainSource {
  constructor(
    private readonly rpc: NearRpc,
    private readonly txs: FastnearTxSource,
  ) {}

  async finalHeight(): Promise<bigint> {
    const block = (await this.rpc.request('block', { finality: 'final' })) as {
      header: { height: number | bigint };
    };
    return BigInt(block.header.height);
  }

  accountTxs(accountId: string, after: bigint, upTo: bigint): Promise<AccountTx[]> {
    return this.txs.accountTxs(accountId, after, upTo);
  }

  blocksOf(hashes: readonly string[]): Promise<ChainBlock[]> {
    return this.txs.blocksOf(hashes);
  }
}
