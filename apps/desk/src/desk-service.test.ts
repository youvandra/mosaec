import { describe, expect, it } from 'vitest';

import { DESK_POLICIES, deskPolicySchema } from '@mosaec/config/desk';

import { DeskService } from './desk-service';

import type { DeskChain, SentCall } from './chain';
import type { IntentsMark } from './intents';
import type { ReferencePrices } from './prices';
import type { DeskRepository } from './repository';
import type { ContractCall } from '@mosaec/sdk';

const POLICY = deskPolicySchema.parse(DESK_POLICIES.testnet);
const USDC = 'nep141:usdc.mosaec.testnet';
const BTC = 'nep141:btc.mosaec.testnet';

function service(
  collectable: Record<string, readonly { tokenId: string; amount: bigint }[] | null>,
  settles = true,
  intents: IntentsStub | null = null,
) {
  const recorded: unknown[][] = [];
  const sent: ContractCall[] = [];
  const chain: DeskChain = {
    balanceUsdc: () => Promise.resolve(0n),
    liveOffer: () => Promise.resolve(null),
    collectable: (pack) => Promise.resolve(collectable[pack] ?? null),
    send: (call): Promise<SentCall> => {
      sent.push(call);
      return Promise.resolve({
        hash: `tx${sent.length.toString()}`,
        outcome: settles
          ? { status: 'settled', events: [], refunded: [] }
          : { status: 'failed', events: [], refunded: [] },
      } as unknown as SentCall);
    },
  };
  const repository = {
    collectablePacks: () => Promise.resolve(Object.keys(collectable)),
    control: () => Promise.resolve(null),
    recordCollect: (...args: unknown[]) => {
      recorded.push(args);
      return Promise.resolve();
    },
  } as unknown as DeskRepository;
  const prices = { current: () => Promise.resolve({}) } as unknown as ReferencePrices;
  const desk = new DeskService('testnet', POLICY, chain, repository, prices, undefined, intents);
  return { desk, sent, recorded };
}

interface IntentsStub {
  toUsdc: (symbol: string, amount: bigint) => Promise<IntentsMark | null>;
}

const MARK: IntentsMark = {
  source: 'near-intents',
  dry: true,
  amountOutUsdc: '736000000',
  quotedAt: '2026-11-12T04:00:00.000Z',
  correlationId: 'c1',
};

describe('DeskService.collect', () => {
  it('withdraws every token a free desk pack holds into the desk balance', async () => {
    const { desk, sent } = service({
      '6.v0.mosaec.testnet': [{ tokenId: USDC, amount: 200_010_000n }],
      '7.v0.mosaec.testnet': [{ tokenId: BTC, amount: 1_000_000n }],
    });
    const results = await desk.collect();
    expect(results.map((r) => [r.pack, r.status])).toEqual([
      ['6.v0.mosaec.testnet', 'collected'],
      ['7.v0.mosaec.testnet', 'collected'],
    ]);
    expect(sent).toHaveLength(2);
    expect(sent[0]?.methodName).toBe('withdraw');
    expect(JSON.parse(sent[0]?.args ?? '{}')).toMatchObject({
      pack: '6.v0.mosaec.testnet',
      token_id: USDC,
      amount: '200010000',
      destination: { kind: 'verifier', account_id: 'desk.mosaec.testnet' },
    });
  });

  it('skips packs the chain no longer shows as free with the desk holding the Title', async () => {
    const { desk, sent } = service({ '8.v0.mosaec.testnet': null });
    expect(await desk.collect()).toEqual([]);
    expect(sent).toHaveLength(0);
  });

  it('reports a withdraw the chain declined', async () => {
    const { desk } = service({ '6.v0.mosaec.testnet': [{ tokenId: USDC, amount: 1n }] }, false);
    const [result] = await desk.collect();
    expect(result?.status).toBe('error');
  });
});

describe('DeskService.collect marks kept coins', () => {
  it('stores a NEAR Intents dry quote for kept coins and none for a USDC repayment', async () => {
    const asked: [string, bigint][] = [];
    const { desk, recorded } = service(
      {
        '6.v0.mosaec.testnet': [{ tokenId: USDC, amount: 200_010_000n }],
        '7.v0.mosaec.testnet': [{ tokenId: BTC, amount: 1_000_000n }],
      },
      true,
      {
        toUsdc: (symbol, amount) => {
          asked.push([symbol, amount]);
          return Promise.resolve(MARK);
        },
      },
    );
    const results = await desk.collect();
    expect(asked).toEqual([['BTC', 1_000_000n]]);
    expect(results.map((r) => r.mark)).toEqual([undefined, 'near-intents']);
    expect(recorded.map((args) => args[4])).toEqual([null, MARK]);
  });

  it('falls back to the reference price when the quote fails', async () => {
    const { desk, recorded } = service(
      { '7.v0.mosaec.testnet': [{ tokenId: BTC, amount: 1_000_000n }] },
      true,
      { toUsdc: () => Promise.reject(new Error('1Click down')) },
    );
    const [result] = await desk.collect();
    expect(result).toMatchObject({ status: 'collected', mark: 'reference' });
    expect(recorded[0]?.[4]).toBeNull();
  });
});

describe('DeskService.collect while paused', () => {
  it('signs nothing while the kill switch is on', async () => {
    const sent: ContractCall[] = [];
    const chain = {
      collectable: () => Promise.resolve([{ tokenId: USDC, amount: 1n }]),
      send: (call: ContractCall) => {
        sent.push(call);
        return Promise.reject(new Error('must not sign'));
      },
    } as unknown as DeskChain;
    const repository = {
      collectablePacks: () => Promise.resolve(['6.v0.mosaec.testnet']),
      control: () => Promise.resolve({ paused: true, reason: 'incident', updatedAt: new Date() }),
    } as unknown as DeskRepository;
    const prices = { current: () => Promise.resolve({}) } as unknown as ReferencePrices;
    const desk = new DeskService('testnet', POLICY, chain, repository, prices);
    expect(await desk.collect()).toEqual([]);
    expect(sent).toHaveLength(0);
  });
});

describe('DeskService.alreadyDecided', () => {
  const offer = {
    pack: '3.v0.mosaec.testnet',
    makerId: 'borrower.mosaec.testnet',
    payToken: USDC,
    price: 500_000_000n,
    kToken: USDC,
    kAmount: 510_000_000n,
    termNs: 600_000_000_000n,
    openUntilNs: 1n,
    contents: [{ tokenId: BTC, amount: 1_000_000n }],
    contentsHash: 'a'.repeat(64),
  };

  it('looks up the verdict of this offer only, so a re-offer is reviewed again', async () => {
    const asked: string[] = [];
    const repository = {
      lastDecision: (_network: string, _pack: string, key: string) => {
        asked.push(key);
        return Promise.resolve(
          key === asked[0] ? { verdict: 'refused' as const, code: 'DESK_POLICY' } : null,
        );
      },
    } as unknown as DeskRepository;
    const prices = { current: () => Promise.resolve({}) } as unknown as ReferencePrices;
    const desk = new DeskService('testnet', POLICY, {} as DeskChain, repository, prices);

    expect(await desk.alreadyDecided(offer)).toBe(true);
    expect(
      await desk.alreadyDecided({
        ...offer,
        price: 200_000_000n,
        kAmount: 204_000_000n,
        openUntilNs: 2n,
      }),
    ).toBe(false);
    expect(asked[0]).not.toBe(asked[1]);
  });
});
