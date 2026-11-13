import { describe, expect, it } from 'vitest';

import { DESK_POLICIES, deskPolicySchema } from '@mosaec/config/desk';
import { rateBounds } from '@mosaec/config/rates';

import { CARD_STEP_BPS, MIN_CARD_LTV_BPS, RateCards, clampCard, parseProposals } from './rate-card';

import type { DeskService } from './desk-service';
import type { ChatModel } from './model';
import type { DeskContext } from './policy';
import type { DeskRepository, RateCard, RateCardInput } from './repository';
import type { RealisedVolatility } from './volatility';

const POLICY = deskPolicySchema.parse(DESK_POLICIES.testnet);
const ZEC = rateBounds('ZEC');

describe('clampCard', () => {
  it('holds a card inside the bounds, so it never sits below fair rate plus margin', () => {
    expect(clampCard({ monthlyBps: 10, maxLtvBps: 5_000 }, null, ZEC, 5_000).monthlyBps).toBe(
      ZEC.minMonthlyBps,
    );
    expect(clampCard({ monthlyBps: 9_999, maxLtvBps: 5_000 }, null, ZEC, 5_000).monthlyBps).toBe(
      ZEC.maxMonthlyBps,
    );
  });

  it('moves at most one step from the previous card', () => {
    const previous = { monthlyBps: 300 };
    expect(clampCard({ monthlyBps: 600, maxLtvBps: 5_000 }, previous, ZEC, 5_000).monthlyBps).toBe(
      300 + CARD_STEP_BPS,
    );
    expect(clampCard({ monthlyBps: 280, maxLtvBps: 5_000 }, previous, ZEC, 5_000).monthlyBps).toBe(
      280,
    );
  });

  it('lets the bounds win over the step limit', () => {
    const previous = { monthlyBps: ZEC.minMonthlyBps + 10 };
    expect(clampCard({ monthlyBps: 0, maxLtvBps: 5_000 }, previous, ZEC, 5_000).monthlyBps).toBe(
      ZEC.minMonthlyBps,
    );
  });

  it('never loosens loan to value past the policy', () => {
    expect(clampCard({ monthlyBps: 300, maxLtvBps: 9_000 }, null, ZEC, 5_000).maxLtvBps).toBe(
      5_000,
    );
    expect(clampCard({ monthlyBps: 300, maxLtvBps: 1 }, null, ZEC, 5_000).maxLtvBps).toBe(
      MIN_CARD_LTV_BPS,
    );
  });
});

describe('parseProposals', () => {
  it('reads JSON wrapped in prose', () => {
    const reply =
      'Here: {"cards":[{"asset":"zec","monthly_bps":300,"max_ltv_bps":4500,"reason":"calm"}]}';
    expect(parseProposals(reply).get('ZEC')).toEqual({
      monthlyBps: 300,
      maxLtvBps: 4_500,
      reason: 'calm',
    });
  });

  it.each([null, '', 'no json', '{"cards": "nope"}', '{broken'])(
    'yields nothing for %j',
    (reply) => {
      expect(parseProposals(reply).size).toBe(0);
    },
  );
});

type Reply = string | Error;

function harness(reply: Reply | readonly Reply[]) {
  const replies: Reply[] | null =
    typeof reply === 'string' || reply instanceof Error ? null : [...reply];
  const asked: string[] = [];
  const saved: RateCardInput[] = [];
  const repository = {
    bookCounts: () => Promise.resolve({ repaid: 2, forfeited: 0 }),
    latestCard: () => Promise.resolve(null),
    saveCard: (input: RateCardInput): Promise<RateCard> => {
      saved.push(input);
      return Promise.resolve({ ...input, id: saved.length.toString(), createdAt: new Date() });
    },
  } as unknown as DeskRepository;
  const desk = {
    network: 'testnet',
    policy: POLICY,
    context: () =>
      Promise.resolve({ exposureUsdc: 0n, lentTodayUsdc: 0n } as unknown as DeskContext),
  } as unknown as DeskService;
  const model: ChatModel = {
    id: 'test-model',
    complete: (messages) => {
      asked.push(messages.at(-1)?.content ?? '');
      const next: Reply = replies === null ? (reply as Reply) : (replies.shift() ?? '');
      return next instanceof Error
        ? Promise.reject(next)
        : Promise.resolve({ role: 'assistant', content: next });
    },
  };
  const volatility = { of: () => Promise.resolve(8_000) } as unknown as RealisedVolatility;
  return { cards: new RateCards(desk, repository, volatility, model), saved, asked };
}

const card = (asset: string, monthlyBps: number) =>
  `{"cards":[{"asset":"${asset}","monthly_bps":${monthlyBps.toString()},"max_ltv_bps":5000,"reason":"ok"}]}`;

describe('RateCards.refresh', () => {
  it('writes the clamped model card and falls back for coins it skipped', async () => {
    const { cards, saved } = harness(
      '{"cards":[{"asset":"ZEC","monthly_bps":320,"max_ltv_bps":4000,"reason":"vol is high"}]}',
    );
    const written = await cards.refresh();
    const zec = written.find((card) => card.asset === 'ZEC');
    expect(zec).toMatchObject({ monthlyBps: 320, maxLtvBps: 4_000, source: 'model' });
    const btc = written.find((card) => card.asset === 'BTC');
    expect(btc).toMatchObject({ monthlyBps: rateBounds('BTC').minMonthlyBps, source: 'fallback' });
    expect(saved).toHaveLength(POLICY.assets.length);
  });

  it('asks again for each coin the model skipped, one coin per call', async () => {
    const { cards, asked } = harness([card('ZEC', 300), card('BTC', 150), card('SOL', 275)]);
    const written = await cards.refresh();
    expect(written.map((c) => [c.asset, c.source])).toEqual(
      POLICY.assets.map((asset) => [asset, 'model']),
    );
    expect(asked).toHaveLength(POLICY.assets.length);
    expect(asked[1]).toContain('"asset":"BTC"');
    expect(asked[1]).not.toContain('"asset":"SOL"');
  });

  it('falls back only for a coin the retry also skipped', async () => {
    const { cards } = harness([card('ZEC', 300), 'no json', card('SOL', 275)]);
    const sources = Object.fromEntries((await cards.refresh()).map((c) => [c.asset, c.source]));
    expect(sources).toEqual({ ZEC: 'model', BTC: 'fallback', SOL: 'model' });
  });

  it('does not retry when the model gave nothing', async () => {
    const { cards, asked } = harness(['I think 3%']);
    await cards.refresh();
    expect(asked).toHaveLength(1);
  });

  it.each([
    ['bad JSON', 'I think 3%'],
    ['model down', new Error('timeout')],
  ] as const)('writes fair rate plus margin on %s', async (_name, reply) => {
    const { cards } = harness(reply);
    for (const card of await cards.refresh()) {
      expect(card.source).toBe('fallback');
      expect(card.monthlyBps).toBe(rateBounds(card.asset as 'ZEC').minMonthlyBps);
      expect(card.maxLtvBps).toBe(POLICY.maxLtvBps);
    }
  });
});
