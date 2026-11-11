import { SITE } from '../../../lib/site';
import { LegalPage } from '../_components/LegalPage';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What the Mosaec site and app store, send and never collect.',
};

export default function PrivacyPage() {
  return (
    <LegalPage
      tag="Privacy"
      title="Privacy."
      updated="12 November 2026"
      lead={
        <>
          Mosaec has no accounts, no sign-up and no cookies. What remains is listed below, with
          where it goes.
        </>
      }
      sections={[
        {
          title: 'On chain is public',
          body: (
            <p>
              Your NEAR account, your packs, Titles, Tickets and every transaction are public on the
              NEAR blockchain. Anyone can read them, with or without this site.
            </p>
          ),
        },
        {
          title: 'In your browser',
          body: (
            <ul>
              <li>The network you picked (testnet or mainnet), in local storage.</li>
              <li>Your wallet connection, kept by the wallet selector in local storage.</li>
            </ul>
          ),
        },
        {
          title: 'Sent to services',
          body: (
            <ul>
              <li>
                <strong>Mosaec API</strong>: your account name, to list your positions. Requests are
                rate limited by IP address; the address is not stored.
              </li>
              <li>
                <strong>NEAR RPC</strong> (FastNEAR): balance and contract reads, sent from your
                browser.
              </li>
              <li>
                <strong>CoinGecko</strong>: a price request with no account data, sent from your
                browser.
              </li>
              <li>
                <strong>Faucet</strong>: the account name you enter, to send test tokens once a day.
              </li>
            </ul>
          ),
        },
        {
          title: 'Analytics and errors',
          body: (
            <ul>
              <li>
                <strong>Umami</strong>, self-hosted: page views and a few step counts (wallet
                connected, offer signed, pawn filled). No cookies, no account names, no wallet
                addresses.
              </li>
              <li>
                <strong>Sentry</strong>: error reports when something breaks, with the page and the
                error. Account names and IP addresses are stripped before sending.
              </li>
            </ul>
          ),
        },
        {
          title: 'Contact',
          body: (
            <p>
              Questions or a request about your data:{' '}
              <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>.
            </p>
          ),
        },
      ]}
    />
  );
}
