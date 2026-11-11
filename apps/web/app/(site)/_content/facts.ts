/**
 * Measured numbers shown on the landing. Each one carries the date it was measured; the
 * scripts that produce them are in the project's research notes.
 */
export const LIQUIDATION_REPLAY = {
  measuredOn: '10 Nov 2026',
  venue: 'Rhea',
  window: '27 Oct 2025 to 27 Oct 2026',
  events: '1,337',
  accounts: '39',
  seizedZec: '3,218',
  saleValue: '$951k',
  higherAt30d: '20.9%',
  higherAt90d: '83.9%',
  valueToday: '$3.31M',
} as const;

/** 90-day pawns at 50% LTV over every ZEC start date from 2017 to 2026. */
export const ROLLING_REPLAY = {
  measuredOn: '11 Nov 2026',
  span: '2017 to 2026',
  ltv: '50%',
  termDays: 90,
  pawnForfeit: '10.7%',
  liquidated: '34.6%',
} as const;

/** The worked example on the landing: 1 ZEC at 50% LTV for 90 days at the ZEC rate of 2.5% a month. */
export const EXAMPLE_PAWN = {
  collateral: '1.00',
  principal: '500.00',
  repayment: '537.50',
  termDays: 90,
  monthlyRate: '2.5%',
} as const;
