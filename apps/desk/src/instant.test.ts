import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ASSETS } from '@mosaec/config/assets';
import { DESK_POLICIES, deskPolicySchema } from '@mosaec/config/desk';
import { NS_PER_DAY, rateBounds, repaymentFor } from '@mosaec/config/rates';
import { schema } from '@mosaec/db';
import { createTestDb } from '@mosaec/db/testing';

import { UnconfirmedSendError } from './chain';
import { DeskService } from './desk-service';
import { InstantDesk, MAX_QUEUED_FILLS, QUOTE_TTL_MS } from './instant';
import { QuoteSigner } from './quote-token';
import { RateCards } from './rate-card';
import { DeskRepository, utcMidnight } from './repository';

import type { DeskChain, SentCall } from './chain';
import type { FillRequest, InstantQuote } from './instant';
import type { ChatModel } from './model';
import type { OfferInput } from './policy';
import type { ReferencePrices } from './prices';
import type { RealisedVolatility } from './volatility';
import type { ContractCall } from '@mosaec/sdk';

const POLICY = deskPolicySchema.parse(DESK_POLICIES.testnet);
const USDC = ASSETS.USDC.tokenIds.testnet;
const ZEC = ASSETS.ZEC.tokenIds.testnet;
const PACK = '9.v0.mosaec.testnet';
const BORROWER = 'persona.testnet';
/* Real time: decision rows carry the database clock. */
const NOW = Date.now();
const HALF_ZEC = 50_000_000n;
const TERM = 30n * NS_PER_DAY;

let close: () => Promise<void>;
let db: Awaited<ReturnType<typeof createTestDb>>['db'];
let repository: DeskRepository;
let clock: number;
let sent: ContractCall[];
let offer: OfferInput | null;
let balance: bigint;
/** Packs other than PACK with a live offer. */
let others: Map<string, OfferInput>;
/** When set, the next send reaches the chain but its outcome read fails. */
let unconfirmed: boolean;
let desk: DeskService;

function offerFrom(quote: InstantQuote, patch: Partial<OfferInput> = {}): OfferInput {
  return {
    pack: PACK,
    makerId: BORROWER,
    titleOwner: BORROWER,
    payToken: USDC,
    price: quote.principal,
    kToken: USDC,
    kAmount: quote.repayment,
    termNs: quote.termNs,
    openUntilNs: BigInt(clock + 3_600_000) * 1_000_000n,
    contents: [{ tokenId: ZEC, amount: quote.amount }],
    contentsHash: 'b'.repeat(64),
    ...patch,
  };
}

function build(poll = { reads: 1, gapMs: 0 }) {
  const chain: DeskChain = {
    balanceUsdc: () => Promise.resolve(balance),
    liveOffer: (pack) => Promise.resolve(pack === PACK ? offer : (others.get(pack) ?? null)),
    collectable: () => Promise.resolve(null),
    outcomeOf: () =>
      Promise.resolve({ status: 'settled', events: [], refunded: false } as unknown as Awaited<
        ReturnType<DeskChain['outcomeOf']>
      >),
    send: async (call): Promise<SentCall> => {
      sent.push(call);
      /* The fill lands: the pack is no longer offered. */
      await new Promise((resolve) => setTimeout(resolve, 5));
      const pack = (JSON.parse(call.args) as { pack?: string }).pack ?? PACK;
      if (pack === PACK) offer = null;
      else others.delete(pack);
      if (unconfirmed) {
        unconfirmed = false;
        throw new UnconfirmedSendError(`tx${sent.length.toString()}`, new Error('timeout'));
      }
      return {
        hash: `tx${sent.length.toString()}`,
        outcome: { status: 'settled', events: [], refunded: [] },
      } as unknown as SentCall;
    },
  };
  const prices = { current: () => Promise.resolve({ ZEC: 1_000 }) } as unknown as ReferencePrices;
  desk = new DeskService('testnet', POLICY, chain, repository, prices, () => new Date(clock));
  const model: ChatModel = {
    id: 'unused',
    complete: () => Promise.reject(new Error('the instant path never asks the model')),
  };
  const volatility = { of: () => Promise.resolve(null) } as unknown as RealisedVolatility;
  const cards = new RateCards(desk, repository, volatility, model);
  return new InstantDesk(
    desk,
    repository,
    cards,
    new QuoteSigner('s'.repeat(64)),
    () => clock,
    poll,
  );
}

async function quoted(instant: InstantDesk): Promise<InstantQuote> {
  const answer = await instant.quote({
    asset: 'ZEC',
    amount: HALF_ZEC,
    principal: 200_000_000n,
    termNs: TERM,
    borrower: BORROWER,
  });
  if (!answer.available) throw new Error(`no quote: ${answer.reason}`);
  return answer.quote;
}

const fillOf = (quote: InstantQuote, patch: Partial<FillRequest> = {}): FillRequest => ({
  ...quote,
  pack: PACK,
  ...patch,
});

beforeEach(async () => {
  const test = await createTestDb();
  close = test.close;
  db = test.db;
  repository = new DeskRepository(test.db);
  clock = NOW;
  sent = [];
  offer = null;
  balance = 10_000_000_000n;
  others = new Map();
  unconfirmed = false;
});

afterEach(async () => {
  await close();
});

describe('InstantDesk.quote', () => {
  it('prices from the card: fair rate plus margin until the agent sets one', async () => {
    const quote = await quoted(build());
    expect(quote.principal).toBe(200_000_000n);
    expect(quote.monthlyBps).toBe(rateBounds('ZEC').minMonthlyBps);
    expect(quote.repayment).toBe(repaymentFor(200_000_000n, quote.monthlyBps, TERM));
    expect(quote.expiresAtMs).toBe(NOW + QUOTE_TTL_MS);
    expect(quote.ltvBps).toBe(4_000);
  });

  it('caps the loan at the loan-to-value limit', async () => {
    const answer = await build().quote({ asset: 'ZEC', amount: HALF_ZEC, termNs: TERM });
    expect(answer.available && answer.quote.principal).toBe(250_000_000n);
  });

  it('is unavailable while the kill switch is on', async () => {
    await repository.setControl('testnet', true, 'incident review');
    const answer = await build().quote({ asset: 'ZEC', amount: HALF_ZEC, termNs: TERM });
    expect(answer).toMatchObject({ available: false, code: 'DESK_PAUSED' });
  });

  it('is unavailable when the desk balance is below the loan', async () => {
    balance = 1_000_000n;
    const answer = await build().quote({ asset: 'ZEC', amount: HALF_ZEC, termNs: TERM });
    expect(answer).toMatchObject({ available: false, code: 'DESK_BUDGET' });
  });
});

describe('InstantDesk.fill', () => {
  it('fills an offer carrying exactly the quoted terms', async () => {
    const instant = build();
    const quote = await quoted(instant);
    offer = offerFrom(quote);
    const result = await instant.fill(fillOf(quote));
    expect(result.status).toBe('filled');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.args).toContain(PACK);
  });

  it('refuses an expired quote', async () => {
    const instant = build();
    const quote = await quoted(instant);
    offer = offerFrom(quote);
    clock += QUOTE_TTL_MS;
    expect(await instant.fill(fillOf(quote))).toMatchObject({ code: 'DESK_QUOTE_EXPIRED' });
    expect(sent).toHaveLength(0);
  });

  it('refuses a tampered quote', async () => {
    const instant = build();
    const quote = await quoted(instant);
    offer = offerFrom(quote, { price: 250_000_000n });
    const result = await instant.fill(fillOf(quote, { principal: 250_000_000n }));
    expect(result).toMatchObject({ code: 'DESK_QUOTE_INVALID' });
    expect(sent).toHaveLength(0);
  });

  it('refuses an offer whose terms differ from the quote', async () => {
    const instant = build();
    const quote = await quoted(instant);
    offer = offerFrom(quote, { kAmount: quote.repayment - 10_000n });
    expect(await instant.fill(fillOf(quote))).toMatchObject({ code: 'DESK_QUOTE_MISMATCH' });
    expect(sent).toHaveLength(0);
  });

  it('refuses while paused, even with a valid quote', async () => {
    const instant = build();
    const quote = await quoted(instant);
    offer = offerFrom(quote);
    await repository.setControl('testnet', true, 'incident review');
    expect(await instant.fill(fillOf(quote))).toMatchObject({ code: 'DESK_PAUSED' });
    expect(sent).toHaveLength(0);
  });

  it('refuses when the budget ran out after the quote', async () => {
    const instant = build();
    const quote = await quoted(instant);
    offer = offerFrom(quote);
    balance = 1_000_000n;
    expect(await instant.fill(fillOf(quote))).toMatchObject({ code: 'DESK_BUDGET' });
  });

  it('refuses when the pack never shows the offer', async () => {
    const instant = build();
    const quote = await quoted(instant);
    expect(await instant.fill(fillOf(quote))).toMatchObject({ code: 'DESK_POLICY' });
    expect(sent).toHaveLength(0);
  });

  it('fills once when the same quote is sent twice at the same time', async () => {
    const instant = build();
    const quote = await quoted(instant);
    offer = offerFrom(quote);
    const [first, second] = await Promise.all([
      instant.fill(fillOf(quote)),
      instant.fill(fillOf(quote)),
    ]);
    expect(sent).toHaveLength(1);
    expect(first).toMatchObject({ status: 'filled', txHash: 'tx1' });
    expect(second).toMatchObject({ status: 'filled', txHash: 'tx1' });
  });

  it('waits for a missing offer outside the fill lock, so it holds up no other fill', async () => {
    const instant = build({ reads: 40, gapMs: 5 });
    const quote = await quoted(instant);
    offer = offerFrom(quote);
    const finished: string[] = [];
    const stranger = instant
      .fill(fillOf(quote, { pack: '99.v0.mosaec.testnet' }))
      .then((result) => {
        finished.push('stranger');
        return result;
      });
    const real = await instant.fill(fillOf(quote));
    finished.push('real');
    expect(real.status).toBe('filled');
    expect(await stranger).toMatchObject({ code: 'DESK_POLICY' });
    expect(finished).toEqual(['real', 'stranger']);
  });

  it('turns a fill away as busy while the lock queue is full', async () => {
    const instant = build();
    const quote = await quoted(instant);
    offer = offerFrom(quote);
    const releases: (() => void)[] = [];
    const gate = new Promise<undefined>((resolve) => {
      releases.push(() => {
        resolve(undefined);
      });
    });
    const held = Array.from({ length: MAX_QUEUED_FILLS }, () => desk.exclusive(() => gate));
    expect(await instant.fill(fillOf(quote))).toMatchObject({ code: 'DESK_BUSY' });
    releases.forEach((release) => {
      release();
    });
    await Promise.all(held);
    expect(sent).toHaveLength(0);
  });

  it('counts a fill whose outcome read failed, and reconciles it into a fill', async () => {
    const instant = build();
    const quote = await quoted(instant);
    offer = offerFrom(quote);
    unconfirmed = true;
    const result = await instant.fill(fillOf(quote));
    expect(result).toMatchObject({ status: 'error', code: 'UPSTREAM_RPC', txHash: 'tx1' });
    /* The indexer has not seen the pack yet; the recent send still counts as running and lent. */
    expect(await repository.exposure('testnet', POLICY.deskAccountId)).toBe(quote.principal);
    expect(await repository.hasOpenInstantLoan('testnet', POLICY.deskAccountId, BORROWER)).toBe(
      true,
    );
    expect(await desk.reconcile()).toBe(1);
    expect(await repository.unconfirmedFills('testnet', new Date(0))).toHaveLength(0);
    const again = await instant.fill(fillOf(quote));
    expect(again).toMatchObject({ status: 'filled', txHash: 'tx1' });
  });

  it('refuses a borrower past the daily count of instant loans', async () => {
    const instant = build();
    for (let n = 0; n < POLICY.maxInstantFillsPerMakerPerDay; n += 1) {
      await repository.record({
        network: 'testnet',
        runId: `r${n.toString()}`,
        packId: `${n.toString()}.v0.mosaec.testnet`,
        offerKey: null,
        verdict: 'fill',
        code: null,
        reason: 'earlier loan, repaid',
        quote: { principal: '10000000' } as never,
        txHash: `old${n.toString()}`,
        actor: 'instant',
        makerId: BORROWER,
      });
    }
    /* Earlier today and no longer running, so only the daily count stops this borrower. */
    await db.update(schema.deskDecisions).set({
      decidedAt: new Date(Math.max(NOW - 11 * 60_000, utcMidnight(new Date(NOW)).getTime())),
    });
    const answer = await instant.quote({
      asset: 'ZEC',
      amount: HALF_ZEC,
      termNs: TERM,
      borrower: BORROWER,
    });
    expect(answer).toMatchObject({ available: false, code: 'DESK_MAKER_LIMIT' });
  });
});

describe('DeskRepository.lentSince', () => {
  it('gives back the budget of a loan repaid after it was lent', async () => {
    for (const pack of ['1.v0.mosaec.testnet', '2.v0.mosaec.testnet']) {
      await repository.record({
        network: 'testnet',
        runId: pack,
        packId: pack,
        offerKey: null,
        verdict: 'fill',
        code: null,
        reason: 'lent',
        quote: { principal: '250000000' } as never,
        txHash: `tx-${pack}`,
        actor: 'instant',
        makerId: BORROWER,
      });
    }
    const after = (BigInt(Date.now() + 60_000) * 1_000_000n).toString();
    await db.insert(schema.events).values({
      network: 'testnet',
      receiptId: 'r-redeem',
      logIndex: 0,
      blockHeight: 1n,
      blockTimestampNs: after,
      executorId: 'v0.mosaec.testnet',
      standard: 'mosaec',
      event: 'contents_released',
      packId: '1.v0.mosaec.testnet',
      data: {},
    });
    expect(await repository.lentSince('testnet', new Date(0))).toBe(250_000_000n);
  });
});
