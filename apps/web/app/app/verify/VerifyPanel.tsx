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
import { AppIcon, Button, ErrorState, cx } from '@mosaec/ui';

import { PAWN_STATUS } from '../../../lib/deal-status';
import { formatDateTimeNs } from '../../../lib/format';
import { useNetwork } from '../../../lib/near/network';
import { plannedChecks, verifyPack } from '../../../lib/near/verify';
import { CoinMark } from '../_components/CoinMark';
import { ListCard, ListRow, SoftPill } from '../_components/ListCard';
import { packPath } from '../_components/routes';

import styles from './VerifyPanel.module.css';

import type { Check, CheckResult, PackReport, PlannedCheck } from '../../../lib/near/verify';
import type { AppIconColor } from '@mosaec/ui';
import type { CSSProperties, ReactNode } from 'react';

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

/** Pause between one value rolling in and the next, so the result settles top to bottom. */
const STAGGER_MS = 60;

function delay(step: number): CSSProperties {
  return { '--delay': `${(step * STAGGER_MS).toString()}ms` } as CSSProperties;
}

/**
 * The source's label roll: while reading, `from` shows; once `to` is given, `from` slides up and
 * out as `to` slides in from below. Both share one grid cell, so the box keeps the larger size.
 */
function Roll({
  from,
  to,
  step = 0,
  className,
}: {
  readonly from: ReactNode;
  readonly to?: ReactNode;
  readonly step?: number;
  readonly className?: string | undefined;
}) {
  const done = to !== undefined;
  return (
    <span className={cx(styles.roll, className)} style={delay(step)}>
      <span className={cx(styles.rollItem, done && styles.rollOut)} aria-hidden={done}>
        {from}
      </span>
      {done && <span className={cx(styles.rollItem, styles.rollIn)}>{to}</span>}
    </span>
  );
}

function Spinner({ size = 16 }: { readonly size?: number }) {
  return <CircleNotchIcon size={size} weight="bold" className={styles.spin} />;
}

function packLabel(target: string, registry: string): string {
  const [head] = target.split('.');
  return head !== undefined && /^\d+$/.test(head) && target === `${head}.${registry}`
    ? `Pack #${head}`
    : 'Account';
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
      setState({ kind: 'error', message: `Enter a NEAR account id, like 0.${registry}.` });
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
          <Button type="submit" loading={state.kind === 'loading'}>
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

      {(state.kind === 'loading' || state.kind === 'done') && (
        <Report
          key={`${network}:${target}`}
          report={state.kind === 'done' ? state.report : null}
          target={target}
          label={packLabel(target, registry)}
          planned={planned}
        />
      )}
    </div>
  );
}

/**
 * One layout for reading and for the result: the ticket and the rows are on screen from the first
 * frame with their real labels, and each value rolls in where it will stay.
 */
function Report({
  report,
  target,
  label,
  planned,
}: {
  readonly report: PackReport | null;
  readonly target: string;
  readonly label: string;
  readonly planned: readonly PlannedCheck[];
}) {
  const { network } = useNetwork();
  const reading = report === null;
  const checks = report?.checks;
  const summary = report?.summary;
  const failed = checks?.filter((item) => item.result === 'fail').length ?? 0;
  const ran = checks?.filter((item) => item.result !== 'skip').length ?? 0;
  const passed = failed === 0;
  const isPack = summary?.index !== null;
  const status = summary?.status == null ? null : PAWN_STATUS[summary.status];
  const rpcHost = new URL(NETWORKS[network].rpcUrl).host;
  const placeholder = <span className={styles.placeholder}>Reading</span>;

  return (
    <div className={cx(styles.result, reading && styles.reading)} aria-busy={reading}>
      <section className={styles.verdict} aria-label="Verdict">
        <div className={styles.head}>
          <span className={styles.mono}>{summary?.index === null ? 'Not a pack' : label}</span>
          <Roll
            className={styles.status}
            from="Reading"
            to={reading ? undefined : (status?.label ?? 'Unknown')}
          />
        </div>
        <div className={cx(styles.call, !reading && !passed && styles.callFail)}>
          <Roll
            className={styles.callIcon}
            from={<Spinner size={40} />}
            to={
              reading ? undefined : passed ? (
                <SealCheckIcon size={40} weight="fill" />
              ) : (
                <SealWarningIcon size={40} weight="fill" />
              )
            }
          />
          <span className={styles.callText}>
            <Roll
              className={styles.callTitle}
              from="Reading the chain"
              to={
                reading
                  ? undefined
                  : passed
                    ? 'Pack checks out'
                    : `${failed.toString()} ${failed === 1 ? 'check' : 'checks'} failed`
              }
            />
            <Roll
              className={styles.callNote}
              step={1}
              from={`${planned.length.toString()} checks from your browser`}
              to={
                reading
                  ? undefined
                  : `${(ran - failed).toString()} of ${ran.toString()} checks passed`
              }
            />
          </span>
        </div>

        {isPack && (
          <>
            <div className={styles.slot}>
              <span className={styles.mono}>Coins inside</span>
              <Roll
                className={styles.slotValue}
                step={2}
                from={placeholder}
                to={
                  summary === undefined ? undefined : summary.contents.length === 0 ? (
                    'Empty'
                  ) : (
                    <span className={styles.lines}>
                      {summary.contents.map((line) => (
                        <span key={line.text} className={styles.line}>
                          <CoinMark symbol={line.symbol} size={22} />
                          {line.text}
                        </span>
                      ))}
                    </span>
                  )
                }
              />
            </div>
            {summary?.repay != null && (
              <div className={cx(styles.slot, styles.slotEnter)} style={delay(3)}>
                <span className={styles.mono}>
                  {summary.dueNs === null ? 'Repay' : `Repay by ${formatDateTimeNs(summary.dueNs)}`}
                </span>
                <span className={styles.slotValue}>{summary.repay}</span>
              </div>
            )}
            <dl className={styles.holders}>
              <div>
                <dt className={styles.mono}>Title</dt>
                <dd>
                  <Roll
                    step={3}
                    from={placeholder}
                    to={summary === undefined ? undefined : (summary.titleOwner ?? 'Nobody')}
                  />
                </dd>
              </div>
              <div>
                <dt className={styles.mono}>Ticket</dt>
                <dd>
                  <Roll
                    step={4}
                    from={placeholder}
                    to={summary === undefined ? undefined : (summary.ticketOwner ?? 'Nobody')}
                  />
                </dd>
              </div>
            </dl>
          </>
        )}

        <div className={styles.foot}>
          <span className={styles.proof}>
            {reading ? 'Reading' : 'Read'} in your browser from {rpcHost}
            {report?.blockHeight != null &&
              ` at block ${report.blockHeight.toLocaleString('en-US')}`}
            .
          </span>
          <div className={styles.links}>
            {isPack && (
              <Link
                href={packPath(target)}
                className={cx(styles.link, reading && styles.linkIdle)}
                aria-disabled={reading}
                tabIndex={reading ? -1 : undefined}
              >
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
          reading ? (
            <SoftPill tone="neutral">Reading the chain</SoftPill>
          ) : (
            <SoftPill tone={passed ? 'positive' : 'negative'}>
              {ran - failed} of {ran} passed
            </SoftPill>
          )
        }
      >
        {planned.map((item, index) => (
          <CheckRow
            key={item.id}
            item={item}
            check={checks?.find((one) => one.id === item.id)}
            step={index}
          />
        ))}
      </ListCard>
    </div>
  );
}

function CheckRow({
  item,
  check,
  step,
}: {
  readonly item: PlannedCheck;
  readonly check: Check | undefined;
  readonly step: number;
}) {
  const result = check === undefined ? undefined : RESULT[check.result];
  return (
    <ListRow
      icon={
        <Roll
          className={styles.tile}
          step={step}
          from={
            <AppIcon color="light" size={36}>
              <Spinner />
            </AppIcon>
          }
          to={
            result === undefined ? undefined : (
              <AppIcon color={result.color} size={36}>
                {result.icon}
              </AppIcon>
            )
          }
        />
      }
      title={item.label}
      meta={
        <span className={styles.meta}>
          <Roll
            step={step}
            from={<span className={styles.placeholder}>Reading</span>}
            to={check?.detail}
          />
          <span className={styles.source}>{item.source}</span>
        </span>
      }
    />
  );
}
