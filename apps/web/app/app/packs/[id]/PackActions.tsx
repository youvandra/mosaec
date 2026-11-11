'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { NETWORKS } from '@mosaec/config/networks';
import { MosaecViews, mosaecCalls } from '@mosaec/sdk';
import { Button, ButtonLink } from '@mosaec/ui';

import { useNetwork } from '../../../../lib/near/network';
import { useTransaction } from '../../../../lib/near/useTransaction';
import { useWallet } from '../../../../lib/near/wallet';
import { amountText } from '../../../../lib/pack-view';
import styles from '../../_components/ActionCard.module.css';
import { Facts } from '../../_components/Panel';
import { appPath } from '../../_components/routes';
import { TxStatus } from '../../_components/TxStatus';
import { WalletButton } from '../../_components/WalletButton';

import type { Amount, PackDetail } from '../../../../lib/api';
import type { ReactNode } from 'react';

const NS_PER_MS = 1_000_000n;

function nowNs(): bigint {
  return BigInt(Date.now()) * NS_PER_MS;
}

function Card({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className={styles.card} aria-label={title}>
      <h2 className="t-h5">{title}</h2>
      {children}
    </section>
  );
}

/** Verifier balance of the connected account in one token, or `null` while unknown. */
function useBalance(tokenId: string | undefined): bigint | null {
  const { network } = useNetwork();
  const { accountId } = useWallet();
  const [balance, setBalance] = useState<bigint | null>(null);
  useEffect(() => {
    setBalance(null);
    if (accountId === null || tokenId === undefined) return;
    let live = true;
    new MosaecViews(network)
      .balanceOf(accountId, tokenId)
      .then((value) => {
        if (live) setBalance(value);
      })
      .catch(() => {
        if (live) setBalance(null);
      });
    return () => {
      live = false;
    };
  }, [network, accountId, tokenId]);
  return balance;
}

function balanceText(balance: bigint | null, like: Amount): string {
  if (balance === null) return 'Checking';
  return amountText({ ...like, amount: balance.toString() }, 6);
}

function FillCard({ pack }: { readonly pack: PackDetail }) {
  const { network } = useNetwork();
  const { state, run } = useTransaction();
  const [agreed, setAgreed] = useState(false);
  const offer = pack.offer;
  const terms = pack.terms;
  const balance = useBalance(offer?.price.tokenId);
  if (offer === null || terms?.termNs == null || pack.contentsHash === null) return null;
  const price = BigInt(offer.price.amount);
  const short = balance !== null && balance < price;

  const fill = () => {
    void run([
      mosaecCalls(network).fill({
        pack: pack.id,
        terms: {
          kToken: terms.repayment.tokenId,
          kAmount: BigInt(terms.repayment.amount),
          termNs: BigInt(terms.termNs ?? '0'),
        },
        contentsHash: pack.contentsHash ?? '',
        payToken: offer.price.tokenId,
        price,
      }),
    ]);
  };

  return (
    <Card title="Lend on this pack">
      <Facts
        rows={[
          ['You pay now', amountText(offer.price, 6)],
          ['You receive by the date', amountText(terms.repayment, 6)],
          ['Or, if unpaid', 'The pack and its contents'],
          ['Your balance', balanceText(balance, offer.price)],
        ]}
      />
      {short && <p className={styles.warn}>Your verifier balance is below the loan amount.</p>}
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={agreed}
          onChange={(event) => {
            setAgreed(event.target.checked);
          }}
        />
        I understand the borrower may let the Ticket lapse, and then I keep the coins whatever they
        are worth.
      </label>
      <Button fullWidth disabled={!agreed || short || state.phase === 'pending'} onClick={fill}>
        {state.phase === 'pending' ? 'Waiting for the Wallet' : 'Fill This Pawn'}
      </Button>
      <TxStatus state={state} success="Filled. You now hold the Title." />
    </Card>
  );
}

function RedeemCard({ pack }: { readonly pack: PackDetail }) {
  const { network } = useNetwork();
  const { state, run } = useTransaction();
  const terms = pack.terms;
  const balance = useBalance(terms?.repayment.tokenId);
  if (terms === null) return null;
  const k = BigInt(terms.repayment.amount);
  const short = balance !== null && balance < k;
  return (
    <Card title="Redeem your coins">
      <Facts
        rows={[
          ['You pay', amountText(terms.repayment, 6)],
          ['You receive', pack.contents.map((line) => amountText(line, 8)).join(' + ')],
          ['Your balance', balanceText(balance, terms.repayment)],
        ]}
      />
      {short && <p className={styles.warn}>Your verifier balance is below the repayment.</p>}
      <Button
        fullWidth
        disabled={short || state.phase === 'pending'}
        onClick={() => {
          void run([
            mosaecCalls(network).exercise({
              pack: pack.id,
              kToken: terms.repayment.tokenId,
              kAmount: k,
            }),
          ]);
        }}
      >
        {state.phase === 'pending' ? 'Waiting for the Wallet' : 'Redeem'}
      </Button>
      <TxStatus state={state} success="Redeemed. The contents are on their way to you." />
    </Card>
  );
}

function SimpleAction({
  title,
  body,
  label,
  success,
  call,
}: {
  readonly title: string;
  readonly body: string;
  readonly label: string;
  readonly success: string;
  readonly call: () => Parameters<ReturnType<typeof useTransaction>['run']>[0];
}) {
  const { state, run } = useTransaction();
  return (
    <Card title={title}>
      <p className="t-body-sm">{body}</p>
      <Button
        variant="secondary"
        fullWidth
        disabled={state.phase === 'pending'}
        onClick={() => {
          void run(call());
        }}
      >
        {state.phase === 'pending' ? 'Waiting for the Wallet' : label}
      </Button>
      <TxStatus state={state} success={success} />
    </Card>
  );
}

/** The actions the connected account can take on this pack right now. */
export function PackActions({ pack }: { readonly pack: PackDetail }) {
  const { network } = useNetwork();
  const { accountId } = useWallet();
  const calls = mosaecCalls(network);
  const verifier = NETWORKS[network].verifierAccountId;

  if (accountId === null) {
    return (
      <Card title="Act on this pack">
        <p className="t-body-sm">Connect a wallet to lend, redeem or withdraw.</p>
        <WalletButton />
      </Card>
    );
  }

  const isTitle = pack.title.owner === accountId;
  const isTicket = pack.ticket?.owner === accountId;
  const deadline = pack.terms?.deadlineNs ?? pack.terms?.expiresAtNs ?? null;
  const pastDeadline = deadline !== null && nowNs() > BigInt(deadline);
  const cards: ReactNode[] = [];

  if (pack.state === 'offered') {
    if (isTitle) {
      cards.push(
        <SimpleAction
          key="cancel"
          title="Your offer"
          body="Cancel to unfreeze the pack. You keep the Title and the coins."
          label="Cancel Offer"
          success="Offer cancelled."
          call={() => [calls.cancel(pack.id)]}
        />,
      );
    } else {
      cards.push(<FillCard key="fill" pack={pack} />);
    }
  }

  if (pack.state === 'written') {
    if (isTicket && !pastDeadline) cards.push(<RedeemCard key="redeem" pack={pack} />);
    if (pack.ticket?.owner === verifier) {
      cards.push(
        <Card key="intents" title="Ticket held inside NEAR Intents">
          <p className={styles.warn}>
            Withdraw the Ticket to a wallet before the date: only its direct holder can redeem.
          </p>
        </Card>,
      );
    }
    if (pastDeadline) {
      cards.push(
        <SimpleAction
          key="expire"
          title="Term has ended"
          body="Anyone can close the pawn now. The Title holder keeps the contents."
          label="Expire Pawn"
          success="Expired. The pack is free for the Title holder."
          call={() => [calls.expire(pack.id)]}
        />,
      );
    }
  }

  if (pack.state === 'free' && isTitle) {
    if (pack.contents.length > 0) {
      cards.push(
        <SimpleAction
          key="withdraw"
          title="Withdraw the contents"
          body={`Moves ${pack.contents.map((line) => amountText(line, 8)).join(' + ')} to your verifier balance.`}
          label="Withdraw to My Balance"
          success="Withdrawn to your verifier balance."
          call={() =>
            pack.contents.map((line) =>
              calls.withdraw({
                pack: pack.id,
                tokenId: line.tokenId,
                amount: BigInt(line.amount),
                destination: { kind: 'verifier', accountId },
              }),
            )
          }
        />,
      );
    }
    cards.push(
      <Card key="pawn" title="Use this pack">
        <p className="t-body-sm">You hold the Title. Deposit coins and ask for a loan.</p>
        <ButtonLink
          href={`${appPath('/borrow')}?pack=${encodeURIComponent(pack.id)}`}
          as={Link}
          fullWidth
          showIcon
        >
          Open a Pawn
        </ButtonLink>
      </Card>,
    );
  }

  if (cards.length === 0) {
    return (
      <Card title="Nothing to do here">
        <p className="t-body-sm">
          {accountId} holds neither right on this pack in its current state. Anyone can still verify
          it.
        </p>
      </Card>
    );
  }
  return <>{cards}</>;
}
