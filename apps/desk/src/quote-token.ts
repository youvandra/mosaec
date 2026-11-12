import { createHmac, timingSafeEqual } from 'node:crypto';

/** The terms an instant quote promises. Every field is part of the signature. */
export interface QuoteTerms {
  readonly network: string;
  readonly asset: string;
  /** Coin amount in the pack, smallest unit. */
  readonly amount: bigint;
  /** USDC the desk lends, smallest unit. */
  readonly principal: bigint;
  /** USDC the borrower repays, smallest unit. */
  readonly repayment: bigint;
  readonly termNs: bigint;
  /** Unix milliseconds after which the desk no longer honours the quote. */
  readonly expiresAtMs: number;
  readonly cardId: string;
}

function canonical(terms: QuoteTerms): string {
  return [
    'mosaec-instant-v1',
    terms.network,
    terms.asset,
    terms.amount.toString(),
    terms.principal.toString(),
    terms.repayment.toString(),
    terms.termNs.toString(),
    terms.expiresAtMs.toString(),
    terms.cardId,
  ].join('|');
}

/**
 * Stateless quote ids: an HMAC over the quoted terms with a server secret. The desk keeps no
 * table of quotes; a fill presents the terms and the id, and the id proves the desk issued them.
 */
export class QuoteSigner {
  constructor(private readonly secret: string) {}

  sign(terms: QuoteTerms): string {
    return createHmac('sha256', this.secret).update(canonical(terms)).digest('hex');
  }

  verify(terms: QuoteTerms, quoteId: string): boolean {
    const expected = Buffer.from(this.sign(terms), 'hex');
    const given = Buffer.from(quoteId, 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  }
}
