import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowSquareOutIcon,
  HandCoinsIcon,
  PackageIcon,
  PauseCircleIcon,
  ProhibitIcon,
  SealCheckIcon,
  StampIcon,
  StorefrontIcon,
  TicketIcon,
  TimerIcon,
  WarningCircleIcon,
  XCircleIcon,
} from '@phosphor-icons/react/dist/ssr';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ASSETS, assetByTokenId } from '@mosaec/config/assets';
import { DEFAULT_NETWORK, explorerAccountUrl, explorerTxUrl } from '@mosaec/config/networks';
import { AppIcon, ButtonLink, ErrorState, NftCard, StatusPill, cx } from '@mosaec/ui';

import { ApiError, getPack } from '../../../../lib/api';
import { NEAR_MARK } from '../../../../lib/asset-marks';
import { dealApr, dealInterest, dealOf } from '../../../../lib/deal';
import { DEAL_STATUS } from '../../../../lib/deal-status';
import { formatDateNs, formatDateTimeNs, formatUnits, padCents } from '../../../../lib/format';
import { amountText, cashNumber, cashText, termText } from '../../../../lib/pack-view';
import { CoinMark } from '../../_components/CoinMark';
import { Countdown } from '../../_components/Countdown';
import { ListCard, ListRow, SoftPill } from '../../_components/ListCard';
import { appPath } from '../../_components/routes';

import { ConfirmingPill } from './ConfirmingPill';
import { PackActions } from './PackActions';
import styles from './page.module.css';

import type { PackDetail, PackEvent } from '../../../../lib/api';
import type { Deal, DealOutcome } from '../../../../lib/deal';
import type { AppIconColor } from '@mosaec/ui';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

interface Props {
  readonly params: Promise<{ id: string }>;
}

/* Always rendered per request: a static route would be prefetched and held in the router cache, so a pack would show its state from before the last transaction. */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const index = decodeURIComponent(id).split('.')[0] ?? id;
  return {
    title: `Pack #${index}`,
    description: `Contents, terms and history of Mosaec pack ${decodeURIComponent(id)}.`,
  };
}

/** What the status means, in one line under the header. Label, tone and glyph come from DEAL_STATUS. */
const OUTCOME_LINE: Readonly<Record<DealOutcome, string>> = {
  listed: 'Waiting for a lender.',
  running: 'The loan is out. Repay by the date or the lender keeps the coins.',
  redeemed: 'Repaid in time. The coins went home.',
  forfeited: 'The date passed. The lender kept the coins.',
  cancelled: 'Closed before anyone filled it.',
  empty: 'No pawn yet.',
};

/** A cancelled offer leaves the coins in the pack until the owner withdraws them. */
function outcomeLine(pack: PackDetail, deal: Deal): string {
  if (deal.outcome !== 'cancelled') return OUTCOME_LINE[deal.outcome];
  return pack.contents.length > 0
    ? 'Closed before anyone filled it. The coins are still in the pack.'
    : 'Closed before anyone filled it. The coins went back to the owner.';
}

function sealedCaption(pack: PackDetail, deal: Deal): string {
  if (deal.outcome === 'listed' || deal.outcome === 'running') return 'Sealed in a keyless pack';
  if (deal.outcome === 'cancelled') {
    return pack.contents.length > 0 ? 'Still sealed in this pack' : 'Offered, then withdrawn';
  }
  return 'Was sealed in this pack';
}

/* History in plain words. */

interface Line {
  readonly title: string;
  readonly detail?: string;
  readonly icon: ReactNode;
  readonly color: AppIconColor;
}

function short(account: unknown): string {
  return typeof account === 'string'
    ? account.replace(/\.mosaec\.testnet$|\.near$/, '')
    : 'someone';
}

function tokenAmount(tokenId: unknown, amount: unknown): string {
  if (typeof tokenId !== 'string' || typeof amount !== 'string') return '';
  const asset = assetByTokenId(DEFAULT_NETWORK, tokenId);
  if (asset === undefined) return amount;
  const text = formatUnits(amount, asset.decimals, asset.role === 'settlement' ? 2 : 4);
  return `${asset.role === 'settlement' ? padCents(text) : text} ${asset.symbol}`;
}

function usdc(amount: unknown): string {
  return tokenAmount(ASSETS.USDC.tokenIds[DEFAULT_NETWORK], amount);
}

function lineOf(event: PackEvent): Line | null {
  const d = (typeof event.data === 'object' && event.data !== null ? event.data : {}) as Record<
    string,
    unknown
  >;
  switch (event.event) {
    case 'pack_minted':
      return {
        title: 'Pack created',
        detail: `${short(d.owner_id)} received the Title`,
        icon: <PackageIcon weight="fill" />,
        color: 'ink',
      };
    case 'offer_created': {
      const contents = Array.isArray(d.contents)
        ? (d.contents as { token_id?: unknown; amount?: unknown }[])
            .map((line) => tokenAmount(line.token_id, line.amount))
            .join(' + ')
        : '';
      const terms = (d.terms ?? {}) as { k_amount?: unknown };
      return {
        title: 'Offer opened',
        detail: `${contents} for ${usdc(d.price)}, repaying ${usdc(terms.k_amount)}`,
        icon: <StorefrontIcon weight="fill" />,
        color: 'blue',
      };
    }
    case 'offer_cancelled':
      return { title: 'Offer cancelled', icon: <XCircleIcon weight="fill" />, color: 'light' };
    case 'filled':
      return {
        title: 'Filled by a lender',
        detail: `${short(d.taker_id)} paid ${usdc(d.price)} and took the Title`,
        icon: <HandCoinsIcon weight="fill" />,
        color: 'green',
      };
    case 'payout_delivered':
      return {
        title: 'Loan delivered',
        detail: `${usdc(d.amount)} reached ${short(d.maker_id)}`,
        icon: <HandCoinsIcon weight="fill" />,
        color: 'green',
      };
    case 'exercise_decided':
      return {
        title: 'Repaid',
        detail: `${usdc(d.k_amount)} paid by the Ticket holder`,
        icon: <SealCheckIcon weight="fill" />,
        color: 'violet',
      };
    case 'contents_released':
      return {
        title: 'Coins released',
        detail: `Back to ${short(d.owed_to)}`,
        icon: <PackageIcon weight="fill" />,
        color: 'violet',
      };
    case 'expired':
      return {
        title: 'Date passed unpaid',
        detail: 'The coins stay with the Title holder',
        icon: <TimerIcon weight="fill" />,
        color: 'coral',
      };
    case 'disruption_recorded':
      return {
        title: 'Verifier pause recorded',
        detail: 'The repayment window was extended by 24 hours',
        icon: <PauseCircleIcon weight="fill" />,
        color: 'orange',
      };
    case 'withdrawn':
      return {
        title: 'Withdrawn',
        detail: `${tokenAmount(d.token_id, d.amount)} to ${short((d.destination as { account_id?: unknown } | undefined)?.account_id)}`,
        icon: <ArrowSquareOutIcon weight="bold" />,
        color: 'light',
      };
    case 'refused':
      return {
        title: 'Request refused',
        detail: `${typeof d.code === 'string' ? d.code : 'Refused'}, any payment came back`,
        icon: <ProhibitIcon weight="bold" />,
        color: 'light',
      };
    default:
      return null;
  }
}

function History({ events }: { readonly events: readonly PackEvent[] }) {
  const lines = events
    .filter((event) => event.standard === 'mosaec')
    .map((event) => ({ event, line: lineOf(event) }))
    .filter((item): item is { event: PackEvent; line: Line } => item.line !== null);
  return (
    <ListCard
      title={`History · ${lines.length.toString()} events`}
      pill={<SoftPill tone="neutral">Read from chain</SoftPill>}
    >
      {lines.length === 0 ? (
        <ListRow
          icon={
            <AppIcon color="light" size={36}>
              <PackageIcon weight="fill" />
            </AppIcon>
          }
          title="No events indexed yet"
        />
      ) : (
        lines.map(({ event, line }) => (
          <ListRow
            key={event.receiptId}
            icon={
              <AppIcon color={line.color} size={36}>
                {line.icon}
              </AppIcon>
            }
            title={line.title}
            meta={line.detail}
            valueNote={event.timestampNs !== null ? formatDateTimeNs(event.timestampNs) : undefined}
            trailing={
              event.txHash !== null ? (
                <a
                  className={styles.tx}
                  href={explorerTxUrl(DEFAULT_NETWORK, event.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open the transaction on the explorer"
                >
                  <ArrowSquareOutIcon size={14} weight="bold" />
                </a>
              ) : undefined
            }
          />
        ))
      )}
    </ListCard>
  );
}

/* The deal hero and its lifecycle. */

function Amount({
  label,
  value,
  unit,
  note,
  tone,
}: {
  readonly label: string;
  readonly value: string;
  readonly unit?: string | null | undefined;
  readonly note?: ReactNode;
  readonly tone?: 'positive';
}) {
  return (
    <div className={styles.amount}>
      <span className="t-caption">{label}</span>
      <span className={cx(styles.amountValue, tone === 'positive' && styles.positive)}>
        {value}
        {unit != null && unit !== '' && <span className={styles.amountUnit}>{unit}</span>}
      </span>
      {note !== undefined && <span className={cx('t-caption', styles.amountNote)}>{note}</span>}
    </div>
  );
}

function Track({ deal }: { readonly deal: Deal }) {
  const ended = deal.outcome === 'redeemed' || deal.outcome === 'forfeited';
  const steps = [
    { label: 'Listed', at: deal.listedAtNs, done: deal.listedAtNs !== null },
    { label: 'Filled', at: deal.filledAtNs, done: deal.filledAtNs !== null },
    {
      label: 'Due',
      at: deal.dueNs,
      done: ended,
      live: deal.outcome === 'running' && deal.dueNs !== null,
    },
    {
      label: deal.outcome === 'forfeited' ? 'Coins kept' : 'Repaid',
      at: ended ? deal.settledAtNs : null,
      done: ended,
    },
  ];
  return (
    <ol className={styles.track}>
      {steps.map((step, i) => (
        <li
          key={step.label}
          className={styles.trackStep}
          data-done={step.done}
          data-reached={steps[i + 1]?.done === true}
        >
          <span className={styles.dot} aria-hidden="true" />
          <span className="t-label">{step.label}</span>
          <span className="t-caption">
            {step.live === true && step.at !== null ? (
              <Countdown untilNs={step.at} />
            ) : step.at !== null ? (
              formatDateNs(step.at)
            ) : deal.outcome === 'cancelled' ? (
              'Skipped'
            ) : (
              'Pending'
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** One line under the outcome: when the next thing happens. */
function NextMoment({ pack, deal }: { readonly pack: PackDetail; readonly deal: Deal }) {
  if (deal.outcome === 'listed' && pack.offer?.expiresAtNs != null) {
    return (
      <>
        Offer closes in <Countdown untilNs={pack.offer.expiresAtNs} compact />
      </>
    );
  }
  if (deal.outcome === 'running' && deal.dueNs !== null) {
    return (
      <>
        Due {formatDateNs(deal.dueNs)}, in <Countdown untilNs={deal.dueNs} compact />
      </>
    );
  }
  if (deal.settledAtNs !== null) {
    return (
      <>
        {deal.outcome === 'cancelled' ? 'Closed' : 'Settled'} {formatDateNs(deal.settledAtNs)}
      </>
    );
  }
  return null;
}

/** The pawn as one ticket: the coins, the money both ways, then the dates. */
function DealHero({ pack, deal }: { readonly pack: PackDetail; readonly deal: Deal }) {
  const lead = deal.collateral[0];
  const apr = dealApr(deal);
  const interest = dealInterest(deal);
  const terms = [apr === null ? null : `${apr.toFixed(1)}% APR`, termText(deal.termNs)]
    .filter((part) => part !== null)
    .join(' over ');
  return (
    <section className={styles.deal} aria-label="The deal">
      <div className={styles.dealHead}>
        <div className={styles.coins}>
          <CoinMark symbol={lead?.symbol ?? null} size={52} />
          <div className={styles.coinsText}>
            <span className={styles.coinsAmount}>
              {deal.collateral.length === 0
                ? 'Empty'
                : deal.collateral.map((line) => amountText(line)).join(' + ')}
            </span>
            <span className="t-caption">{sealedCaption(pack, deal)}</span>
          </div>
        </div>
        <div className={styles.outcome}>
          <span className="t-label">{outcomeLine(pack, deal)}</span>
          <span className="t-caption">
            <NextMoment pack={pack} deal={deal} />
          </span>
        </div>
      </div>

      {deal.principal !== null && (
        <div className={styles.ledger}>
          <Amount label="Loan" value={cashNumber(deal.principal)} unit={deal.principal.symbol} />
          <span className={styles.ledgerArrow} aria-hidden="true">
            <ArrowRightIcon size={16} weight="bold" />
          </span>
          <Amount
            label="Repayment"
            value={deal.repayment === null ? '–' : cashNumber(deal.repayment)}
            unit={deal.repayment?.symbol}
          />
          <Amount
            label="Lender earns"
            value={
              interest === null || deal.principal.decimals === null
                ? '–'
                : `+${padCents(formatUnits(interest, deal.principal.decimals, 2))}`
            }
            unit={deal.principal.symbol}
            note={terms}
            tone="positive"
          />
        </div>
      )}

      {deal.listedAtNs !== null && (
        <div>
          <Track deal={deal} />
        </div>
      )}

      {pack.terms?.disruptedAtNs != null && pack.terms.deadlineNs !== null && (
        <p className={styles.notice}>
          <PauseCircleIcon size={16} weight="fill" />
          The verifier paused during the term, so the repayment window runs until{' '}
          {formatDateNs(pack.terms.deadlineNs)}.
        </p>
      )}
    </section>
  );
}

function Holder({
  label,
  accountId,
  empty,
}: {
  readonly label: string;
  readonly accountId: string | null;
  readonly empty: string;
}) {
  return (
    <div className={styles.holder}>
      <span className="t-caption">{label}</span>
      {accountId === null ? (
        <span className="t-label">{empty}</span>
      ) : (
        <a
          className={cx('t-label', styles.link)}
          href={explorerAccountUrl(DEFAULT_NETWORK, accountId)}
          target="_blank"
          rel="noreferrer"
        >
          {accountId}
        </a>
      )}
    </div>
  );
}

function Rights({ pack, deal }: { readonly pack: PackDetail; readonly deal: Deal }) {
  /* The Title owns the pack, so it shows what the pack holds now; a free pack can be empty. */
  const held = pack.state === 'free' ? pack.contents : deal.collateral;
  const contents = held.length === 0 ? 'Empty' : held.map((line) => amountText(line)).join(' + ');
  /* No lender filled a cancelled offer, so its Ticket never existed. */
  const ticketNever =
    deal.outcome === 'listed' || deal.outcome === 'empty' || deal.outcome === 'cancelled';
  return (
    <section className={styles.panel} aria-label="Rights">
      <div className={styles.panelHead}>
        <h2 className="t-h4">Two rights, two NFTs</h2>
        <span className="t-caption">Each one trades on its own</span>
      </div>
      <div className={styles.rights}>
        <div className={styles.right}>
          <NftCard
            kind="title"
            tokenLabel={pack.title.id}
            value={contents}
            meta="Owns the pack"
            icon={<StampIcon size={22} weight="fill" />}
            notch="var(--bg-secondary)"
          />
          <Holder label="Title holder" accountId={pack.title.owner} empty="Nobody" />
        </div>
        <div className={styles.right}>
          <NftCard
            kind="ticket"
            tone="lime"
            tokenLabel={pack.ticket?.id ?? (ticketNever ? 'Not issued' : 'Retired')}
            value={
              deal.outcome === 'cancelled'
                ? 'None'
                : deal.repayment === null
                  ? 'Issued at fill'
                  : cashText(deal.repayment)
            }
            meta={
              deal.outcome === 'cancelled'
                ? 'No lender filled the offer'
                : deal.dueNs === null
                  ? 'Buys the coins back'
                  : `Before ${formatDateNs(deal.dueNs)}`
            }
            icon={<TicketIcon size={22} weight="fill" />}
            notch="var(--bg-secondary)"
          />
          <Holder
            label="Ticket holder"
            accountId={pack.ticket?.owner ?? null}
            empty={
              deal.outcome === 'listed'
                ? 'Issued to the borrower at fill'
                : deal.outcome === 'cancelled'
                  ? 'Never issued'
                  : 'Retired'
            }
          />
        </div>
      </div>
    </section>
  );
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

  const deal = dealOf(DEFAULT_NETWORK, pack);
  const outcome = { ...DEAL_STATUS[deal.outcome], line: OUTCOME_LINE[deal.outcome] };

  return (
    <>
      <div className={styles.top}>
        <Link href={appPath()} className={styles.back}>
          <ArrowLeftIcon size={16} weight="bold" />
          Market
        </Link>
        <div className={styles.header}>
          <div className={styles.titleRow}>
            <h1 className="t-h1">Pack #{pack.index}</h1>
            <StatusPill tone={outcome.tone} icon={outcome.icon} size="md">
              {outcome.label}
            </StatusPill>
            <ConfirmingPill
              pack={pack.id}
              hashes={pack.history.flatMap((event) =>
                event.txHash === null ? [] : [event.txHash],
              )}
            />
          </div>
          <div className={styles.headerActions}>
            <a
              className={styles.idChip}
              href={explorerAccountUrl(DEFAULT_NETWORK, pack.id)}
              target="_blank"
              rel="noreferrer"
            >
              <Image src={NEAR_MARK.src} alt="NEAR" width={18} height={18} />
              {pack.id}
              <ArrowSquareOutIcon size={14} weight="bold" />
            </a>
            <ButtonLink
              href={`${appPath('/verify')}?pack=${encodeURIComponent(pack.id)}`}
              as={Link}
              variant="secondary"
              size="sm"
              icon={<SealCheckIcon size={16} weight="fill" />}
            >
              Verify This Pack
            </ButtonLink>
          </div>
        </div>
      </div>
      <div className={styles.grid}>
        <div className={styles.col}>
          <DealHero pack={pack} deal={deal} />
          <Rights pack={pack} deal={deal} />
          <History events={pack.history} />
        </div>
        <div className={styles.aside}>
          <PackActions pack={pack} />
        </div>
      </div>
    </>
  );
}
