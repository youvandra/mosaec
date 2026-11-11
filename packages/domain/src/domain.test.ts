import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { EVENT_NAMES, parseContractJson, parseEventLog, positionViewSchema } from './schemas';
import { DUE_SOON_NS, liveStatus, outcomeOf } from './status';
import { formatUnits, parseUnits, UnitsError } from './units';

import type { PositionView } from './schemas';

/** `position_of` exactly as testnet returned it for `0.v0.mosaec.testnet` after the fill. */
const WRITTEN_JSON =
  '{"pack":"0.v0.mosaec.testnet","position":{"index":0,"title_id":"t0","rounds":1,"stage":{"state":"written","encumbrance":{"k_token":"nep141:usdc.mosaec.testnet","k_amount":"107500000","expires_at_ns":1794360365888920934,"contents":[{"token_id":"nep141:zec.mosaec.testnet","amount":"50000000"}]},"ticket_id":"k0.1","synced":true},"payout":null,"command_in_flight":false},"title_owner":"lender.mosaec.testnet","ticket_owner":"borrower.mosaec.testnet","title_pending":false,"ticket_pending":false}';

const WRITTEN = parseContractJson(WRITTEN_JSON) as Record<string, unknown>;

const EVENTS_RS = readFileSync(
  join(import.meta.dirname, '../../../contracts/shared/src/events.rs'),
  'utf8',
);

function snake(name: string): string {
  return name.replace(/(?<!^)([A-Z])/g, '_$1').toLowerCase();
}

describe('schemas', () => {
  it('parses a live written position with bigint amounts', () => {
    const view = positionViewSchema.parse(WRITTEN);
    expect(view.position.stage.state).toBe('written');
    if (view.position.stage.state === 'written') {
      expect(view.position.stage.encumbrance.k_amount).toBe(107_500_000n);
      expect(view.position.stage.encumbrance.contents[0]?.amount).toBe(50_000_000n);
    }
  });

  it('rejects a decimal amount', () => {
    const bad = parseContractJson(WRITTEN_JSON.replace('"107500000"', '"1.5"'));
    expect(positionViewSchema.safeParse(bad).success).toBe(false);
  });

  it('keeps nanosecond times exact, which plain JSON.parse loses', () => {
    expect(positionViewSchema.safeParse(JSON.parse(WRITTEN_JSON)).success).toBe(false);
    const view = positionViewSchema.parse(WRITTEN);
    if (view.position.stage.state === 'written') {
      expect(view.position.stage.encumbrance.expires_at_ns).toBe(1794360365888920934n);
    }
  });

  it('lists exactly the events in events.rs', () => {
    const variants = [...EVENTS_RS.matchAll(/^\s{4}([A-Z]\w+) \{/gm)].map(([, name]) =>
      snake(name ?? ''),
    );
    expect([...EVENT_NAMES].sort()).toEqual(variants.sort());
  });

  it('parses an event log line and ignores other logs', () => {
    const line =
      'EVENT_JSON:{"standard":"mosaec","version":"1.0.0","event":"expired","data":{"pack":"1.v0.mosaec.near"}}';
    expect(parseEventLog(line)?.event).toBe('expired');
    expect(parseEventLog('Transfer 5 from a to b')).toBeUndefined();
    expect(parseEventLog('EVENT_JSON:{"standard":"nep171","version":"1.0.0"}')).toBeUndefined();
  });
});

describe('liveStatus', () => {
  const view: PositionView = positionViewSchema.parse(WRITTEN);
  const t = 1794360365888920934n;

  it('is Active well before T', () => {
    expect(liveStatus(view, t - DUE_SOON_NS - 1n)).toBe('Active');
  });

  it('is Due Soon inside the last three days', () => {
    expect(liveStatus(view, t - 1n)).toBe('Due Soon');
  });

  it('is Grace past T while a recorded disruption extends the deadline', () => {
    expect(liveStatus(view, t + 1n, t + 86_400_000_000_000n)).toBe('Grace');
  });

  it('is Forfeited past the deadline', () => {
    expect(liveStatus(view, t + 1n)).toBe('Forfeited');
  });

  it('is Pending while the Ticket is in flight', () => {
    expect(liveStatus({ ...view, ticket_pending: true }, t - 1n)).toBe('Pending');
  });

  it('leaves a free pack to events', () => {
    const free = positionViewSchema.parse({
      ...WRITTEN,
      position: { ...(WRITTEN.position as object), stage: { state: 'free' } },
    });
    expect(liveStatus(free, t)).toBeUndefined();
    expect(outcomeOf('contents_released')).toBe('Redeemed');
    expect(outcomeOf('expired')).toBe('Forfeited');
    expect(outcomeOf('filled')).toBeUndefined();
  });
});

describe('units', () => {
  it.each([
    [150_000_000n, 8, '1.5'],
    [107_500_000n, 6, '107.5'],
    [1n, 9, '0.000000001'],
    [0n, 6, '0'],
  ])('formats %s with %i decimals as %s', (amount, decimals, text) => {
    expect(formatUnits(amount, decimals)).toBe(text);
    expect(parseUnits(text, decimals)).toBe(amount);
  });

  it('refuses extra decimal places and non-numbers', () => {
    expect(() => parseUnits('1.123', 2)).toThrow(UnitsError);
    expect(() => parseUnits('abc', 6)).toThrow(UnitsError);
    expect(() => parseUnits('-1', 6)).toThrow(UnitsError);
  });
});
