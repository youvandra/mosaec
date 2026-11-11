'use client';

import { CheckCircleIcon, MinusCircleIcon, XCircleIcon } from '@phosphor-icons/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { explorerAccountUrl } from '@mosaec/config/networks';
import { Button, ErrorState, Skeleton, StatusPill } from '@mosaec/ui';

import { useNetwork } from '../../../lib/near/network';
import { verifyPack } from '../../../lib/near/verify';

import styles from './VerifyPanel.module.css';

import type { Check } from '../../../lib/near/verify';

const ACCOUNT_ID = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

type State =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'done'; readonly checks: readonly Check[] }
  | { readonly kind: 'error'; readonly message: string };

const ICON = {
  pass: <CheckCircleIcon size={22} weight="fill" className={styles.pass} />,
  fail: <XCircleIcon size={22} weight="fill" className={styles.fail} />,
  skip: <MinusCircleIcon size={22} weight="fill" className={styles.skip} />,
} as const;

export function VerifyPanel() {
  const { network } = useNetwork();
  const router = useRouter();
  const search = useSearchParams();
  const target = search.get('pack') ?? '';
  const [input, setInput] = useState(target);
  const [state, setState] = useState<State>({ kind: 'idle' });

  useEffect(() => {
    if (target === '') {
      setState({ kind: 'idle' });
      return;
    }
    if (!ACCOUNT_ID.test(target)) {
      setState({ kind: 'error', message: 'That is not a NEAR account id.' });
      return;
    }
    let live = true;
    setState({ kind: 'loading' });
    verifyPack(network, target)
      .then((checks) => {
        if (live) setState({ kind: 'done', checks });
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
  }, [network, target]);

  const passed = state.kind === 'done' && state.checks.every((c) => c.result !== 'fail');

  return (
    <>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          router.replace(`?pack=${encodeURIComponent(input.trim().toLowerCase())}`);
        }}
      >
        <label htmlFor="pack-id" className="sr-only">
          Pack account
        </label>
        <input
          id="pack-id"
          className={styles.input}
          placeholder="0.v0.mosaec.testnet"
          value={input}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setInput(event.target.value);
          }}
        />
        <Button type="submit">Verify</Button>
      </form>
      {state.kind === 'loading' && (
        <div className={styles.list} aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={styles.row}>
              <Skeleton width={22} height={22} />
              <Skeleton width="60%" />
            </div>
          ))}
        </div>
      )}
      {state.kind === 'error' && (
        <ErrorState title="Verification could not run">{state.message}</ErrorState>
      )}
      {state.kind === 'done' && (
        <>
          <div className={styles.summary}>
            <StatusPill tone={passed ? 'positive' : 'negative'}>
              {passed ? 'Every check passed' : 'A check failed'}
            </StatusPill>{' '}
            <a
              className="t-caption"
              style={{ textDecoration: 'underline' }}
              href={explorerAccountUrl(network, target)}
              target="_blank"
              rel="noreferrer"
            >
              Open {target} on the explorer
            </a>
          </div>
          <ul className={styles.list}>
            {state.checks.map((item) => (
              <li key={item.id} className={styles.row}>
                {ICON[item.result]}
                <span className="t-label">{item.label}</span>
                <p className="t-caption">{item.detail}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
