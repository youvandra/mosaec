'use client';

import { ArrowSquareOutIcon, CheckCircleIcon } from '@phosphor-icons/react';
import Image from 'next/image';
import { useEffect, useState } from 'react';

import { explorerTxUrl } from '@mosaec/config/networks';
import { Button, cx, useToast } from '@mosaec/ui';

import { ApiError, claimFaucet } from '../../../lib/api';
import { ASSET_MARK } from '../../../lib/asset-marks';
import { useWallet } from '../../../lib/near/wallet';
import { track } from '../../../lib/track';

import styles from './faucet.module.css';

type State =
  | { readonly kind: 'idle' }
  | { readonly kind: 'pending' }
  | { readonly kind: 'done'; readonly txHash: string }
  | { readonly kind: 'error'; readonly message: string };

const GRANT = [
  { symbol: 'ZEC', amount: '1.00' },
  { symbol: 'USDC', amount: '1,000.00' },
] as const;

/** One form: an account id, prefilled from the wallet, and the grant it receives. */
export function FaucetPanel() {
  const { accountId } = useWallet();
  const [input, setInput] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const toast = useToast();

  useEffect(() => {
    if (accountId !== null) setInput(accountId);
  }, [accountId]);

  const send = () => {
    const target = input.trim().toLowerCase();
    if (target === '') return;
    setState({ kind: 'pending' });
    claimFaucet(target)
      .then((grant) => {
        setState({ kind: 'done', txHash: grant.txHash });
        track('faucet_claimed');
        toast.show({
          tone: 'success',
          title: '1 ZEC and 1,000 USDC sent',
          body: `To ${grant.accountId}`,
          action: { label: 'View transaction', href: explorerTxUrl('testnet', grant.txHash) },
        });
      })
      .catch((cause: unknown) => {
        setState({
          kind: 'error',
          message:
            cause instanceof ApiError && cause.status === 429
              ? 'This account already received a grant today. Try again tomorrow.'
              : cause instanceof Error
                ? cause.message
                : 'The faucet is unavailable.',
        });
      });
  };

  return (
    <section className={styles.panel}>
      <div className={styles.grant}>
        {GRANT.map((line) => (
          <div key={line.symbol} className={styles.well}>
            <span className={styles.label}>You receive</span>
            <span className={styles.amount}>
              {line.amount}
              <span className={styles.pill}>
                <Image src={ASSET_MARK[line.symbol]} alt="" width={24} height={24} />
                {line.symbol}
              </span>
            </span>
          </div>
        ))}
      </div>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <label htmlFor="faucet-account" className="sr-only">
          NEAR testnet account
        </label>
        <input
          id="faucet-account"
          className={styles.input}
          placeholder="you.testnet"
          value={input}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setInput(event.target.value);
          }}
        />
        <Button type="submit" disabled={input.trim() === ''} loading={state.kind === 'pending'}>
          {state.kind === 'pending' ? 'Sending' : 'Send Test Tokens'}
        </Button>
      </form>
      {state.kind === 'done' && (
        <p className={cx('t-body-sm', styles.ok)} role="status">
          <CheckCircleIcon size={18} weight="fill" />
          Sent. Ready to borrow or lend.
          <a href={explorerTxUrl('testnet', state.txHash)} target="_blank" rel="noreferrer">
            View transaction <ArrowSquareOutIcon size={12} weight="bold" />
          </a>
        </p>
      )}
      {state.kind === 'error' && (
        <p className={cx('t-body-sm', styles.bad)} role="alert">
          {state.message}
        </p>
      )}
    </section>
  );
}
