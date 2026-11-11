import { ASSETS } from '@mosaec/config/assets';
import { DEFAULT_NETWORK } from '@mosaec/config/networks';

import { getPackDetails, listOffers, listPacks } from './api';
import { dealOf, liveDealOf } from './deal';
import { SUGGESTED_MONTHLY_RATE_BPS, TERM_OPTIONS, suggestedRepayment } from './rates';

import type { Pack } from './api';
import type { Deal } from './deal';

export interface ActivityEntry {
  readonly packId: string;
  readonly index: string;
  readonly deal: Deal;
}

const HISTORY_DEPTH = 24;
const USDC = ASSETS.USDC;

export interface MarketData {
  readonly offers: readonly Pack[];
  readonly activity: readonly ActivityEntry[];
}

/** Open offers plus the latest pawns rebuilt as deals; `null` when the API is down. */
export async function loadMarket(): Promise<MarketData | null> {
  try {
    const [offers, all] = await Promise.all([
      listOffers(DEFAULT_NETWORK),
      listPacks(DEFAULT_NETWORK, 100),
    ]);
    const recent = [...all]
      .sort((a, b) => Number(BigInt(b.index) - BigInt(a.index)))
      .slice(0, HISTORY_DEPTH);
    const details = await getPackDetails(
      DEFAULT_NETWORK,
      recent.map((pack) => pack.id),
    ).catch(() => []);
    const byId = new Map(details.map((detail) => [detail.id, detail]));
    const activity = recent.map((pack) => {
      const detail = byId.get(pack.id);
      return {
        packId: pack.id,
        index: pack.index,
        deal: detail === undefined ? liveDealOf(pack) : dealOf(DEFAULT_NETWORK, detail),
      };
    });
    return { offers, activity };
  } catch {
    return null;
  }
}

/** A worked example at the suggested ZEC rate, shown while the book is empty. */
export function exampleDeal(): Deal {
  const term = TERM_OPTIONS.find((option) => option.id === 'd90');
  const principal = 500n * 10n ** BigInt(USDC.decimals);
  const termNs = term?.termNs ?? 0n;
  const repayment = suggestedRepayment(principal, SUGGESTED_MONTHLY_RATE_BPS.ZEC ?? 0, termNs);
  const usdc = (amount: bigint) => ({
    tokenId: USDC.tokenIds[DEFAULT_NETWORK],
    symbol: USDC.symbol,
    decimals: USDC.decimals,
    amount: amount.toString(),
  });
  return {
    collateral: [
      {
        tokenId: ASSETS.ZEC.tokenIds[DEFAULT_NETWORK],
        symbol: 'ZEC',
        decimals: ASSETS.ZEC.decimals,
        amount: (10n ** BigInt(ASSETS.ZEC.decimals)).toString(),
      },
    ],
    principal: usdc(principal),
    repayment: usdc(repayment),
    termNs: termNs.toString(),
    listedAtNs: null,
    filledAtNs: null,
    dueNs: null,
    settledAtNs: null,
    borrower: null,
    lender: null,
    outcome: 'listed',
  };
}
