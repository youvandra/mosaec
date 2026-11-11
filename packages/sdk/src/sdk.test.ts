import { describe, expect, it } from 'vitest';

import { FT_STORAGE_DEPOSIT_YOCTO, MINT_DEPOSIT_YOCTO, ftAccountOf, mosaecCalls } from './actions';
import { canonicalContents, contentsHash } from './contents';
import { aprBps, ltvBps, pawnFee, repaymentFor } from './finance';
import { GAS, MAX_TX_GAS } from './gas';
import { stringifyContractJson } from './json';
import { parseOutcome } from './outcome';
import { MosaecViews, NearRpc } from './views';

import type { RpcTxResult } from './outcome';

const ZEC = 'nep141:zec.mosaec.testnet';
const USDC = 'nep141:usdc.mosaec.testnet';
const PACK = '0.v0.mosaec.testnet';
const TERMS = { kToken: USDC, kAmount: 107_500_000n, termNs: 600_000_000_000n };

describe('contentsHash', () => {
  it('matches the hash the testnet registry emitted for 0.5 ZEC', async () => {
    await expect(contentsHash([{ token_id: ZEC, amount: 50_000_000n }])).resolves.toBe(
      'b3e97114768ffca0ad207fbff596a4e9dcccb110dc84ba1a3c93ff9934c1c20f',
    );
  });

  it('sorts by token id and refuses repeats and zero lines', () => {
    expect(
      canonicalContents([
        { token_id: ZEC, amount: 1n },
        { token_id: 'nep141:btc.mosaec.testnet', amount: 2n },
      ]).map((l) => l.token_id),
    ).toEqual(['nep141:btc.mosaec.testnet', ZEC]);
    expect(() =>
      canonicalContents([
        { token_id: ZEC, amount: 1n },
        { token_id: ZEC, amount: 2n },
      ]),
    ).toThrow(/twice/);
    expect(() => canonicalContents([{ token_id: ZEC, amount: 0n }])).toThrow(/zero/);
  });
});

describe('stringifyContractJson', () => {
  it('writes bigints as bare numbers without rounding', () => {
    expect(stringifyContractJson({ t: 1794360365888920934n, s: 'x' })).toBe(
      '{"t":1794360365888920934,"s":"x"}',
    );
  });
});

describe('mosaecCalls (testnet)', () => {
  const calls = mosaecCalls('testnet');

  it('mints on the testnet registry with the mint deposit', () => {
    expect(calls.mint()).toMatchObject({
      receiverId: 'v0.mosaec.testnet',
      methodName: 'mint',
      deposit: MINT_DEPOSIT_YOCTO,
    });
  });

  it('fills through the verifier with a message the registry parses', () => {
    const fill = calls.fill({
      pack: PACK,
      terms: TERMS,
      contentsHash: 'ab',
      payToken: USDC,
      price: 100_000_000n,
    });
    expect(fill).toMatchObject({
      receiverId: 'intents.mosaec.testnet',
      methodName: 'mt_transfer_call',
      gas: MAX_TX_GAS,
      deposit: 1n,
    });
    const args = JSON.parse(fill.args) as { receiver_id: string; amount: string; msg: string };
    expect(args.receiver_id).toBe('v0.mosaec.testnet');
    expect(args.amount).toBe('100000000');
    expect(JSON.parse(args.msg)).toEqual({
      fill: {
        pack: PACK,
        terms: { k_token: USDC, k_amount: '107500000', term_ns: 600000000000 },
        contents_hash: 'ab',
      },
    });
  });

  it('exercises by paying K to the pack', () => {
    const args = JSON.parse(
      calls.exercise({ pack: PACK, kToken: USDC, kAmount: 107_500_000n }).args,
    ) as Record<string, string>;
    expect(args).toEqual({
      receiver_id: PACK,
      token_id: USDC,
      amount: '107500000',
      msg: '"exercise"',
    });
  });

  it('writes the offer expiry as an exact u64', () => {
    const offer = calls.offer({
      pack: PACK,
      tokenIds: [ZEC],
      terms: TERMS,
      payToken: USDC,
      price: 100_000_000n,
      offerExpiresAtNs: 4611686018427387903n,
    });
    expect(offer.args).toContain('"offer_expires_at_ns":4611686018427387903');
    expect(offer.gas).toBe(GAS.offer);
  });

  it('refuses a term outside the network bounds and a zero price', () => {
    const base = { pack: PACK, tokenIds: [ZEC], payToken: USDC, offerExpiresAtNs: 1n };
    expect(() => calls.offer({ ...base, terms: { ...TERMS, termNs: 1n }, price: 1n })).toThrow(
      RangeError,
    );
    expect(() => calls.offer({ ...base, terms: TERMS, price: 0n })).toThrow(RangeError);
  });

  it('refuses a mainnet term shorter than seven days', () => {
    expect(() =>
      mosaecCalls('mainnet').offer({
        pack: '0.v0.mosaec.near',
        tokenIds: ['nep141:zec.omft.near'],
        terms: TERMS,
        payToken: 'x',
        price: 1n,
        offerExpiresAtNs: 1n,
      }),
    ).toThrow(RangeError);
  });

  it('tags a withdrawal destination the way the registry reads it', () => {
    const args = JSON.parse(
      calls.withdraw({
        pack: PACK,
        tokenId: USDC,
        amount: 5n,
        destination: { kind: 'verifier', accountId: 'lender.mosaec.testnet' },
      }).args,
    ) as { destination: unknown };
    expect(args.destination).toEqual({ kind: 'verifier', account_id: 'lender.mosaec.testnet' });
  });
});

describe('verifier balance calls (testnet)', () => {
  const calls = mosaecCalls('testnet');
  const zec = 'nep141:zec.mosaec.testnet';

  it('reads the token contract from a nep141 id', () => {
    expect(ftAccountOf(zec)).toBe('zec.mosaec.testnet');
    expect(() => ftAccountOf('nep245:x.near:1')).toThrow(RangeError);
  });

  it('deposits through ft_transfer_call to the verifier, credited to the sender', () => {
    const c = calls.verifierDeposit(zec, 50_000_000n);
    expect(c.receiverId).toBe('zec.mosaec.testnet');
    expect(c.methodName).toBe('ft_transfer_call');
    expect(JSON.parse(c.args)).toEqual({
      receiver_id: 'intents.mosaec.testnet',
      amount: '50000000',
      msg: '',
    });
    expect(c.deposit).toBe(1n);
  });

  it('withdraws with the verifier ft_withdraw to the wallet', () => {
    const c = calls.verifierWithdraw(zec, 'alice.testnet', 7n);
    expect(c.receiverId).toBe('intents.mosaec.testnet');
    expect(c.methodName).toBe('ft_withdraw');
    expect(JSON.parse(c.args)).toEqual({
      token: 'zec.mosaec.testnet',
      receiver_id: 'alice.testnet',
      amount: '7',
    });
    expect(c.deposit).toBe(1n);
  });

  it('registers storage with the bound the token reports', () => {
    const c = calls.ftStorageDeposit(zec, 'alice.testnet');
    expect(c.methodName).toBe('storage_deposit');
    expect(c.deposit).toBe(FT_STORAGE_DEPOSIT_YOCTO);
  });

  it('refuses zero amounts', () => {
    expect(() => calls.verifierDeposit(zec, 0n)).toThrow(RangeError);
    expect(() => calls.verifierWithdraw(zec, 'alice.testnet', 0n)).toThrow(RangeError);
  });
});

describe('finance', () => {
  it('computes LTV, fee and APR', () => {
    expect(ltvBps(100n, 200n)).toBe(5_000n);
    expect(pawnFee(100_000_000n, 107_500_000n)).toBe(7_500_000n);
    const ninetyDays = 90n * 24n * 3_600_000_000_000n;
    expect(aprBps(100_000_000n, 107_500_000n, ninetyDays)).toBe(3_041n);
  });

  it('rounds the repayment up so the rate is never undercharged', () => {
    const ninetyDays = 90n * 24n * 3_600_000_000_000n;
    const k = repaymentFor(100_000_000n, 3_000n, ninetyDays);
    expect(k).toBe(107_397_261n);
    expect(aprBps(100_000_000n, k, ninetyDays)).toBeGreaterThanOrEqual(2_999n);
  });

  it('refuses a repayment below the principal', () => {
    expect(() => pawnFee(2n, 1n)).toThrow(RangeError);
  });
});

/** Receipt shapes taken from the testnet rehearsal (short pay and stranger exercise). */
function tx(failure: boolean, code: string): RpcTxResult {
  return {
    status: { SuccessValue: 'WyIwIl0=' },
    receipts_outcome: [
      {
        outcome: {
          executor_id: 'v0.mosaec.testnet',
          logs: [],
          status: failure
            ? {
                Failure: {
                  ActionError: {
                    kind: {
                      FunctionCallError: {
                        ExecutionError: `Smart contract panicked: ${code}: caller is not the direct owner`,
                      },
                    },
                  },
                },
              }
            : { SuccessValue: '' },
        },
      },
      {
        outcome: {
          executor_id: PACK,
          logs: [
            `EVENT_JSON:{"standard":"mosaec","version":"1.0.0","event":"refused","data":{"pack":"${PACK}","sender_id":"b","code":"${code}"}}`,
          ],
          status: { SuccessValue: '' },
        },
      },
      {
        outcome: {
          executor_id: 'intents.mosaec.testnet',
          logs: [
            `EVENT_JSON:{"standard":"nep245","version":"1.0.0","event":"mt_transfer","data":[{"old_owner_id":"${PACK}","new_owner_id":"b","token_ids":["${USDC}"],"amounts":["107499999"],"memo":"refund"}]}`,
          ],
          status: { SuccessValue: '' },
        },
      },
    ],
  };
}

describe('parseOutcome', () => {
  it('reads a short pay as refused with E_AMOUNT and a refund', () => {
    expect(parseOutcome(tx(false, 'E_AMOUNT'))).toMatchObject({
      status: 'refused',
      code: 'E_AMOUNT',
      refunded: true,
    });
  });

  it('reads a stranger exercise as refused with E_HOLDER', () => {
    expect(parseOutcome(tx(true, 'E_HOLDER'))).toMatchObject({
      status: 'refused',
      code: 'E_HOLDER',
    });
  });

  it('reads a clean exercise as settled', () => {
    const settled: RpcTxResult = {
      status: { SuccessValue: '' },
      receipts_outcome: [
        {
          outcome: {
            executor_id: PACK,
            logs: [
              `EVENT_JSON:{"standard":"mosaec","version":"1.0.0","event":"contents_released","data":{"pack":"${PACK}","owed_to":"b"}}`,
            ],
            status: { SuccessValue: '' },
          },
        },
      ],
    };
    expect(parseOutcome(settled)).toMatchObject({ status: 'settled', refunded: false });
    expect(parseOutcome(settled).events[0]?.event).toBe('contents_released');
  });

  it('reads a failed transaction with its code', () => {
    const failed = { ...tx(true, 'E_STATE'), status: { Failure: {} } };
    expect(parseOutcome(failed)).toMatchObject({ status: 'failed', code: 'E_STATE' });
  });
});

describe('MosaecViews', () => {
  const POSITION =
    '{"pack":"0.v0.mosaec.testnet","position":{"index":0,"title_id":"t0","rounds":1,"stage":{"state":"written","encumbrance":{"k_token":"nep141:usdc.mosaec.testnet","k_amount":"107500000","expires_at_ns":1794360365888920934,"contents":[{"token_id":"nep141:zec.mosaec.testnet","amount":"50000000"}]},"ticket_id":"k0.1","synced":true},"payout":null,"command_in_flight":false},"title_owner":"lender.mosaec.testnet","ticket_owner":"borrower.mosaec.testnet","title_pending":false,"ticket_pending":false}';

  function fakeRpc(viewResult: string): NearRpc {
    const bytes = [...new TextEncoder().encode(viewResult)];
    return new NearRpc('https://rpc.test', () =>
      Promise.resolve(
        new Response(JSON.stringify({ jsonrpc: '2.0', id: 'mosaec', result: { result: bytes } })),
      ),
    );
  }

  it('reads a position with its exact deadline', async () => {
    const view = await new MosaecViews('testnet', fakeRpc(POSITION)).positionOf(PACK);
    expect(view?.title_owner).toBe('lender.mosaec.testnet');
    expect(
      view?.position.stage.state === 'written' && view.position.stage.encumbrance.expires_at_ns,
    ).toBe(1794360365888920934n);
  });

  it('returns undefined for an unknown pack', async () => {
    await expect(
      new MosaecViews('testnet', fakeRpc('null')).positionOf('9.x'),
    ).resolves.toBeUndefined();
  });

  it('turns an RPC outage into UPSTREAM_RPC', async () => {
    const down = new NearRpc('https://rpc.test', () => Promise.reject(new Error('offline')));
    await expect(new MosaecViews('testnet', down).config()).rejects.toMatchObject({
      code: 'UPSTREAM_RPC',
    });
  });
});
