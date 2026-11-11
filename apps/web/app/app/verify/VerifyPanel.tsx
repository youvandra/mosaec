'use client';

import {
  ArrowSquareOutIcon,
  CheckIcon,
  CircleNotchIcon,
  MinusIcon,
  SealCheckIcon,
  SealWarningIcon,
  ShieldCheckIcon,
  XIcon,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { NETWORKS, explorerAccountUrl } from '@mosaec/config/networks';
import { AppIcon, Button, ErrorState, Skeleton, cx } from '@mosaec/ui';

import { PAWN_STATUS } from '../../../lib/deal-status';
import { formatDateTimeNs } from '../../../lib/format';
import { useNetwork } from '../../../lib/near/network';
import { plannedChecks, verifyPack } from '../../../lib/near/verify';
import { CoinMark } from '../_components/CoinMark';
import { ListCard, ListRow, SoftPill } from '../_components/ListCard';
import { packPath } from '../_components/routes';

import styles from './VerifyPanel.module.css';

import type { Check, CheckResult, PackReport } from '../../../lib/near/verify';
import type { AppIconColor } from '@mosaec/ui';
import type { ReactNode } from 'react';

const ACCOUNT_ID = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

type State =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'done'; readonly report: PackReport }
  | { readonly kind: 'error'; readonly message: string };

const RESULT: Readonly<Record<CheckResult, { icon: ReactNode; color: AppIconColor }>> = {
  pass: { icon: <CheckIcon weight="bold" />, color: 'green' },
  fail: { icon: <XIcon weight="bold" />, color: 'coral' },
  skip: { icon: <MinusIcon weight="bold" />, color: 'light' },
};

function short(account: string | null): string {
  return account ?? 'Nobody';
}

export function VerifyPanel() {
  const { network } = useNetwork();
  const router = useRouter();
  const search = useSearchParams();
  const target = search.get('pack') ?? '';
  const [input, setInput] = useState(target);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const registry = NETWORKS[network].registryAccountId;
  const planned = plannedChecks(network);

  useEffect(() => {
    setInput(target);
    if (target === '') {
      setState({ kind: 'idle' });
      return;
    }
    if (!ACCOUNT_ID.test(target)) {
      setState({ kind: 'error', message: 'Enter a NEAR account id, like 0.' + registry + '.' });
      return;
    }
    let live = true;
    setState({ kind: 'loading' });
    verifyPack(network, target)
      .then((report) => {
        if (live) setState({ kind: 'done', report });
      })
      .catch(() => {
        if (live)
          setState({
            kind: 'error',
            message: 'The account could not be read. Check the id, or try again in a moment.',
          });
      });
    return () => {
      live = false;
    };
  }, [network, target, registry]);

  const go = (id: string) => {
    router.replace(`?pack=${encodeURIComponent(id.trim().toLowerCase())}`);
  };

  return (
    <div className={styles.page}>
      <div className={styles.tray}>
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            go(input);
          }}
        >
          <ShieldCheckIcon size={20} weight="fill" className={styles.formIcon} aria-hidden />
          <label htmlFor="pack-id" className="sr-only">
            Pack account
          </label>
          <input
            id="pack-id"
            className={styles.input}
            placeholder={`0.${registry}`}
            value={input}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setInput(event.target.value);
            }}
          />
          <Button type="submit" disabled={state.kind === 'loading'}>
            Verify
          </Button>
        </form>
        <div className={styles.examples}>
          <span className="t-caption">Try</span>
          {['0', '1', '6'].map((index) => {
            const id = `${index}.${registry}`;
            return (
              <button
                key={id}
                type="button"
                className={cx(styles.example, target === id && styles.exampleOn)}
                onClick={() => {
                  go(id);
                }}
              >
                Pack #{index}
              </button>
            );
          })}
        </div>
      </div>

      {state.kind === 'error' && (
        <ErrorState title="Verification could not run">{state.message}</ErrorState>
      )}

      {state.kind === 'idle' && (
        <ListCard
          title="What Your Browser Checks"
          pill={<SoftPill tone="neutral">Public RPC</SoftPill>}
        >
          {planned.map((item, index) => (
            <ListRow
              key={item.id}
              icon={
                <AppIcon color="light" size={36}>
                  <span className={styles.step}>{index + 1}</span>
                </AppIcon>
              }
              title={item.label}
              meta={<span className={styles.source}>{item.source}</span>}
            />
          ))}
        </ListCard>
      )}

      {state.kind === 'loading' && (
        <div className={styles.result} aria-busy="true">
          <div className={cx(styles.verdict, styles.verdictLoading)}>
            <Skeleton width="40%" />
            <Skeleton width="80%" height={28} />
            <Skeleton width="100%" height={72} />
            <Skeleton width="100%" height={72} />
          </div>
          <ListCard title="Checks" pill={<SoftPill tone="neutral">Reading the chain</SoftPill>}>
            {planned.map((item) => (
              <ListRow
                key={item.id}
                icon={
                  <AppIcon color="light" size={36}>
                    <CircleNotchIcon weight="bold" className={styles.spin} />
                  </AppIcon>
                }
                title={item.label}
                meta={<span className={styles.source}>{item.source}</span>}
              />
            ))}
          </ListCard>
        </div>
      )}

      {state.kind === 'done' && <Report report={state.report} target={target} />}
    </div>
  );
}

function Report({ report, target }: { readonly report: PackReport; readonly target: string }) {
  const { network } = useNetwork();
  const { checks, summary } = report;
  const failed = checks.filter((item) => item.result === 'fail').length;
  const ran = checks.filter((item) => item.result !== 'skip').length;
  const passed = failed === 0;
  const status = summary.status === null ? null : PAWN_STATUS[summary.status];

  return (
    <div className={styles.result}>
      <section className={styles.verdict} aria-label="Verdict">
        <div className={styles.head}>
          <span className={styles.mono}>
            {summary.index === null ? 'Not a pack' : `Pack #${summary.index}`}
          </span>
          {status !== null && <span className={styles.status}>{status.label}</span>}
        </div>
        <div className={cx(styles.call, !passed && styles.callFail)}>
          {passed ? (
            <SealCheckIcon size={40} weight="fill" />
          ) : (
            <SealWarningIcon size={40} weight="fill" />
          )}
          <span className={styles.callText}>
            <span className={styles.callTitle}>
              {passed
                ? 'Pack checks out'
                : `${failed.toString()} ${failed === 1 ? 'check' : 'checks'} failed`}
            </span>
            <span className={styles.callNote}>
              {ran - failed} of {ran} checks passed
            </span>
          </span>
        </div>

        {summary.index !== null && (
          <>
            <div className={styles.slot}>
              <span className={styles.mono}>Coins inside</span>
              {summary.contents.length === 0 ? (
                <span className={styles.slotValue}>Empty</span>
              ) : (
                summary.contents.map((line) => (
                  <span key={line.text} className={styles.slotValue}>
                    <CoinMark symbol={line.symbol} size={22} />
                    {line.text}
                  </span>
                ))
              )}
            </div>
            {summary.repay !== null && (
              <div className={styles.slot}>
                <span className={styles.mono}>
                  {summary.dueNs === null ? 'Repay' : `Repay by ${formatDateTimeNs(summary.dueNs)}`}
                </span>
                <span className={styles.slotValue}>{summary.repay}</span>
              </div>
            )}
            <dl className={styles.holders}>
              <div>
                <dt className={styles.mono}>Title</dt>
                <dd>{short(summary.titleOwner)}</dd>
              </div>
              <div>
                <dt className={styles.mono}>Ticket</dt>
                <dd>{short(summary.ticketOwner)}</dd>
              </div>
            </dl>
          </>
        )}

        <div className={styles.foot}>
          <span className={styles.proof}>
            Read in your browser from {report.rpcHost}
            {report.blockHeight !== null &&
              ` at block ${report.blockHeight.toLocaleString('en-US')}`}
            .
          </span>
          <div className={styles.links}>
            {summary.index !== null && (
              <Link href={packPath(target)} className={styles.link}>
                Open Pack
              </Link>
            )}
            <a
              href={explorerAccountUrl(network, target)}
              target="_blank"
              rel="noreferrer"
              className={styles.link}
            >
              Explorer
              <ArrowSquareOutIcon size={14} weight="bold" />
            </a>
          </div>
        </div>
      </section>

      <ListCard
        title="Checks"
        pill={
          <SoftPill tone={passed ? 'positive' : 'negative'}>
            {ran - failed} of {ran} passed
          </SoftPill>
        }
      >
        {checks.map((item) => (
          <CheckRow key={item.id} item={item} />
        ))}
      </ListCard>
    </div>
  );
}

function CheckRow({ item }: { readonly item: Check }) {
  const result = RESULT[item.result];
  return (
    <ListRow
      icon={
        <AppIcon color={result.color} size={36}>
          {result.icon}
        </AppIcon>
      }
      title={item.label}
      meta={
        <span className={styles.meta}>
          <span>{item.detail}</span>
          <span className={styles.source}>{item.source}</span>
        </span>
      }
    />
  );
}
