'use client';

import Image from 'next/image';
import { useState } from 'react';

import { Button, Dialog, cx } from '@mosaec/ui';

import { NEAR_MARK } from '../../../lib/asset-marks';
import { useWallet } from '../../../lib/near/wallet';

import styles from './WalletButton.module.css';

/** Connect button that turns into the account chip once a wallet is connected. */
export function WalletButton({
  size = 'sm',
  fullWidth = false,
  label = 'Connect Wallet',
  appearance = 'chip',
}: {
  readonly size?: 'sm' | 'md';
  readonly fullWidth?: boolean;
  readonly label?: string;
  /** `sidebar` is the source's user row at the foot of the app sidebar. */
  readonly appearance?: 'chip' | 'sidebar';
} = {}) {
  const { ready, accountId, walletName, options, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setError(null);
  };

  if (accountId === null) {
    return (
      <>
        <Button
          size={size}
          fullWidth={fullWidth || appearance === 'sidebar'}
          variant={appearance === 'sidebar' ? 'inverse' : 'primary'}
          disabled={!ready}
          onClick={() => {
            setOpen(true);
          }}
        >
          {label}
        </Button>
        <Dialog open={open} title="Connect a NEAR wallet" onClose={close}>
          <div className={styles.list}>
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                className={styles.wallet}
                onClick={() => {
                  setError(null);
                  connect(option.id)
                    .then(close)
                    .catch((cause: unknown) => {
                      setError(cause instanceof Error ? cause.message : 'The wallet declined.');
                    });
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- icon URLs come from wallet modules */}
                <img src={option.iconUrl} alt="" width={32} height={32} />
                {option.name}
              </button>
            ))}
          </div>
          {error !== null && (
            <p
              className="t-body-sm"
              role="alert"
              style={{ color: 'var(--negative)', marginTop: 12 }}
            >
              {error}
            </p>
          )}
          <p className={cx('t-caption', styles.note)}>
            Mosaec asks for no access key. Each action opens your wallet for approval.
          </p>
        </Dialog>
      </>
    );
  }

  return (
    <>
      {appearance === 'sidebar' ? (
        <button
          type="button"
          className={styles.user}
          onClick={() => {
            setOpen(true);
          }}
          aria-label={`Account ${accountId}`}
        >
          <span className={styles.userAvatar} aria-hidden="true">
            {accountId.slice(0, 2)}
            <Image className={styles.chain} src={NEAR_MARK.src} alt="" width={14} height={14} />
          </span>
          <span className={styles.userText}>
            <span className={styles.userName}>{accountId}</span>
            <span className={styles.userRole}>{walletName ?? 'NEAR wallet'}</span>
          </span>
        </button>
      ) : (
        <button
          type="button"
          className={styles.chip}
          onClick={() => {
            setOpen(true);
          }}
          aria-label={`Account ${accountId}`}
        >
          <span className={styles.avatar} aria-hidden="true">
            {accountId.slice(0, 2)}
            <Image className={styles.chain} src={NEAR_MARK.src} alt="" width={14} height={14} />
          </span>
          <span className={styles.account}>{accountId}</span>
        </button>
      )}
      <Dialog open={open} title="Your wallet" onClose={close}>
        <div className={styles.menu}>
          <p className="t-body-sm">
            Connected as <strong>{accountId}</strong>
            {walletName !== null ? ` with ${walletName}` : ''}.
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              void disconnect().then(close);
            }}
          >
            Disconnect
          </Button>
        </div>
      </Dialog>
    </>
  );
}
