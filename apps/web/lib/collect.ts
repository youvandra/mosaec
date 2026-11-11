/** What a free pack holds for its Title holder after a pawn ends, in the words the app uses. */
export interface Payout {
  /** `repayment`: the borrower paid; `coins`: the term ran out unpaid; `own`: coins never pawned. */
  readonly kind: 'repayment' | 'coins' | 'own';
  readonly title: string;
  readonly label: string;
  readonly note: string;
}

/**
 * Wording for the contents of a free pack. A repayment and kept coins are the lender's earnings,
 * so they read as "to collect"; coins the holder put in and never pawned read as a plain withdraw.
 */
export function payoutOf(status: string | null | undefined, contentsText: string): Payout {
  if (status === 'Redeemed') {
    return {
      kind: 'repayment',
      title: 'Collect the repayment',
      label: `Collect ${contentsText}`,
      note: `The borrower repaid ${contentsText}. It waits in the pack until you collect it.`,
    };
  }
  if (status === 'Forfeited') {
    return {
      kind: 'coins',
      title: 'Collect the coins',
      label: `Collect ${contentsText}`,
      note: `The term ended unpaid, so ${contentsText} is yours. It waits in the pack until you collect it.`,
    };
  }
  return {
    kind: 'own',
    title: 'Withdraw the contents',
    label: 'Withdraw to My Balance',
    note: `Moves ${contentsText} to your verifier balance.`,
  };
}
