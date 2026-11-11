'use client';

import { CheckCircleIcon, WarningCircleIcon } from '@phosphor-icons/react';

import { explorerTxUrl } from '@mosaec/config/networks';

import { useNetwork } from '../../../lib/near/network';

import type { TxState } from '../../../lib/near/useTransaction';

/** One line under an action: what happened, with the explorer link. */
export function TxStatus({
  state,
  success,
}: {
  readonly state: TxState;
  readonly success: string;
}) {
  const { network } = useNetwork();
  if (state.phase === 'success') {
    const hash = state.transactions.at(-1)?.hash;
    return (
      <p
        className="t-body-sm"
        role="status"
        style={{ color: 'var(--positive)', display: 'flex', gap: 8 }}
      >
        <CheckCircleIcon size={18} weight="fill" />
        <span>
          {success}{' '}
          {hash !== undefined && (
            <a
              href={explorerTxUrl(network, hash)}
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: 'underline' }}
            >
              View transaction
            </a>
          )}
        </span>
      </p>
    );
  }
  if (state.phase === 'error') {
    return (
      <p
        className="t-body-sm"
        role="alert"
        style={{ color: 'var(--negative)', display: 'flex', gap: 8 }}
      >
        <WarningCircleIcon size={18} weight="fill" />
        <span>
          {state.message}{' '}
          {state.hash !== undefined && (
            <a
              href={explorerTxUrl(network, state.hash)}
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: 'underline' }}
            >
              View transaction
            </a>
          )}
        </span>
      </p>
    );
  }
  return null;
}
