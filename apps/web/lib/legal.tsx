import Link from 'next/link';

/** Small print under every confirm that opens a wallet. */
export const SIGN_FOOTNOTE = (
  <>
    Testnet, unaudited contracts. Signing accepts the <Link href="/terms">Terms</Link> and the{' '}
    <Link href="/risks">Risks</Link>.
  </>
);
