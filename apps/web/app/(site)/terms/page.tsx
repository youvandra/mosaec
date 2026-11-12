import Link from 'next/link';

import { SITE } from '../../../lib/site';
import { LegalPage } from '../_components/LegalPage';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms',
  description: 'The terms for using the Mosaec site, app and contracts.',
};

export default function TermsPage() {
  return (
    <LegalPage
      tag="Terms"
      title="Terms of use."
      updated="12 November 2026"
      lead={
        <>
          These terms cover this website, the app at {SITE.appUrl} and the public interfaces to the
          Mosaec contracts. Using them means you accept these terms.
        </>
      }
      sections={[
        {
          title: 'Testnet software',
          body: (
            <p>
              Mosaec currently runs on NEAR testnet only. Test ZEC, BTC, SOL and USDC have no value
              and can be reset. Mainnet is not live.
            </p>
          ),
        },
        {
          title: 'You hold your keys',
          body: (
            <p>
              Mosaec never holds your keys or signs for you. Every transaction is built in your
              browser and signed in your own wallet. You are responsible for what you sign.
            </p>
          ),
        },
        {
          title: 'Provided as is',
          body: (
            <p>
              The site, app and contracts are provided as is, without warranty of any kind. To the
              extent the law allows, the Mosaec team is not liable for any loss from using them,
              including lost coins, failed transactions or wrong data on a page.
            </p>
          ),
        },
        {
          title: 'Read the risks',
          body: (
            <p>
              A pawn can end with the borrower losing the coins or the lender holding coins worth
              less than the loan. The <Link href="/risks">Risks</Link> page explains how.
            </p>
          ),
        },
        {
          title: 'Fair use',
          body: (
            <ul>
              <li>No use that breaks the law where you live, including sanctions law.</li>
              <li>No attacks on the site, the API, the faucet or other users.</li>
              <li>
                Found a bug in a contract? Report it to{' '}
                <a href={`mailto:${SITE.securityEmail}`}>{SITE.securityEmail}</a> before you publish
                it.
              </li>
            </ul>
          ),
        },
        {
          title: 'Open source',
          body: (
            <p>
              The code is published at <a href={SITE.sourceUrl}>{SITE.sourceUrl}</a> under its
              licence. These terms cover the hosted site and app, not your own copy of the code.
            </p>
          ),
        },
        {
          title: 'Changes',
          body: (
            <p>
              We may update these terms; the date at the top changes when we do. Questions:{' '}
              <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>.
            </p>
          ),
        },
      ]}
    />
  );
}
