import { describe, expect, it } from 'vitest';

import { packStatusSchema, parseContractJson, positionViewSchema } from '@mosaec/domain';

import { packRow } from './refresh';

const FREE_VIEW = positionViewSchema.parse(
  parseContractJson(
    '{"pack":"5.v0.mosaec.testnet","position":{"index":5,"title_id":"t5","rounds":0,"stage":{"state":"free"},"payout":null,"command_in_flight":false},"title_owner":"mosaec.testnet","ticket_owner":null,"title_pending":false,"ticket_pending":false}',
  ),
);
const FREE_STATUS = packStatusSchema.parse(
  parseContractJson(
    '{"registry":"v0.mosaec.testnet","verifier":"intents.mosaec.testnet","phase":{"state":"free"},"delivery_in_flight":false,"exercise_in_flight":false,"exercise_deadline_ns":null}',
  ),
);
const EXTRA = { refreshedHeight: 1n, lastOutcome: null, mintedHeight: 1n } as const;

describe('packRow', () => {
  it('records what a free pack holds in the verifier', () => {
    const row = packRow('testnet', FREE_VIEW, FREE_STATUS, EXTRA, [
      { token_id: 'nep141:zec.mosaec.testnet', amount: 50_000_000n },
    ]);
    expect(row.state).toBe('free');
    expect(row.contents).toEqual([{ token_id: 'nep141:zec.mosaec.testnet', amount: '50000000' }]);
  });

  it('leaves an empty free pack without contents', () => {
    expect(packRow('testnet', FREE_VIEW, FREE_STATUS, EXTRA).contents).toBeNull();
  });
});
