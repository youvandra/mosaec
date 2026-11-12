import { ASSETS } from '@mosaec/config/assets';
import { DESK_ACCOUNTS } from '@mosaec/config/desk';

import type { DeskSymbol } from './prices';

/*
 * Intents has no testnet, so test coins are priced as their mainnet twins (same decimals).
 * USDC is NEAR-native USDC, the token 1Click settles stablecoin quotes in.
 */
const USDC_ON_NEAR = ASSETS.USDC.tokenIds.mainnet;
const ENDPOINT = 'https://1click.chaindefuser.com/v0/quote';
/** Placeholder recipient for a dry quote: nothing is deposited, so no account receives funds. */
const DRY_RECIPIENT = DESK_ACCOUNTS.mainnet;
const TIMEOUT_MS = 10_000;

/** What the desk could sell kept coins for, as quoted by a 1Click solver. Never executed. */
export interface IntentsMark {
  readonly source: 'near-intents';
  readonly dry: true;
  /** USDC out in base units (6 decimals). */
  readonly amountOutUsdc: string;
  readonly quotedAt: string;
  readonly correlationId: string | null;
}

interface QuoteResponse {
  readonly quote?: { readonly amountOut?: unknown };
  readonly timestamp?: unknown;
  readonly correlationId?: unknown;
}

/**
 * Asks NEAR Intents (1Click) what kept coins would fetch in USDC, with `dry: true`: a real solver
 * price and no deposit address, so nothing can be sent. A failure returns null and the ledger
 * keeps the reference price.
 */
export class IntentsQuotes {
  constructor(
    private readonly partnerJwt: string | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async toUsdc(symbol: DeskSymbol, amount: bigint): Promise<IntentsMark | null> {
    if (amount <= 0n) return null;
    const deadline = new Date(this.now().getTime() + 10 * 60_000).toISOString();
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.partnerJwt !== undefined) headers.authorization = `Bearer ${this.partnerJwt}`;
    try {
      const response = await this.fetchImpl(ENDPOINT, {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        body: JSON.stringify({
          dry: true,
          swapType: 'EXACT_INPUT',
          slippageTolerance: 100,
          originAsset: ASSETS[symbol].tokenIds.mainnet,
          depositType: 'INTENTS',
          destinationAsset: USDC_ON_NEAR,
          amount: amount.toString(),
          refundTo: DRY_RECIPIENT,
          refundType: 'INTENTS',
          recipient: DRY_RECIPIENT,
          recipientType: 'INTENTS',
          deadline,
        }),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as QuoteResponse;
      const out = body.quote?.amountOut;
      if (typeof out !== 'string' || !/^\d+$/.test(out) || out === '0') return null;
      return {
        source: 'near-intents',
        dry: true,
        amountOutUsdc: out,
        quotedAt: typeof body.timestamp === 'string' ? body.timestamp : this.now().toISOString(),
        correlationId: typeof body.correlationId === 'string' ? body.correlationId : null,
      };
    } catch {
      return null;
    }
  }
}
