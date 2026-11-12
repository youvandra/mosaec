import { PlugsConnectedIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';

import { DEFAULT_NETWORK } from '@mosaec/config/networks';
import { ButtonLink, Callout, ErrorState, StatusPill } from '@mosaec/ui';

import { getDesk, getDeskDecisions, getDeskLedger } from '../../../lib/api';
import { DESK_STATUS_LABEL, deskStatus } from '../../../lib/desk-status';
import { PageHeader } from '../_components/PageHeader';
import { appPath } from '../_components/routes';

import styles from './desk.module.css';
import { Activity, AgentCard, RateCards, Results, RulePanel, Treasury, cash } from './DeskParts';

export const metadata = {
  title: 'House Desk',
  description:
    'The Mosaec House Desk: instant loans priced from an agent-set rate card, inside public rules.',
};
export const revalidate = 15;

async function load() {
  try {
    const [desk, ledger, decisions] = await Promise.all([
      getDesk(DEFAULT_NETWORK, true),
      getDeskLedger(DEFAULT_NETWORK),
      getDeskDecisions(DEFAULT_NETWORK, 40),
    ]);
    return { desk, ledger, decisions };
  } catch {
    return null;
  }
}

export default async function DeskPage() {
  const data = await load();
  if (data === null) {
    return (
      <ErrorState title="The desk is unavailable right now" icon={<WarningCircleIcon size={22} />}>
        The API could not be reached. The desk account and its fills stay readable on the explorer.
      </ErrorState>
    );
  }
  const { desk, ledger, decisions } = data;
  const status = deskStatus(desk, Date.now());
  const ready = ledger.treasury.usdc;
  const headline =
    status === 'live'
      ? { title: 'Lending now,', accent: `${ready === null ? '–' : cash(ready)} USDC ready.` }
      : status === 'paused'
        ? { title: 'Paused,', accent: 'open pawns wait for other lenders.' }
        : { title: 'Offline,', accent: 'the loop is between runs.' };
  return (
    <>
      <PageHeader
        title={headline.title}
        accent={headline.accent}
        lead="Instant loans at an agent-set rate, inside public rules."
        actions={
          <>
            <StatusPill
              tone={status === 'live' ? 'positive' : status === 'paused' ? 'warning' : 'neutral'}
              size="md"
            >
              {DESK_STATUS_LABEL[status]}
            </StatusPill>
            <ButtonLink
              href={appPath('/agents')}
              as={Link}
              icon={<PlugsConnectedIcon size={16} weight="fill" />}
            >
              Connect Your Agent
            </ButtonLink>
          </>
        }
      />
      {status === 'paused' && (
        <Callout tone="warning" title="The desk is paused">
          {ledger.status.reason ?? 'Its rules are on hold.'}
        </Callout>
      )}
      <section className={styles.bento} aria-label="Overview">
        <div className={styles.main}>
          <Treasury ledger={ledger} />
          <Results ledger={ledger} />
        </div>
        <RulePanel ledger={ledger} />
      </section>
      <section className={styles.section} aria-labelledby="rate-card">
        <header className={styles.sectionHead}>
          <h2 id="rate-card" className="t-h4">
            Rate card
          </h2>
          <span className="t-caption">Set hourly by the agent</span>
        </header>
        <RateCards ledger={ledger} />
      </section>
      <section className={styles.section} aria-label="Activity">
        <div className={styles.split}>
          <Activity ledger={ledger} decisions={decisions} />
          <AgentCard ledger={ledger} decisions={decisions} />
        </div>
      </section>
    </>
  );
}
