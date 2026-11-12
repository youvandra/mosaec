import { ASSETS } from '@mosaec/config/assets';
import { DESK_ACCOUNTS, deskPolicy } from '@mosaec/config/desk';

import { buildLedger } from './desk-ledger';

import type { DeskRepository } from '../repositories/desk-repository';
import type { AssetSymbol, NetworkId } from '@mosaec/config/assets';

/** Verifier balances the desk page shows. */
export interface DeskBalanceProbe {
  balanceOf(network: NetworkId, accountId: string, tokenId: string): Promise<bigint>;
}

const SHOWN: readonly AssetSymbol[] = ['USDC', 'ZEC', 'BTC', 'SOL'];
const DAY_MS = 86_400_000;
/** Collects listed on the ledger reach back this far. */
const COLLECT_WINDOW_MS = 7 * DAY_MS;

/** The public face of the house desk: holdings, results, policy and the decision log. */
export class DeskService {
  constructor(
    private readonly desk: DeskRepository,
    private readonly chain: DeskBalanceProbe,
  ) {}

  private balances(network: NetworkId, accountId: string) {
    return Promise.all(
      SHOWN.map(async (symbol) => {
        const tokenId = ASSETS[symbol].tokenIds[network];
        const amount = await this.chain.balanceOf(network, accountId, tokenId).catch(() => null);
        return {
          symbol,
          tokenId,
          decimals: ASSETS[symbol].decimals,
          amount: amount?.toString() ?? null,
        };
      }),
    );
  }

  /** The desk's books: treasury, loans out, results, rate card, rules and recent moves. */
  async ledger(network: NetworkId, now: Date = new Date()) {
    const accountId = DESK_ACCOUNTS[network];
    const [balances, fills, collects, cards, currentCards, control, prices] = await Promise.all([
      this.balances(network, accountId),
      this.desk.fills(network),
      this.desk.collects(network, new Date(now.getTime() - COLLECT_WINDOW_MS)),
      this.desk.rateCards(network, new Date(now.getTime() - DAY_MS)),
      this.desk.latestCards(network),
      this.desk.control(network),
      this.desk.latestPrices(),
    ]);
    return buildLedger({
      network,
      accountId,
      policy: deskPolicy(network),
      now,
      balances,
      fills,
      collects,
      cards,
      currentCards,
      control,
      prices,
    });
  }

  async overview(network: NetworkId) {
    const accountId = DESK_ACCOUNTS[network];
    const policy = deskPolicy(network);
    const [fills, prices, balances, control] = await Promise.all([
      this.desk.fills(network),
      this.desk.latestPrices(),
      this.balances(network, accountId),
      this.desk.control(network),
    ]);
    const sum = (values: readonly string[]) => values.reduce((total, v) => total + BigInt(v), 0n);
    const running = fills.filter((f) => f.state === 'written' && f.titleOwner === accountId);
    const repaid = fills.filter((f) => f.lastOutcome === 'Redeemed' && f.state !== 'written');
    const kept = fills.filter((f) => f.lastOutcome === 'Forfeited' && f.state !== 'written');
    return {
      network,
      accountId,
      policy: {
        ...policy,
        /* The kill switch pauses the desk as surely as the config flag; badges read this one field. */
        paused: policy.paused || control?.paused === true,
        minTermNs: policy.minTermNs.toString(),
        maxTermNs: policy.maxTermNs.toString(),
        minFillUsdc: policy.minFillUsdc.toString(),
        maxFillUsdc: policy.maxFillUsdc.toString(),
        maxExposureUsdc: policy.maxExposureUsdc.toString(),
        dailyBudgetUsdc: policy.dailyBudgetUsdc.toString(),
      },
      balances: balances.filter(
        (b) => b.symbol === 'USDC' || (b.amount !== null && b.amount !== '0'),
      ),
      stats: {
        fills: fills.length,
        lentUsdc: sum(fills.map((f) => f.principal)).toString(),
        openExposureUsdc: sum(running.map((f) => f.principal)).toString(),
        running: running.length,
        repaid: repaid.length,
        earnedUsdc: sum(repaid.map((f) => f.interest)).toString(),
        coinsKept: kept.length,
      },
      prices: prices.map((p) => ({
        symbol: p.symbol,
        usd: p.usd,
        observedAt: p.observedAt.toISOString(),
      })),
    };
  }

  async decisions(network: NetworkId, limit: number) {
    const rows = await this.desk.decisions(network, limit);
    return rows.map((row) => ({
      id: row.id.toString(),
      decidedAt: row.decidedAt.toISOString(),
      runId: row.runId,
      packId: row.packId,
      verdict: row.verdict,
      code: row.code,
      reason: row.reason,
      quote: row.quote,
      principal: row.principal,
      txHash: row.txHash,
      actor: row.actor,
    }));
  }
}
