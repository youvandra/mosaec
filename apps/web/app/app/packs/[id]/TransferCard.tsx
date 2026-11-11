'use client';

import { PaperPlaneTiltIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { mosaecCalls } from '@mosaec/sdk';
import { Button, Callout, Segmented, useConfirm } from '@mosaec/ui';

import { SIGN_FOOTNOTE } from '../../../../lib/legal';
import { accountState, isAccountId } from '../../../../lib/near/account';
import { useNetwork } from '../../../../lib/near/network';
import { useTransaction } from '../../../../lib/near/useTransaction';
import styles from '../../_components/ActionCard.module.css';

import transfer from './TransferCard.module.css';

import type { PackDetail } from '../../../../lib/api';

type Right = 'title' | 'ticket';

const LABEL: Readonly<Record<Right, string>> = { title: 'Title', ticket: 'Ticket' };

const NOTE: Readonly<Record<Right, string>> = {
  title: 'The new holder owns the pack and, after a fill, the right to the coins if unpaid.',
  ticket: 'The new holder can redeem the coins by the date. The date stays the same.',
};

/** Sends a Title or Ticket the connected account holds to another NEAR account. */
export function TransferCard({
  pack,
  rights,
}: {
  readonly pack: PackDetail;
  readonly rights: readonly Right[];
}) {
  const { network } = useNetwork();
  const confirm = useConfirm();
  const { state, run, reset } = useTransaction({
    pending: `Sending the ${LABEL[rights[0] ?? 'title']}`,
    success: 'Sent',
  });
  const [right, setRight] = useState<Right>(rights[0] ?? 'title');
  const [receiver, setReceiver] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const tokenId = right === 'title' ? pack.title.id : (pack.ticket?.id ?? null);
  const offered = right === 'title' && pack.state === 'offered';
  const target = receiver.trim().toLowerCase();

  const send = async () => {
    if (tokenId === null) return;
    if (!isAccountId(target)) {
      setProblem('That is not a NEAR account name.');
      return;
    }
    setChecking(true);
    const found = await accountState(network, target);
    setChecking(false);
    if (found !== 'exists') {
      setProblem(
        found === 'missing'
          ? `${target} does not exist on ${network}.`
          : 'Could not reach NEAR to check that account. Try again.',
      );
      return;
    }
    setProblem(null);
    const ok = await confirm({
      footnote: SIGN_FOOTNOTE,
      title: `Send the ${LABEL[right]}?`,
      body: NOTE[right],
      rows: [
        ['Right', `${LABEL[right]} of pack #${pack.index}`],
        ['To', target],
      ],
      warning: `A transfer cannot be undone. Only ${target} can send it back.`,
      tone: 'danger',
      confirmLabel: `Send ${LABEL[right]}`,
    });
    if (!ok) return;
    await run([mosaecCalls(network).nftTransfer(tokenId, target)], {
      pending: `Sending the ${LABEL[right]} to ${target}`,
      success: `Sent. ${target} holds the ${LABEL[right]}`,
    });
  };

  const busy = checking || state.phase === 'pending';
  return (
    <section className={styles.card} aria-label="Send a right">
      <h2 className="t-h5">Send {rights.length > 1 ? 'a Right' : `the ${LABEL[right]}`}</h2>
      {rights.length > 1 && (
        <Segmented
          size="sm"
          tone="ink"
          label="Right to send"
          value={right}
          options={[
            { id: 'title', label: 'Title' },
            { id: 'ticket', label: 'Ticket' },
          ]}
          onChange={(value) => {
            setRight(value);
            reset();
          }}
        />
      )}
      <p className="t-body-sm">{NOTE[right]}</p>
      {offered && (
        <Callout tone="warning">Sending the Title cancels the open offer on this pack.</Callout>
      )}
      <label className={transfer.field}>
        <span className="sr-only">Receiver account</span>
        <input
          className={transfer.input}
          value={receiver}
          placeholder="name.testnet"
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          onChange={(event) => {
            setReceiver(event.target.value);
            setProblem(null);
          }}
        />
      </label>
      {problem !== null && <Callout tone="danger">{problem}</Callout>}
      <Button
        variant="secondary"
        fullWidth
        disabled={target === ''}
        loading={busy}
        icon={<PaperPlaneTiltIcon size={16} weight="fill" />}
        onClick={() => {
          void send();
        }}
      >
        {checking
          ? 'Checking the Account'
          : state.phase === 'pending'
            ? 'Waiting for the Wallet'
            : `Send ${LABEL[right]}`}
      </Button>
    </section>
  );
}
