'use client';

import {
  CalendarCheckIcon,
  HandCoinsIcon,
  PackageIcon,
  StampIcon,
  TicketIcon,
  WalletIcon,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { ASSETS } from '@mosaec/config/assets';
import { AppIcon, ButtonLink, ErrorState, Segmented, Skeleton, StatusPill } from '@mosaec/ui';

import { getPositions } from '../../../lib/api';
import { liveDealOf } from '../../../lib/deal';
import { PAWN_STATUS } from '../../../lib/deal-status';
import { formatDateNs, formatUnits, padCents } from '../../../lib/format';
import { useNetwork } from '../../../lib/near/network';
import { useWallet } from '../../../lib/near/wallet';
import { amountText, cashText, termText } from '../../../lib/pack-view';
import { usdText, usdValue, useUsdPrices } from '../../../lib/prices';
import { CoinTile } from '../_components/CoinTile';
import { Countdown } from '../_components/Countdown';
import { DueReminder } from '../_components/DueReminder';
import { appPath, packPath } from '../_components/routes';
import { Stat, StatRow } from '../_components/Stat';
import { ValueCheck } from '../_components/ValueCheck';
import { WalletButton } from '../_components/WalletButton';

import { History } from './History';
import styles from './positions.module.css';

import type { Pack, Positions } from '../../../lib/api';

type State =
  | { readonly kind: 'loading' }
  | { readonly kind: 'done'; readonly positions: Positions }
  | { readonly kind: 'error' };

type Side = 'borrowing' | 'lending' | 'owned';
type Tab = Side | 'history';

const SIDES: readonly { readonly key: Side; readonly label: string; readonly note: string }[] = [
  {
    key: 'borrowing',
    label: 'Borrowing',
    note: 'Repay by the date to get your coins back.',
  },
  {
    key: 'lending',
    label: 'Lending',
    note: 'You get the repayment, or the coins.',
  },
  { key: 'owned', label: 'Packs', note: 'Packs with no loan running.' },
];

const USDC = ASSETS.USDC;

function cash(amount: bigint): string {
  return padCents(formatUnits(amount, USDC.decimals, 2));
}

function sum(packs: readonly Pack[], pick: (pack: Pack) => string | undefined): bigint {
  return packs.reduce((total, pack) => {
    const value = pick(pack);
    return value === undefined ? total : total + BigInt(value);
  }, 0n);
}

function nextDue(packs: readonly Pack[]): string | null {
  const dates = packs
    .map((pack) => pack.terms?.expiresAtNs ?? null)
    .filter((ns): ns is string => ns !== null)
    .sort((a, b) => Number(BigInt(a) - BigInt(b)));
  return dates[0] ?? null;
}

function Summary({ positions }: { readonly positions: Positions | null }) {
  const live = positions?.borrowing ?? [];
  const lent = positions?.lending ?? [];
  const due = positions === null ? null : nextDue([...live, ...lent]);
  const dash = '–';
  return (
    <StatRow>
      <Stat
        icon={
          <AppIcon color="blue" size={40}>
            <CalendarCheckIcon weight="fill" />
          </AppIcon>
        }
        label="Next date"
        value={due === null ? dash : formatDateNs(due)}
        note={due === null ? 'No loan running' : <Countdown untilNs={due} />}
      />
      <Stat
        icon={
          <AppIcon color="orange" size={40}>
            <TicketIcon weight="fill" />
          </AppIcon>
        }
        label="You repay"
        value={positions === null ? dash : cash(sum(live, (pack) => pack.terms?.repayment.amount))}
        unit="USDC"
        note={`${live.length.toString()} Ticket${live.length === 1 ? '' : 's'} held`}
      />
      <Stat
        icon={
          <AppIcon color="green" size={40}>
            <StampIcon weight="fill" />
          </AppIcon>
        }
        label="Owed to you"
        value={positions === null ? dash : cash(sum(lent, (pack) => pack.terms?.repayment.amount))}
        unit="USDC"
        note={`${lent.length.toString()} Title${lent.length === 1 ? '' : 's'} on loan`}
      />
      <Stat
        icon={
          <AppIcon color="violet" size={40}>
            <PackageIcon weight="fill" />
          </AppIcon>
        }
        label="Packs"
        value={positions === null ? dash : positions.owned.length.toString()}
        note="Free or offered"
      />
    </StatRow>
  );
}

function action(side: Side, pack: Pack): { label: string; primary: boolean } {
  if (side === 'borrowing') return { label: 'Repay', primary: true };
  if (side === 'lending') return { label: 'View Pawn', primary: false };
  if (pack.state === 'offered') return { label: 'View Offer', primary: false };
  return { label: pack.contents.length > 0 ? 'Withdraw or Pawn' : 'Open a Pawn', primary: true };
}

const MS_PER_NS = 1_000_000n;

/** Share of the term already gone, from the due date and the term length. */
function elapsed(pack: Pack): number | undefined {
  const due = pack.terms?.expiresAtNs;
  const term = pack.terms?.termNs;
  if (due == null || term == null) return undefined;
  const end = Number(BigInt(due) / MS_PER_NS);
  const length = Number(BigInt(term) / MS_PER_NS);
  if (length <= 0) return undefined;
  return 1 - Math.min(Math.max((end - Date.now()) / length, 0), 1);
}

function PackStatus({ status }: { readonly status: keyof typeof PAWN_STATUS }) {
  const { label, tone, icon } = PAWN_STATUS[status];
  return (
    <StatusPill tone={tone} icon={icon}>
      {label}
    </StatusPill>
  );
}

function PositionCard({
  side,
  pack,
  prices,
}: {
  readonly side: Side;
  readonly pack: Pack;
  readonly prices: ReturnType<typeof useUsdPrices>;
}) {
  const deal = liveDealOf(pack);
  const worth = usdValue(deal.collateral, prices);
  const owed = deal.repayment === null ? null : usdValue([deal.repayment], prices);
  const lead = deal.collateral[0];
  const next = action(side, pack);
  const gone = elapsed(pack);
  const right = side === 'borrowing' ? 'Ticket' : 'Title';
  return (
    <li className={styles.card}>
      <div className={styles.cardTop}>
        <CoinTile symbol={lead?.symbol ?? null} size={40} />
        <PackStatus status={pack.status ?? 'Free'} />
      </div>
      <div className={styles.cardBody}>
        <span className="t-body-sm">
          Pack #{pack.index} · {lead === undefined ? 'empty' : amountText(lead)} · {right}
        </span>
        <span className={styles.cardValue}>
          {deal.repayment === null
            ? lead === undefined
              ? 'Empty'
              : amountText(lead)
            : cashText(deal.repayment)}
        </span>
      </div>
      {gone !== undefined && (
        <span className={styles.track} aria-hidden="true">
          <span
            style={{ width: `${Math.round(gone * 100).toString()}%` }}
            data-late={gone > 0.85}
          />
        </span>
      )}
      <span className="t-caption">
        {deal.dueNs !== null ? (
          <>
            {side === 'borrowing' ? 'Repay within ' : 'Settles in '}
            <Countdown untilNs={deal.dueNs} compact />
            {` · due ${formatDateNs(deal.dueNs)}`}
          </>
        ) : (
          termText(deal.termNs)
        )}
      </span>
      {side !== 'owned' && deal.outcome === 'running' && worth !== null && owed !== null && (
        <ValueCheck side={side === 'borrowing' ? 'borrower' : 'lender'} worth={worth} owed={owed} />
      )}
      {side === 'owned' && worth !== null && worth > 0 && (
        <span className="t-caption">Worth about {usdText(worth)} now</span>
      )}
      {side === 'borrowing' && deal.outcome === 'running' && deal.dueNs !== null && (
        <DueReminder
          reminder={{
            dueNs: deal.dueNs,
            packIndex: pack.index,
            owed: deal.repayment === null ? 'the repayment' : cashText(deal.repayment),
            path: packPath(pack.id),
          }}
        />
      )}
      <ButtonLink
        href={packPath(pack.id)}
        as={Link}
        size="sm"
        fullWidth
        variant={next.primary ? 'primary' : 'secondary'}
      >
        {next.label}
      </ButtonLink>
    </li>
  );
}

function Book({
  positions,
  accountId,
}: {
  readonly positions: Positions;
  readonly accountId: string;
}) {
  const prices = useUsdPrices();
  const first = SIDES.find((side) => positions[side.key].length > 0)?.key ?? 'borrowing';
  const [tab, setTab] = useState<Tab>(first);
  const side: Side = tab === 'history' ? 'borrowing' : tab;
  const current = SIDES.find((item) => item.key === side) ?? SIDES[0];
  const packs = positions[side];
  return (
    <section className={styles.book}>
      <div className={styles.bookHead}>
        <Segmented<Tab>
          label="Positions"
          value={tab}
          onChange={setTab}
          options={[
            ...SIDES.map((item) => ({
              id: item.key,
              label: (
                <>
                  {item.label}
                  <span className={styles.count}>{positions[item.key].length}</span>
                </>
              ),
            })),
            { id: 'history', label: 'History' },
          ]}
        />
        <span className="t-body-sm">
          {tab === 'history' ? 'Finished pawns and what they earned.' : current?.note}
        </span>
      </div>
      {tab === 'history' ? (
        <History accountId={accountId} />
      ) : packs.length === 0 ? (
        <div className={styles.none}>
          <span className="t-label">Nothing here yet.</span>
          <ButtonLink
            href={side === 'lending' ? appPath() : appPath('/borrow')}
            as={Link}
            size="sm"
            variant="secondary"
            showIcon
          >
            {side === 'lending' ? 'Browse the Market' : 'Open a Pawn'}
          </ButtonLink>
        </div>
      ) : (
        <ul className={styles.list}>
          {packs.map((pack) => (
            <PositionCard key={pack.id} side={side} pack={pack} prices={prices} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ConnectCard() {
  return (
    <div className={styles.connect}>
      <div className={styles.connectCopy}>
        <AppIcon color="ink" size={48}>
          <WalletIcon weight="fill" />
        </AppIcon>
        <h2 className="t-h3">Connect to see your pawns.</h2>
        <p className="t-body">See every pawn you borrowed or lent.</p>
        <div className={styles.connectAction}>
          <WalletButton size="md" />
        </div>
      </div>
      <ul className={styles.legend}>
        {[
          {
            icon: <TicketIcon weight="fill" />,
            color: 'orange' as const,
            title: 'Borrowing',
            body: 'Repay and the coins come home.',
          },
          {
            icon: <StampIcon weight="fill" />,
            color: 'green' as const,
            title: 'Lending',
            body: 'The repayment, or the coins.',
          },
          {
            icon: <HandCoinsIcon weight="fill" />,
            color: 'blue' as const,
            title: 'Packs',
            body: 'Coins ready for the next pawn.',
          },
        ].map((item) => (
          <li key={item.title} className={styles.legendItem}>
            <AppIcon color={item.color} size={36}>
              {item.icon}
            </AppIcon>
            <span className={styles.stack}>
              <span className="t-label">{item.title}</span>
              <span className="t-caption">{item.body}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PositionsDesk() {
  const { network } = useNetwork();
  const { accountId } = useWallet();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    if (accountId === null) return;
    let live = true;
    setState({ kind: 'loading' });
    getPositions(network, accountId)
      .then((positions) => {
        if (live) setState({ kind: 'done', positions });
      })
      .catch(() => {
        if (live) setState({ kind: 'error' });
      });
    return () => {
      live = false;
    };
  }, [network, accountId]);

  const positions = useMemo(
    () => (accountId !== null && state.kind === 'done' ? state.positions : null),
    [accountId, state],
  );

  return (
    <div className={styles.desk}>
      {accountId !== null && <Summary positions={positions} />}
      {accountId === null ? (
        <ConnectCard />
      ) : state.kind === 'loading' ? (
        <Skeleton height={240} />
      ) : state.kind === 'error' ? (
        <ErrorState title="Positions are unavailable right now">
          The indexer could not be reached. Your packs are safe on chain.
        </ErrorState>
      ) : (
        <Book positions={state.positions} accountId={accountId} />
      )}
    </div>
  );
}
