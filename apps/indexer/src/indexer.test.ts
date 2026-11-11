import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { count, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { schema } from '@mosaec/db';
import { createTestDb } from '@mosaec/db/testing';
import { packStatusSchema, parseContractJson, positionViewSchema } from '@mosaec/domain';

import { extractBlock, packOfToken } from './extract';
import { FastnearTxSource } from './fastnear';
import { Indexer, TXS_STREAM } from './indexer';
import { IndexerRepository } from './repository';

import type { FetchLike } from './fastnear';
import type { ChainSource, Logger } from './indexer';
import type { PackReader } from './refresh';
import type { Db } from '@mosaec/db';

const SCOPE = { registry: 'v0.mosaec.testnet', verifier: 'intents.mosaec.testnet' };
const PACK = '0.v0.mosaec.testnet';
const DEPLOY = 277_143_566n;
const FILL_TX = '736EkCegUbijUnR6CvSDciXewiyFhsxCPSeuPTtQuMEQ';

function fixtureText(name: string): string {
  return readFileSync(join(import.meta.dirname, 'test', name), 'utf8');
}

interface AccountTxRow {
  transaction_hash: string;
  tx_block_height: number;
}

interface TxRow {
  transaction: { hash: string };
}

/** Real FastNEAR responses for `v0.mosaec.testnet` and its first five transactions. */
const ACCOUNT = JSON.parse(fixtureText('account-registry.json')) as { account_txs: AccountTxRow[] };
const TRANSACTIONS_TEXT = fixtureText('transactions.json');

/** Serves the fixtures the way the API does: `pageSize` rows a page, newest first. */
function fakeApi(pageSize: number): FetchLike {
  const handler = (input: string, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as {
      account_id?: string;
      max_block_height?: number;
      tx_hashes?: string[];
    };
    if (input.endsWith('/v0/account')) {
      const max = body.max_block_height ?? Number.MAX_SAFE_INTEGER;
      const rows =
        body.account_id === SCOPE.registry
          ? ACCOUNT.account_txs.filter((t) => t.tx_block_height <= max)
          : [];
      return Promise.resolve(Response.json({ account_txs: rows.slice(0, pageSize) }));
    }
    const wanted = new Set(body.tx_hashes);
    // Keep the raw text so nanosecond timestamps reach the parser exactly as the API sends them.
    const all = parseContractJson(TRANSACTIONS_TEXT) as { transactions: TxRow[] };
    const picked = all.transactions.filter((t) => wanted.has(t.transaction.hash));
    const json = JSON.stringify({ transactions: picked }, (_k, v: unknown) =>
      typeof v === 'bigint' ? `__big__${v.toString()}` : v,
    ).replace(/"__big__(\d+)"/g, '$1');
    return Promise.resolve(new Response(json));
  };
  return handler;
}

const quiet: Logger = { info: () => undefined, error: () => undefined };

const POSITION = positionViewSchema.parse(
  parseContractJson(
    '{"pack":"0.v0.mosaec.testnet","position":{"index":0,"title_id":"t0","rounds":1,"stage":{"state":"written","encumbrance":{"k_token":"nep141:usdc.mosaec.testnet","k_amount":"107500000","expires_at_ns":1794360365888920934,"contents":[{"token_id":"nep141:zec.mosaec.testnet","amount":"50000000"}]},"ticket_id":"k0.1","synced":true},"payout":null,"command_in_flight":false},"title_owner":"lender.mosaec.testnet","ticket_owner":"borrower.mosaec.testnet","title_pending":false,"ticket_pending":false}',
  ),
);
const STATUS = packStatusSchema.parse(
  parseContractJson(
    '{"registry":"v0.mosaec.testnet","verifier":"intents.mosaec.testnet","phase":{"state":"written","encumbrance":{"k_token":"nep141:usdc.mosaec.testnet","k_amount":"107500000","expires_at_ns":1794360365888920934,"contents":[{"token_id":"nep141:zec.mosaec.testnet","amount":"50000000"}]},"disrupted_at_ns":null},"delivery_in_flight":false,"exercise_in_flight":false,"exercise_deadline_ns":1794360365888920934}',
  ),
);
const reader: PackReader = {
  positionOf: () => Promise.resolve(POSITION),
  packStatus: () => Promise.resolve(STATUS),
};

function txSource(pageSize = 50): FastnearTxSource {
  return new FastnearTxSource('https://tx.test', fakeApi(pageSize), { minIntervalMs: 0 });
}

/** Final height chosen so the settled window ends right after the fill. */
function chain(source: FastnearTxSource, final = 277_146_160n): ChainSource {
  return {
    finalHeight: () => Promise.resolve(final),
    accountTxs: (a, after, upTo) => source.accountTxs(a, after, upTo),
    blocksOf: (h) => source.blocksOf(h),
  };
}

describe('FastnearTxSource', () => {
  it('pages back through an account and keeps only the asked range, oldest first', async () => {
    const txs = await txSource(4).accountTxs(SCOPE.registry, 277_146_000n, 277_146_140n);
    expect(txs.map((t) => t.hash.slice(0, 8))).toEqual(['6mHMTSrp', 'FVyj96yw', '736EkCeg']);
  });

  it('groups receipts into blocks with exact timestamps', async () => {
    const blocks = await txSource().blocksOf([FILL_TX]);
    expect(blocks.map((b) => b.height)).toEqual([
      277146129n,
      277146130n,
      277146131n,
      277146132n,
      277146133n,
      277146134n,
      277146135n,
    ]);
    expect(blocks[0]?.timestampNs).toMatch(/^17943597\d{11}$/);
  });

  it('backs off on 429 and succeeds after', async () => {
    let calls = 0;
    const flaky = (): Promise<Response> => {
      calls += 1;
      return Promise.resolve(
        calls < 3 ? new Response('slow down', { status: 429 }) : Response.json({ account_txs: [] }),
      );
    };
    const source = new FastnearTxSource('https://x', flaky, { minIntervalMs: 0, backoffMs: 1 });
    await expect(source.accountTxs('a', 0n, 10n)).resolves.toEqual([]);
    expect(calls).toBe(3);
  });

  it('reads the fill: Mosaec events and the Title and Ticket moves', async () => {
    const blocks = await txSource().blocksOf([FILL_TX]);
    const events = blocks.flatMap((b) => extractBlock(b, SCOPE).events);
    expect(events.map((e) => `${e.standard}:${e.event}`)).toEqual([
      'nep171:nft_mint',
      'nep171:nft_transfer',
      'mosaec:filled',
      'mosaec:encumbrance_synced',
      'mosaec:payout_delivered',
    ]);
    expect(events.every((e) => e.packId === PACK)).toBe(true);
  });

  it('maps Title and Ticket ids to their pack', () => {
    expect(packOfToken('t7', SCOPE.registry)).toBe('7.v0.mosaec.testnet');
    expect(packOfToken('k7.2', SCOPE.registry)).toBe('7.v0.mosaec.testnet');
    expect(packOfToken('x', SCOPE.registry)).toBeNull();
  });
});

describe('Indexer on the testnet history', () => {
  let db: Db;
  let close: () => Promise<void>;
  let repository: IndexerRepository;

  const options = {
    network: 'testnet',
    scope: SCOPE,
    startHeight: DEPLOY,
    windowBlocks: 5_000n,
    settleBlocks: 20n,
    refreshLimit: 10,
  };

  function indexer(final?: bigint): Indexer {
    return new Indexer(options, chain(txSource(), final), repository, reader, quiet);
  }

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    repository = new IndexerRepository(db);
  });

  afterEach(async () => {
    await close();
  });

  it('builds offers, tokens and the pack row, then moves the checkpoint', async () => {
    await indexer().step();

    const [offer] = await db.select().from(schema.offers);
    expect(offer).toMatchObject({
      packId: PACK,
      status: 'filled',
      price: '100000000',
      termNs: '600000000000',
    });

    const owners = await db.select().from(schema.tokens);
    expect(Object.fromEntries(owners.map((t) => [t.tokenId, t.ownerId]))).toEqual({
      t0: 'lender.mosaec.testnet',
      'k0.1': 'borrower.mosaec.testnet',
    });

    const [pack] = await db.select().from(schema.packs).where(eq(schema.packs.packId, PACK));
    expect(pack).toMatchObject({
      state: 'written',
      titleOwner: 'lender.mosaec.testnet',
      ticketId: 'k0.1',
      kAmount: '107500000',
      expiresAtNs: '1794360365888920934',
      lastOutcome: null,
    });
    expect(pack?.mintedHeight).not.toBeNull();

    expect((await repository.checkpoint('testnet', TXS_STREAM))?.lastHeight).toBe(277_146_140n);
  });

  it('stores nothing twice when the same window is read again', async () => {
    await indexer().step();
    const before = await db.select({ n: count() }).from(schema.events);
    await repository.rewind('testnet', TXS_STREAM, DEPLOY);
    await indexer().step();
    expect(await db.select({ n: count() }).from(schema.events)).toEqual(before);
  });

  it('marks a pack Forfeited once an expired event is stored', async () => {
    await indexer().step();
    await repository.applyEvents('testnet', {
      height: 277_146_150n,
      timestampNs: '1794360600000000000',
      events: [
        {
          receiptId: 'r-expire',
          logIndex: 0,
          txHash: null,
          executorId: SCOPE.registry,
          standard: 'mosaec',
          event: 'expired',
          packId: PACK,
          data: { pack: PACK },
        },
      ],
    });
    await indexer().step();
    const [pack] = await db.select().from(schema.packs);
    expect(pack?.lastOutcome).toBe('Forfeited');
  });

  it('waits while final has not passed the settle margin', async () => {
    expect(await indexer(DEPLOY + 10n).step()).toBe(0n);
    expect(await repository.checkpoint('testnet', TXS_STREAM)).toBeUndefined();
  });
});
