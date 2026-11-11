import { extractBlock } from './extract';
import { packRow } from './refresh';

import type { BlockRecords, ChainBlock, Scope } from './extract';
import type { AccountTx } from './fastnear';
import type { PackReader } from './refresh';
import type { IndexerRepository } from './repository';

/** Where the indexer reads chain data; `FastnearTxSource` plus RPC in production. */
export interface ChainSource {
  finalHeight(): Promise<bigint>;
  accountTxs(accountId: string, after: bigint, upTo: bigint): Promise<AccountTx[]>;
  blocksOf(hashes: readonly string[]): Promise<ChainBlock[]>;
}

export interface Logger {
  info(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export interface IndexerOptions {
  readonly network: string;
  readonly scope: Scope;
  /** First height to read when no checkpoint exists (the registry deploy block). */
  readonly startHeight: bigint;
  /** Most heights one step covers. */
  readonly windowBlocks: bigint;
  /** Heights kept behind final so every transaction in the window has finished its receipts. */
  readonly settleBlocks: bigint;
  /** Packs refreshed from the chain per step. */
  readonly refreshLimit: number;
}

/** Checkpoint stream name for the transaction walk. */
export const TXS_STREAM = 'txs';

/**
 * Each step reads a window of heights: every transaction that touched the registry or one of its
 * packs, with all its receipts, stored block by block; then the checkpoint moves to the window's
 * end. A crash before that leaves the checkpoint where it was and the window is read again; every
 * write is idempotent. Packs with events newer than their last refresh are then re-read from the
 * chain, so pack rows always match the contracts' own views.
 */
export class Indexer {
  constructor(
    private readonly options: IndexerOptions,
    private readonly source: ChainSource,
    private readonly repository: IndexerRepository,
    private readonly reader: PackReader,
    private readonly log: Logger,
  ) {}

  /** Processes one window and pending refreshes. Returns the number of heights covered. */
  async step(): Promise<bigint> {
    const { network, scope, windowBlocks, settleBlocks } = this.options;
    const checkpoint = await this.repository.checkpoint(network, TXS_STREAM);
    const after = checkpoint?.lastHeight ?? this.options.startHeight - 1n;
    const settled = (await this.source.finalHeight()) - settleBlocks;
    const upTo = settled < after + windowBlocks ? settled : after + windowBlocks;

    if (upTo > after) {
      const blocks = await this.readWindow(after, upTo);
      let events = 0;
      for (const block of blocks) {
        const records = extractBlock(block, scope);
        await this.repository.applyEvents(network, records);
        events += records.events.length;
      }
      const lastTimestamp = blocks.at(-1)?.timestampNs ?? checkpoint?.lastBlockTimestampNs ?? '0';
      await this.repository.setCheckpoint(network, TXS_STREAM, upTo, lastTimestamp);
      if (events > 0) {
        this.log.info('window', { from: (after + 1n).toString(), to: upTo.toString(), events });
      }
    }
    await this.refreshPacks();
    return upTo > after ? upTo - after : 0n;
  }

  /** Runs `step` until `signal` aborts, pausing `idleMs` whenever it is caught up. */
  async run(signal: AbortSignal, idleMs: number): Promise<void> {
    while (!signal.aborted) {
      try {
        const covered = await this.step();
        if (covered < this.options.windowBlocks) {
          await sleep(idleMs, signal);
        }
      } catch (error) {
        this.log.error('step failed', { error: String(error) });
        await sleep(idleMs * 5, signal);
      }
    }
  }

  /**
   * Blocks of every transaction in `(after, upTo]` touching the registry or a pack. Packs minted
   * inside the window are read too, until no new pack appears.
   */
  private async readWindow(after: bigint, upTo: bigint): Promise<ChainBlock[]> {
    const { network, scope } = this.options;
    const accounts = [scope.registry, ...(await this.repository.knownPacks(network))];
    const read = new Set<string>();
    const hashes = new Set<string>();
    let blocks: ChainBlock[] = [];

    while (accounts.some((a) => !read.has(a))) {
      for (const account of accounts.filter((a) => !read.has(a))) {
        read.add(account);
        for (const tx of await this.source.accountTxs(account, after, upTo)) {
          hashes.add(tx.hash);
        }
      }
      blocks = hashes.size === 0 ? [] : await this.source.blocksOf([...hashes]);
      for (const pack of mintedPacks(blocks.map((b) => extractBlock(b, scope)))) {
        if (!accounts.includes(pack)) {
          accounts.push(pack);
        }
      }
    }
    return blocks;
  }

  private async refreshPacks(): Promise<void> {
    const { network, refreshLimit } = this.options;
    const due = await this.repository.packsToRefresh(network, refreshLimit);
    for (const { packId, height } of due) {
      const view = await this.reader.positionOf(packId);
      if (view === undefined) {
        this.log.error('pack missing from registry', { packId });
        continue;
      }
      const status = await this.reader.packStatus(packId);
      await this.repository.upsertPack(
        packRow(network, view, status, {
          refreshedHeight: height,
          lastOutcome: await this.repository.lastOutcome(network, packId),
          mintedHeight: await this.repository.mintedHeight(network, packId),
        }),
      );
    }
  }
}

function mintedPacks(records: readonly BlockRecords[]): string[] {
  return records.flatMap((r) =>
    r.events.flatMap((e) => (e.event === 'pack_minted' && e.packId !== null ? [e.packId] : [])),
  );
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
