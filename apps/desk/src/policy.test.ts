import { describe, expect, it } from 'vitest';

import { ASSETS } from '@mosaec/config/assets';
import { deskPolicy } from '@mosaec/config/desk';

import { collateralValueUsdc, evaluate } from './policy';

import type { DeskContext, OfferInput } from './policy';

const USDC = ASSETS.USDC.tokenIds.testnet;
const ZEC = ASSETS.ZEC.tokenIds.testnet;
const DAY = 86_400_000_000_000n;
const NOW = 1_800_000_000_000_000_000n;

const offer = (patch: Partial<OfferInput> = {}): OfferInput => ({
  pack: '7.v0.mosaec.testnet',
  makerId: 'borrower.mosaec.testnet',
  payToken: USDC,
  price: 100_000_000n,
  kToken: USDC,
  kAmount: 109_000_000n,
  termNs: 90n * DAY,
  openUntilNs: NOW + DAY,
  contents: [{ tokenId: ZEC, amount: 50_000_000n }],
  contentsHash: 'a'.repeat(64),
  ...patch,
});

const ctx = (patch: Partial<DeskContext> = {}): DeskContext => ({
  network: 'testnet',
  policy: deskPolicy('testnet'),
  nowNs: NOW,
  pricesUsd: { ZEC: 1_000 },
  deskBalanceUsdc: 1_000_000_000n,
  exposureUsdc: 0n,
  lentTodayUsdc: 0n,
  fillsLastHour: 0,
  instantFillsLastHour: 0,
  pausedReason: null,
  ...patch,
});

describe('evaluate', () => {
  it('fills an offer inside every rule and prices it', () => {
    const verdict = evaluate(offer(), ctx());
    expect(verdict.ok).toBe(true);
    expect(verdict.quote?.ltvBps).toBe(2_000);
    expect(verdict.quote?.aprBps).toBe(3_650);
    expect(verdict.quote?.interest).toBe('9000000');
  });

  it.each([
    ['paused', offer(), ctx({ policy: { ...deskPolicy('testnet'), paused: true } }), 'DESK_PAUSED'],
    ['own offer', offer({ makerId: 'desk.mosaec.testnet' }), ctx(), 'DESK_POLICY'],
    ['foreign pay token', offer({ payToken: ZEC }), ctx(), 'DESK_POLICY'],
    [
      'two coins',
      offer({
        contents: [
          { tokenId: ZEC, amount: 1n },
          { tokenId: USDC, amount: 1n },
        ],
      }),
      ctx(),
      'DESK_POLICY',
    ],
    [
      'unknown coin',
      offer({ contents: [{ tokenId: 'nep141:x.testnet', amount: 1n }] }),
      ctx(),
      'DESK_POLICY',
    ],
    ['closed offer', offer({ openUntilNs: NOW }), ctx(), 'DESK_POLICY'],
    ['term too short', offer({ termNs: 60_000_000_000n }), ctx(), 'DESK_POLICY'],
    ['term too long', offer({ termNs: 180n * DAY }), ctx(), 'DESK_POLICY'],
    ['no interest', offer({ kAmount: 100_000_000n }), ctx(), 'DESK_POLICY'],
    ['rate too low', offer({ kAmount: 101_000_000n }), ctx(), 'DESK_POLICY'],
    ['fair rate without the desk margin', offer({ kAmount: 107_500_000n }), ctx(), 'DESK_POLICY'],
    ['kill switch on', offer(), ctx({ pausedReason: 'incident review' }), 'DESK_PAUSED'],
    ['no price', offer(), ctx({ pricesUsd: {} }), 'DESK_POLICY'],
    [
      'loan too large for the coins',
      offer({ price: 300_000_000n, kAmount: 330_000_000n }),
      ctx(),
      'DESK_POLICY',
    ],
    [
      'fill above the per-pawn cap',
      offer({
        price: 260_000_000n,
        kAmount: 290_000_000n,
        contents: [{ tokenId: ZEC, amount: 100_000_000n }],
      }),
      ctx(),
      'DESK_POLICY',
    ],
    [
      'dust below the per-pawn floor, checked before the hourly quota',
      offer({ price: 1n, kAmount: 2n }),
      ctx({ fillsLastHour: 4 }),
      'DESK_POLICY',
    ],
    ['balance too low', offer(), ctx({ deskBalanceUsdc: 99_000_000n }), 'DESK_BUDGET'],
    ['daily budget spent', offer(), ctx({ lentTodayUsdc: 4_950_000_000n }), 'DESK_BUDGET'],
    ['hourly fills spent', offer(), ctx({ fillsLastHour: 4 }), 'DESK_BUDGET'],
    ['exposure cap', offer(), ctx({ exposureUsdc: 4_950_000_000n }), 'DESK_EXPOSURE'],
  ] as const)('refuses: %s', (_name, input, context, code) => {
    const verdict = evaluate(input, context);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.code).toBe(code);
  });
});

describe('evaluate options', () => {
  it('counts instant fills against their own hourly quota', () => {
    const busyLoop = ctx({ fillsLastHour: 4 });
    expect(evaluate(offer(), busyLoop).ok).toBe(false);
    expect(evaluate(offer(), busyLoop, { lane: 'instant' }).ok).toBe(true);
    const busyInstant = ctx({ instantFillsLastHour: 20 });
    expect(evaluate(offer(), busyInstant, { lane: 'instant' }).ok).toBe(false);
    expect(evaluate(offer(), busyInstant).ok).toBe(true);
  });

  it('honours a quoted loan to value while the price moved or went missing', () => {
    const crashed = ctx({ pricesUsd: { ZEC: 100 } });
    expect(evaluate(offer(), crashed).ok).toBe(false);
    expect(evaluate(offer(), crashed, { lane: 'instant', honourQuotedLtv: true }).ok).toBe(true);
    const missing = ctx({ pricesUsd: {} });
    expect(evaluate(offer(), missing, { lane: 'instant', honourQuotedLtv: true }).ok).toBe(true);
  });

  it('keeps the config pause as a floor the switch cannot lift', () => {
    const verdict = evaluate(
      offer(),
      ctx({ policy: { ...deskPolicy('testnet'), paused: true }, pausedReason: null }),
      { lane: 'instant', honourQuotedLtv: true },
    );
    expect(verdict.ok).toBe(false);
  });
});

describe('collateralValueUsdc', () => {
  it('prices half a ZEC at 1,000 USD as 500 USDC', () => {
    expect(collateralValueUsdc(50_000_000n, 8, 1_000)).toBe(500_000_000n);
  });
});
