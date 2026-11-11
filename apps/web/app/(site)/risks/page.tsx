import Link from 'next/link';

import { NETWORKS } from '@mosaec/config/networks';

import { SITE } from '../../../lib/site';
import { LegalPage } from '../_components/LegalPage';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Risks',
  description: 'What can go wrong with a Mosaec pawn, for a borrower and for a lender.',
};

export default function RisksPage() {
  return (
    <LegalPage
      tag="Risks"
      title="Know the risks before you sign."
      updated="12 November 2026"
      lead={
        <>
          Mosaec runs on NEAR testnet with test tokens that have no value. The contracts have had no
          independent review yet. Read this before you use any version with real funds.
        </>
      }
      sections={[
        {
          title: 'Borrowers can lose their coins',
          body: (
            <>
              <p>
                Pay the repayment before the date or the Title holder keeps every coin in the pack.
                This holds whatever the coins are worth at that moment, even far above the loan.
              </p>
              <p>
                There is no reminder on chain and no grace for a missed date. The only extension is
                a 24-hour window after a recorded NEAR Intents pause or lock in the last day of the
                term.
              </p>
            </>
          ),
        },
        {
          title: 'Lenders can receive coins worth less than the loan',
          body: (
            <p>
              Nothing reads a price. If the coins fall and the borrower walks away, the lender keeps
              coins that may be worth less than the USDC lent. No liquidation protects either side.
            </p>
          ),
        },
        {
          title: 'Rights move with their NFTs',
          body: (
            <p>
              The Title and the Ticket are NFTs. Whoever holds the Ticket can redeem; whoever holds
              the Title receives the repayment or the coins. A transfer cannot be undone, and a
              Ticket held inside NEAR Intents must come out to a wallet before it can redeem.
            </p>
          ),
        },
        {
          title: 'Smart contract and dependency risk',
          body: (
            <ul>
              <li>
                The registry and pack contracts are unaudited. A bug could lock or lose funds.
              </li>
              <li>
                Packs hold balances inside NEAR Intents (
                <code>{NETWORKS.mainnet.verifierAccountId}</code> on mainnet). Its rules, pauses and
                upgrades apply to every pack.
              </li>
              <li>Bridges that bring ZEC, BTC or SOL to NEAR carry their own risks and delays.</li>
            </ul>
          ),
        },
        {
          title: 'This site can be wrong',
          body: (
            <p>
              Pages read an indexer and reference prices that can lag or fail. The chain is the
              record. Check any pack yourself on <Link href="/verify">Verify</Link> or with the
              commands in the <Link href="/docs#verify">Docs</Link>.
            </p>
          ),
        },
        {
          title: 'No advice',
          body: (
            <p>
              Mosaec publishes software. Nothing here is financial, legal or tax advice. Questions:{' '}
              <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>.
            </p>
          ),
        },
      ]}
    />
  );
}
