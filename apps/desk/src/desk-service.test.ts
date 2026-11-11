import { describe, expect, it } from 'vitest';

import { DESK_POLICIES, deskPolicySchema } from '@mosaec/config/desk';

import { DeskService } from './desk-service';

import type { DeskChain, SentCall } from './chain';
import type { ReferencePrices } from './prices';
import type { DeskRepository } from './repository';
import type { ContractCall } from '@mosaec/sdk';

const POLICY = deskPolicySchema.parse(DESK_POLICIES.testnet);
const USDC = 'nep141:usdc.mosaec.testnet';
const BTC = 'nep141:btc.mosaec.testnet';

function service(
  collectable: Record<string, readonly { tokenId: string; amount: bigint }[] | null>,
  settles = true,
) {
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
  } as unknown as DeskRepository;
  const prices = { current: () => Promise.resolve({}) } as unknown as ReferencePrices;
  return { desk: new DeskService('testnet', POLICY, chain, repository, prices), sent };
}

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
