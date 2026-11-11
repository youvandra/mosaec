import { ASSETS } from '@mosaec/config/assets';
import { DESK_ACCOUNTS, deskPolicy } from '@mosaec/config/desk';

import type { DeskRepository } from '../repositories/desk-repository';
import type { AssetSymbol, NetworkId } from '@mosaec/config/assets';

/** Verifier balances the desk page shows. */
export interface DeskBalanceProbe {
  balanceOf(network: NetworkId, accountId: string, tokenId: string): Promise<bigint>;
}

const SHOWN: readonly AssetSymbol[] = ['USDC', 'ZEC', 'BTC', 'SOL'];

/** The public face of the house desk: holdings, results, policy and the decision log. */
export class DeskService {
  constructor(
    private readonly desk: DeskRepository,
    private readonly chain: DeskBalanceProbe,
  ) {}

  async overview(network: NetworkId) {
    const accountId = DESK_ACCOUNTS[network];
    const policy = deskPolicy(network);
    const [fills, prices, balances] = await Promise.all([
      this.desk.fills(network),
      this.desk.latestPrices(),
      Promise.all(
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
      ),
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
