import { ASSETS, assetByTokenId } from '@mosaec/config/assets';
import { FAIR_MONTHLY_RATE_BPS, rateBounds } from '@mosaec/config/rates';

import type {
  ControlRecord,
  DecisionRecord,
  DeskFillRow,
  PriceRecord,
  RateCardRecord,
} from '../repositories/desk-repository';
import type { AssetSymbol, NetworkId } from '@mosaec/config/assets';
import type { DeskPolicy } from '@mosaec/config/desk';
import type { CollateralSymbol } from '@mosaec/config/rates';

const BPS = 10_000n;
const USD_MICRO = 1_000_000;
/** Most events the ledger lists. */
export const LEDGER_EVENTS = 30;

export interface LedgerInput {
  readonly network: NetworkId;
  readonly accountId: string;
  readonly policy: DeskPolicy;
  readonly now: Date;
  readonly balances: readonly {
    readonly symbol: AssetSymbol;
    readonly tokenId: string;
    readonly decimals: number;
    readonly amount: string | null;
  }[];
  readonly fills: readonly DeskFillRow[];
  readonly collects: readonly DecisionRecord[];
  /** Cards of the last 24 hours, newest first. */
  readonly cards: readonly RateCardRecord[];
  /** The newest card per coin. */
  readonly currentCards: readonly RateCardRecord[];
  readonly control: ControlRecord | null;
  readonly prices: readonly PriceRecord[];
}

export type LedgerEvent =
  | {
      readonly kind: 'fill' | 'collect';
      readonly at: string;
      readonly packId: string | null;
      readonly symbol: string | null;
      readonly amount: string;
      readonly decimals: number | null;
      readonly txHash: string | null;
      readonly actor: string;
    }
  | {
      readonly kind: 'card';
      readonly at: string;
      readonly asset: string;
      readonly monthlyBps: number;
      readonly previousBps: number | null;
      readonly source: string;
      readonly reason: string;
    }
  | { readonly kind: 'pause' | 'resume'; readonly at: string; readonly reason: string };

const sum = (values: readonly bigint[]) => values.reduce((total, v) => total + v, 0n);

function utcMidnight(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function isCollateral(symbol: string): symbol is CollateralSymbol {
  return Object.hasOwn(FAIR_MONTHLY_RATE_BPS, symbol);
}

/** USDC units of `amount` coins at `usd` per whole coin. */
function markUsdc(amount: bigint, decimals: number, usd: number): bigint {
  return (amount * BigInt(Math.round(usd * USD_MICRO))) / 10n ** BigInt(decimals);
}

function serialPolicy(policy: DeskPolicy) {
  return {
    ...policy,
    minTermNs: policy.minTermNs.toString(),
    maxTermNs: policy.maxTermNs.toString(),
    minFillUsdc: policy.minFillUsdc.toString(),
    maxFillUsdc: policy.maxFillUsdc.toString(),
    maxExposureUsdc: policy.maxExposureUsdc.toString(),
    dailyBudgetUsdc: policy.dailyBudgetUsdc.toString(),
  };
}

function card(row: RateCardRecord) {
  const symbol = isCollateral(row.asset) ? row.asset : null;
  return {
    asset: row.asset,
    monthlyBps: row.monthlyBps,
    maxLtvBps: row.maxLtvBps,
    fairMonthlyBps: symbol === null ? null : FAIR_MONTHLY_RATE_BPS[symbol],
    minMonthlyBps: symbol === null ? null : rateBounds(symbol).minMonthlyBps,
    source: row.source,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Card events: only cards that moved the rate or the loan to value from the coin's last card. */
function cardEvents(cards: readonly RateCardRecord[]): LedgerEvent[] {
  const oldestFirst = [...cards].reverse();
  const last = new Map<string, RateCardRecord>();
  const events: LedgerEvent[] = [];
  for (const row of oldestFirst) {
    const previous = last.get(row.asset);
    last.set(row.asset, row);
    if (previous?.monthlyBps === row.monthlyBps && previous.maxLtvBps === row.maxLtvBps) {
      continue;
    }
    events.push({
      kind: 'card',
      at: row.createdAt.toISOString(),
      asset: row.asset,
      monthlyBps: row.monthlyBps,
      previousBps: previous?.monthlyBps ?? null,
      source: row.source,
      reason: row.reason,
    });
  }
  return events;
}

interface StoredIntentsMark {
  readonly amountOutUsdc: string;
  readonly quotedAt: string;
}

/**
 * NEAR Intents dry quotes the desk stored when it collected kept coins, keyed `pack:symbol`.
 * Quotes only: the desk never executed them.
 */
function intentsMarksByPack(network: NetworkId, collects: readonly DecisionRecord[]) {
  const marks = new Map<string, StoredIntentsMark>();
  for (const row of collects) {
    const line = (row.quote ?? {}) as { tokenId?: string; intents?: Partial<StoredIntentsMark> };
    const symbol = assetByTokenId(network, line.tokenId ?? '')?.symbol;
    const out = line.intents?.amountOutUsdc;
    if (row.packId === null || symbol === undefined) continue;
    if (typeof out !== 'string' || !/^\d+$/.test(out)) continue;
    marks.set(`${row.packId}:${symbol}`, {
      amountOutUsdc: out,
      quotedAt:
        typeof line.intents?.quotedAt === 'string'
          ? line.intents.quotedAt
          : row.decidedAt.toISOString(),
    });
  }
  return marks;
}

/**
 * The desk's books from its own records and the chain: what it holds, what is out, what it
 * earned, what it kept, how it prices and every move it made. Pure, so tests pin every number.
 */
export function buildLedger(input: LedgerInput) {
  const { policy, fills, now } = input;
  const running = fills.filter((f) => f.outcome === 'running');
  const repaid = fills.filter((f) => f.outcome === 'Redeemed');
  const forfeited = fills.filter((f) => f.outcome === 'Forfeited');
  const lentNow = sum(running.map((f) => BigInt(f.principal)));
  const midnight = utcMidnight(now);
  const today = fills.filter((f) => f.decidedAt >= midnight);
  const lentToday = sum(today.map((f) => BigInt(f.principal)));
  /* The desk gives back the budget of a loan repaid the same day, so the ledger does too. */
  const budgetUsed = sum(
    today.filter((f) => f.outcome !== 'Redeemed').map((f) => BigInt(f.principal)),
  );
  const budgetLeft = policy.dailyBudgetUsdc - budgetUsed;
  const priceOf = new Map(input.prices.map((p) => [p.symbol, Number(p.usd)]));

  const intentsMarks = intentsMarksByPack(input.network, input.collects);
  const keptCoins = forfeited.flatMap((f) => {
    if (f.collateral === null || !isCollateral(f.collateral.symbol)) return [];
    const { decimals } = ASSETS[f.collateral.symbol];
    const quoted = intentsMarks.get(`${f.packId}:${f.collateral.symbol}`);
    const usd = priceOf.get(f.collateral.symbol);
    const amount = BigInt(f.collateral.amount);
    const reference = usd === undefined ? null : markUsdc(amount, decimals, usd).toString();
    return [
      {
        packId: f.packId,
        symbol: f.collateral.symbol,
        amount: f.collateral.amount,
        decimals,
        principal: f.principal,
        markUsdc: quoted?.amountOutUsdc ?? reference,
        markSource: quoted === undefined ? ('reference' as const) : ('near-intents' as const),
        quotedAt: quoted?.quotedAt ?? null,
      },
    ];
  });

  const configPaused = policy.paused;
  const pausedBy = input.control?.paused === true ? input.control : null;
  const switchPaused = pausedBy !== null;
  const events: LedgerEvent[] = [
    ...fills.map((f): LedgerEvent => ({
      kind: 'fill',
      at: f.decidedAt.toISOString(),
      packId: f.packId,
      symbol: 'USDC',
      amount: f.principal,
      decimals: ASSETS.USDC.decimals,
      txHash: f.txHash,
      actor: f.actor,
    })),
    ...input.collects.map((row): LedgerEvent => {
      const line = (row.quote ?? {}) as { tokenId?: string; amount?: string };
      const asset = assetByTokenId(input.network, line.tokenId ?? '');
      return {
        kind: 'collect',
        at: row.decidedAt.toISOString(),
        packId: row.packId,
        symbol: asset?.symbol ?? null,
        amount: line.amount ?? '0',
        decimals: asset?.decimals ?? null,
        txHash: row.txHash,
        actor: row.actor,
      };
    }),
    ...cardEvents(input.cards),
    ...(input.control === null
      ? []
      : [
          {
            kind: input.control.paused ? ('pause' as const) : ('resume' as const),
            at: input.control.updatedAt.toISOString(),
            reason: input.control.reason,
          },
        ]),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, LEDGER_EVENTS);

  return {
    network: input.network,
    accountId: input.accountId,
    generatedAt: now.toISOString(),
    status: {
      state: configPaused || switchPaused ? ('paused' as const) : ('live' as const),
      by: configPaused ? ('config' as const) : switchPaused ? ('switch' as const) : null,
      reason: configPaused ? 'Paused in the desk policy.' : switchPaused ? pausedBy.reason : null,
      since: pausedBy === null ? null : pausedBy.updatedAt.toISOString(),
    },
    treasury: {
      balances: input.balances,
      usdc: input.balances.find((b) => b.symbol === 'USDC')?.amount ?? null,
    },
    book: {
      fills: fills.length,
      lentTotalUsdc: sum(fills.map((f) => BigInt(f.principal))).toString(),
      lentNowUsdc: lentNow.toString(),
      running: running.length,
      repaid: repaid.length,
      realisedInterestUsdc: sum(repaid.map((f) => BigInt(f.interest))).toString(),
      forfeited: forfeited.length,
      keptCoins,
      utilisationBps:
        policy.maxExposureUsdc === 0n ? 0 : Number((lentNow * BPS) / policy.maxExposureUsdc),
      lentTodayUsdc: lentToday.toString(),
      budgetLeftTodayUsdc: (budgetLeft > 0n ? budgetLeft : 0n).toString(),
    },
    rateCard: {
      current: input.currentCards.map(card),
      history: input.cards.map(card),
    },
    policy: serialPolicy(policy),
    events,
  };
}

export type DeskLedger = ReturnType<typeof buildLedger>;
