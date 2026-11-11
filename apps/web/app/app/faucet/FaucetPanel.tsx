'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

import { explorerTxUrl } from '@mosaec/config/networks';
import { Button, useToast } from '@mosaec/ui';

import { claimFaucet } from '../../../lib/api';
import { ASSET_MARK } from '../../../lib/asset-marks';
import { useWallet } from '../../../lib/near/wallet';
import { track } from '../../../lib/track';

import styles from './faucet.module.css';

const GRANT = [
  { symbol: 'ZEC', amount: '1.00' },
  { symbol: 'BTC', amount: '0.01' },
  { symbol: 'SOL', amount: '1.00' },
  { symbol: 'USDC', amount: '1,000.00' },
] as const;

/** One form: an account id, prefilled from the wallet, and the grant it receives. The toast is the only feedback. */
export function FaucetPanel() {
  const { accountId } = useWallet();
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (accountId !== null) setInput(accountId);
  }, [accountId]);

  const send = () => {
    const target = input.trim().toLowerCase();
    if (target === '') return;
    setPending(true);
    claimFaucet(target)
      .then((grant) => {
        track('faucet_claimed');
        toast.show({
          tone: 'success',
          title: 'Test ZEC, BTC, SOL and USDC sent',
          body: `To ${grant.accountId}`,
          action: { label: 'View transaction', href: explorerTxUrl('testnet', grant.txHash) },
        });
      })
      .catch((cause: unknown) => {
        /* The API names the exact limit hit (account, address, daily amount or a low faucet). */
        const message = cause instanceof Error ? cause.message : 'The faucet is unavailable.';
        toast.show({ tone: 'error', title: 'No test tokens sent', body: message });
      })
      .finally(() => {
        setPending(false);
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
        <Button type="submit" disabled={input.trim() === ''} loading={pending}>
          {pending ? 'Sending' : 'Send Test Tokens'}
        </Button>
      </form>
    </section>
  );
}
