import { describe, expect, it } from 'vitest';

import { deskPolicy } from '@mosaec/config/desk';

import { buildLedger } from './desk-ledger';

import type { LedgerInput } from './desk-ledger';
import type { DecisionRecord, DeskFillRow, RateCardRecord } from '../repositories/desk-repository';

const NOW = new Date('2026-11-12T12:00:00Z');
const DESK = 'desk.mosaec.testnet';

const fill = (patch: Partial<DeskFillRow>): DeskFillRow => ({
  packId: '1.v0.mosaec.testnet',
  decidedAt: new Date('2026-11-11T10:00:00Z'),
  txHash: 'FillTx',
  actor: 'instant',
  principal: '200000000',
  interest: '5500000',
  collateral: { symbol: 'ZEC', amount: '50000000' },
  state: 'written',
  titleOwner: DESK,
  lastOutcome: null,
  ...patch,
});

const card = (patch: Partial<RateCardRecord>): RateCardRecord => ({
  id: 1n,
  network: 'testnet',
  asset: 'ZEC',
  monthlyBps: 275,
  maxLtvBps: 5_000,
  inputs: {},
  reason: 'Fair rate plus margin.',
  source: 'fallback',
  createdAt: new Date('2026-11-12T10:00:00Z'),
  ...patch,
});

const input = (patch: Partial<LedgerInput> = {}): LedgerInput => ({
  network: 'testnet',
  accountId: DESK,
  policy: deskPolicy('testnet'),
  now: NOW,
  balances: [
    { symbol: 'USDC', tokenId: 'nep141:usdc.mosaec.testnet', decimals: 6, amount: '9800000000' },
  ],
  fills: [
    fill({ packId: '1.v0.mosaec.testnet', decidedAt: new Date('2026-11-12T09:00:00Z') }),
    fill({ packId: '2.v0.mosaec.testnet', state: 'free', lastOutcome: 'Redeemed' }),
    fill({ packId: '3.v0.mosaec.testnet', state: 'free', lastOutcome: 'Forfeited' }),
  ],
  collects: [],
  cards: [
    card({ id: 3n, monthlyBps: 300, source: 'model', createdAt: new Date('2026-11-12T11:00:00Z') }),
    card({ id: 2n, createdAt: new Date('2026-11-12T10:30:00Z') }),
    card({ id: 1n, createdAt: new Date('2026-11-12T10:00:00Z') }),
  ],
  currentCards: [card({ id: 3n, monthlyBps: 300, source: 'model' })],
  control: null,
  prices: [{ symbol: 'ZEC', usd: '1000', source: 'coingecko', observedAt: NOW }],
  ...patch,
});

describe('buildLedger', () => {
  it('splits the book into running, repaid and kept, and marks kept coins at the reference price', () => {
    const { book } = buildLedger(input());
    expect(book).toMatchObject({
      fills: 3,
      running: 1,
      lentNowUsdc: '200000000',
      repaid: 1,
      realisedInterestUsdc: '5500000',
      forfeited: 1,
      utilisationBps: 400,
      lentTodayUsdc: '200000000',
      budgetLeftTodayUsdc: '4800000000',
    });
    expect(book.keptCoins).toEqual([
      expect.objectContaining({
        symbol: 'ZEC',
        amount: '50000000',
        markUsdc: '500000000',
        markSource: 'reference',
      }),
    ]);
  });

  it('marks kept coins at the NEAR Intents dry quote stored at collect time', () => {
    const { book } = buildLedger(
      input({
        collects: [
          {
            packId: '3.v0.mosaec.testnet',
            decidedAt: new Date('2026-11-12T11:30:00Z'),
            txHash: 'CollectTx',
            actor: 'desk',
            quote: {
              tokenId: 'nep141:zec.mosaec.testnet',
              amount: '50000000',
              intents: { amountOutUsdc: '492410430', quotedAt: '2026-11-12T11:30:01.000Z' },
            },
          } as unknown as DecisionRecord,
        ],
      }),
    );
    expect(book.keptCoins).toEqual([
      expect.objectContaining({
        markUsdc: '492410430',
        markSource: 'near-intents',
        quotedAt: '2026-11-12T11:30:01.000Z',
      }),
    ]);
  });

  it('lists a card only when it moved, newest event first', () => {
    const { events } = buildLedger(input());
    const cards = events.filter((e) => e.kind === 'card');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({ monthlyBps: 300, previousBps: 275, source: 'model' });
    const times = events.map((e) => e.at);
    expect(times).toEqual([...times].sort().reverse());
  });

  it('reports the kill switch with its reason', () => {
    const ledger = buildLedger(
      input({
        control: {
          network: 'testnet',
          paused: true,
          reason: 'incident review',
          updatedAt: new Date('2026-11-12T11:30:00Z'),
        },
      }),
    );
    expect(ledger.status).toMatchObject({
      state: 'paused',
      by: 'switch',
      reason: 'incident review',
    });
    expect(ledger.events[0]).toMatchObject({ kind: 'pause', reason: 'incident review' });
  });

  it('is live with no switch row and an active policy', () => {
    expect(buildLedger(input()).status).toMatchObject({ state: 'live', by: null, reason: null });
  });
});
