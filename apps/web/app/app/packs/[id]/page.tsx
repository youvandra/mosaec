import {
  PackageIcon,
  StampIcon,
  TicketIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { DEFAULT_NETWORK, explorerAccountUrl, explorerTxUrl } from '@mosaec/config/networks';
import { AppIcon, ButtonLink, ErrorState, NftCard, StatusPill, cx } from '@mosaec/ui';

import { ApiError, getPack } from '../../../../lib/api';
import { formatDateNs } from '../../../../lib/format';
import { amountText, contentsText, termText } from '../../../../lib/pack-view';
import { STATUS_TONE } from '../../../../lib/status';
import { Countdown } from '../../_components/Countdown';
import { Facts, Panel } from '../../_components/Panel';
import { appPath } from '../../_components/routes';

import { PackActions } from './PackActions';
import styles from './page.module.css';

import type { PackDetail, PackEvent } from '../../../../lib/api';
import type { Metadata } from 'next';

interface Props {
  readonly params: Promise<{ id: string }>;
}

export const revalidate = 10;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const index = decodeURIComponent(id).split('.')[0] ?? id;
  return {
    title: `Pack #${index}`,
    description: `Contents, terms and history of Mosaec pack ${decodeURIComponent(id)}.`,
  };
}

const EVENT_LABEL: Readonly<Record<string, string>> = {
  pack_minted: 'Pack minted',
  offer_created: 'Offer opened',
  offer_cancelled: 'Offer cancelled',
  filled: 'Filled by a lender',
  refused: 'Request refused',
  payout_delivered: 'Loan paid to the borrower',
  encumbrance_synced: 'Terms recorded in the pack',
  exercise_decided: 'Redeemed by the Ticket holder',
  contents_released: 'Contents released',
  nft_burned: 'Ticket retired',
  expired: 'Expired to the Title holder',
  disruption_recorded: 'Verifier pause recorded',
  withdrawn: 'Withdrawn',
  mt_transfer: 'Token transfer',
  nft_transfer: 'NFT transfer',
  nft_mint: 'NFT minted',
  nft_burn: 'NFT burned',
};

function Holder({ accountId }: { readonly accountId: string | null }) {
  if (accountId === null) return <>n/a</>;
  return (
    <a
      className={styles.link}
      href={explorerAccountUrl(DEFAULT_NETWORK, accountId)}
      target="_blank"
      rel="noreferrer"
    >
      {accountId}
    </a>
  );
}

function History({ events }: { readonly events: readonly PackEvent[] }) {
  const ordered = events.filter((event) => event.standard === 'mosaec');
  if (ordered.length === 0) return <p className="t-body-sm">No events indexed yet.</p>;
  return (
    <ol className={styles.history}>
      {ordered.map((event) => (
        <li key={event.receiptId} className={styles.event}>
          <span className="t-label">{EVENT_LABEL[event.event] ?? event.event}</span>
          {event.txHash !== null ? (
            <a
              className={cx('t-caption', styles.link)}
              href={explorerTxUrl(DEFAULT_NETWORK, event.txHash)}
              target="_blank"
              rel="noreferrer"
            >
              Block {event.height}
            </a>
          ) : (
            <span className="t-caption">Block {event.height}</span>
          )}
          <span className="t-caption">
            {event.timestampNs !== null ? formatDateNs(event.timestampNs) : ''}
          </span>
        </li>
      ))}
    </ol>
  );
}

function termsRows(pack: PackDetail) {
  const rows: [string, React.ReactNode][] = [];
  if (pack.offer !== null) rows.push(['Loan', amountText(pack.offer.price, 6)]);
  if (pack.terms !== null) {
    rows.push(['Repayment', amountText(pack.terms.repayment, 6)]);
    rows.push(['Term', termText(pack.terms.termNs)]);
    if (pack.terms.expiresAtNs !== null) {
      rows.push(['Due', formatDateNs(pack.terms.expiresAtNs)]);
      rows.push(['Time left', <Countdown key="c" untilNs={pack.terms.expiresAtNs} />]);
    }
    if (pack.terms.disruptedAtNs !== null && pack.terms.deadlineNs !== null) {
      rows.push(['Grace until', formatDateNs(pack.terms.deadlineNs)]);
    }
  }
  if (pack.offer?.expiresAtNs !== null && pack.offer?.expiresAtNs !== undefined) {
    rows.push(['Offer open until', formatDateNs(pack.offer.expiresAtNs)]);
  }
  return rows;
}

export default async function PackPage({ params }: Props) {
  const { id } = await params;
  const packId = decodeURIComponent(id);
  let pack: PackDetail | null;
  try {
    pack = await getPack(DEFAULT_NETWORK, packId);
  } catch (error) {
    return (
      <ErrorState
        title="This pack could not be loaded"
        icon={<WarningCircleIcon size={22} />}
        action={
          <ButtonLink
            href={explorerAccountUrl(DEFAULT_NETWORK, packId)}
            variant="secondary"
            size="sm"
            showIcon
          >
            Open on the Explorer
          </ButtonLink>
        }
      >
        {error instanceof ApiError ? error.message : 'Something went wrong.'} The pack itself is
        safe on chain.
      </ErrorState>
    );
  }
  if (pack === null) notFound();

  const terms = termsRows(pack);
  return (
    <>
      <div className={styles.header}>
        <div className={styles.title}>
          <AppIcon color="ink" size={52}>
            <PackageIcon weight="fill" />
          </AppIcon>
          <div className={styles.titleText}>
            <h1 className="t-h2">Pack #{pack.index}</h1>
            <div className={styles.idLine}>
              {pack.status === null ? (
                <StatusPill tone="neutral">Free</StatusPill>
              ) : (
                <StatusPill tone={STATUS_TONE[pack.status]}>{pack.status}</StatusPill>
              )}
              <a
                className={cx('t-caption', styles.link)}
                href={explorerAccountUrl(DEFAULT_NETWORK, pack.id)}
                target="_blank"
                rel="noreferrer"
              >
                {pack.id}
              </a>
            </div>
          </div>
        </div>
        <ButtonLink
          href={`${appPath('/verify')}?pack=${encodeURIComponent(pack.id)}`}
          as={Link}
          variant="secondary"
          size="sm"
          showIcon
        >
          Verify This Pack
        </ButtonLink>
      </div>
      <div className={styles.grid}>
        <div className={styles.col}>
          <Panel title="Contents">
            <Facts
              rows={
                pack.contents.length === 0
                  ? [['Holdings', 'Empty']]
                  : pack.contents.map(
                      (line) => [line.symbol ?? line.tokenId, amountText(line, 8)] as const,
                    )
              }
            />
          </Panel>
          {terms.length > 0 && (
            <Panel title="Terms">
              <Facts rows={terms} />
            </Panel>
          )}
          <Panel title="Rights">
            <div className={styles.cards}>
              <NftCard
                kind="title"
                tokenLabel={pack.title.id}
                value={contentsText(pack)}
                meta="Owns the pack"
                icon={<StampIcon size={22} weight="fill" />}
              />
              {pack.ticket !== null && pack.terms !== null && (
                <NftCard
                  kind="ticket"
                  tokenLabel={pack.ticket.id}
                  value={amountText(pack.terms.repayment, 2)}
                  meta={
                    pack.terms.expiresAtNs !== null
                      ? `Before ${formatDateNs(pack.terms.expiresAtNs)}`
                      : ''
                  }
                  icon={<TicketIcon size={22} weight="fill" />}
                />
              )}
            </div>
            <Facts
              rows={[
                ['Title holder', <Holder key="t" accountId={pack.title.owner} />],
                ...(pack.ticket !== null
                  ? [
                      ['Ticket holder', <Holder key="k" accountId={pack.ticket.owner} />] as [
                        string,
                        React.ReactNode,
                      ],
                    ]
                  : []),
              ]}
            />
          </Panel>
          <Panel title="History">
            <History events={pack.history} />
          </Panel>
        </div>
        <div className={styles.col}>
          <PackActions pack={pack} />
        </div>
      </div>
    </>
  );
}
