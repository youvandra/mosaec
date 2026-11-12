import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ASSETS } from '@mosaec/config/assets';
import { DESK_POLICIES, deskPolicySchema } from '@mosaec/config/desk';
import { NS_PER_DAY, rateBounds, repaymentFor } from '@mosaec/config/rates';
import { createTestDb } from '@mosaec/db/testing';

import { DeskService } from './desk-service';
import { InstantDesk, QUOTE_TTL_MS } from './instant';
import { QuoteSigner } from './quote-token';
import { RateCards } from './rate-card';
import { DeskRepository } from './repository';

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
let repository: DeskRepository;
let clock: number;
let sent: ContractCall[];
let offer: OfferInput | null;
let balance: bigint;

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

function build() {
  const chain: DeskChain = {
    balanceUsdc: () => Promise.resolve(balance),
    liveOffer: () => Promise.resolve(offer),
    collectable: () => Promise.resolve(null),
    send: async (call): Promise<SentCall> => {
      sent.push(call);
      /* The fill lands: the pack is no longer offered. */
      await new Promise((resolve) => setTimeout(resolve, 5));
      offer = null;
      return {
        hash: `tx${sent.length.toString()}`,
        outcome: { status: 'settled', events: [], refunded: [] },
      } as unknown as SentCall;
    },
  };
  const prices = { current: () => Promise.resolve({ ZEC: 1_000 }) } as unknown as ReferencePrices;
  const desk = new DeskService('testnet', POLICY, chain, repository, prices, () => new Date(clock));
  const model: ChatModel = {
    id: 'unused',
    complete: () => Promise.reject(new Error('the instant path never asks the model')),
  };
  const volatility = { of: () => Promise.resolve(null) } as unknown as RealisedVolatility;
  const cards = new RateCards(desk, repository, volatility, model);
  return new InstantDesk(desk, repository, cards, new QuoteSigner('s'.repeat(64)), () => clock);
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
  repository = new DeskRepository(test.db);
  clock = NOW;
  sent = [];
  offer = null;
  balance = 10_000_000_000n;
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
});
