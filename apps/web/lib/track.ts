/**
 * Funnel steps sent to Umami. Names only: never an account, an amount or a pack id, so a step
 * count cannot be tied back to a wallet.
 */
export type FunnelEvent =
  | 'wallet_connected'
  | 'borrow_started'
  | 'offer_signed'
  | 'fill_started'
  | 'fill_settled'
  | 'redeem_settled'
  | 'faucet_claimed';

interface Umami {
  track: (event: string) => void;
}

/** Counts one step; a no-op when analytics is off or blocked. */
export function track(event: FunnelEvent): void {
  if (typeof window === 'undefined') return;
  try {
    (window as Window & { umami?: Umami }).umami?.track(event);
  } catch {
    /* Analytics never breaks the page. */
  }
}
