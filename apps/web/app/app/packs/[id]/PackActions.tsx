'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { NETWORKS } from '@mosaec/config/networks';
import { MosaecViews, mosaecCalls } from '@mosaec/sdk';
import { Button, ButtonLink, Callout, useConfirm } from '@mosaec/ui';

import { payoutOf } from '../../../../lib/collect';
import { formatDateTimeNs } from '../../../../lib/format';
import { SIGN_FOOTNOTE } from '../../../../lib/legal';
import { useChainVersion } from '../../../../lib/near/chain-change';
import { useNetwork } from '../../../../lib/near/network';
import { useTransaction } from '../../../../lib/near/useTransaction';
import { useWallet } from '../../../../lib/near/wallet';
import { amountText } from '../../../../lib/pack-view';
import { usdValue, useUsdPrices } from '../../../../lib/prices';
import { track } from '../../../../lib/track';
import styles from '../../_components/ActionCard.module.css';
import { DueReminder } from '../../_components/DueReminder';
import { Facts } from '../../_components/Panel';
import { appPath, packPath } from '../../_components/routes';
import { ValueCheck } from '../../_components/ValueCheck';
import { WalletButton } from '../../_components/WalletButton';

import { TransferCard } from './TransferCard';

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
  const chainVersion = useChainVersion();
  useEffect(() => {
    setBalance(null);
  }, [network, accountId, tokenId]);
  useEffect(() => {
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
  }, [network, accountId, tokenId, chainVersion]);
  return balance;
}

function balanceText(balance: bigint | null, like: Amount): string {
  if (balance === null) return 'Checking';
  return amountText({ ...like, amount: balance.toString() }, 6);
}

function dueText(terms: PackDetail['terms']): string {
  if (terms?.termNs == null) return '-';
  const days = Number(BigInt(terms.termNs) / (86_400n * 1_000_000_000n));
  return days >= 1 ? `${days.toString()} days after you fill` : 'Within a day of the fill';
}

function FillCard({ pack }: { readonly pack: PackDetail }) {
  const { network } = useNetwork();
  const confirm = useConfirm();
  const { state, run } = useTransaction({
    pending: `Filling pawn #${pack.index}`,
    success: 'Filled. You hold the Title.',
  });
  const [agreed, setAgreed] = useState(false);
  const offer = pack.offer;
  const terms = pack.terms;
  const balance = useBalance(offer?.price.tokenId);
  if (offer === null || terms?.termNs == null || pack.contentsHash === null) return null;
  const price = BigInt(offer.price.amount);
  const short = balance !== null && balance < price;

  const fill = async () => {
    const ok = await confirm({
      footnote: SIGN_FOOTNOTE,
      title: 'Fill this pawn?',
      body: 'You pay the loan now and receive the Title. The borrower holds the Ticket.',
      rows: [
        ['You pay now', amountText(offer.price, 6)],
        ['Repaid to you', amountText(terms.repayment, 6)],
        ['Due', dueText(terms)],
        ['If unpaid', pack.contents.map((line) => amountText(line, 8)).join(' + ')],
      ],
      warning:
        'The fill is final. If the Ticket lapses you keep the coins, whatever they are worth.',
      confirmLabel: 'Fill Pawn',
    });
    if (!ok) return;
    track('fill_started');
    const sent = await run([
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
    if (sent !== null) track('fill_settled');
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
      {short && <Callout tone="warning">Your Mosaec balance is below the loan amount.</Callout>}
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
      <Button
        fullWidth
        disabled={!agreed || short}
        loading={state.phase === 'pending'}
        onClick={() => {
          void fill();
        }}
      >
        {state.phase === 'pending' ? 'Waiting for the Wallet' : 'Fill This Pawn'}
      </Button>
    </Card>
  );
}

function RedeemCard({ pack }: { readonly pack: PackDetail }) {
  const { network } = useNetwork();
  const confirm = useConfirm();
  const { state, run } = useTransaction({
    pending: `Redeeming pack #${pack.index}`,
    success: 'Redeemed. Your coins are on the way.',
  });
  const terms = pack.terms;
  const balance = useBalance(terms?.repayment.tokenId);
  const prices = useUsdPrices();
  if (terms === null) return null;
  const k = BigInt(terms.repayment.amount);
  const worth = usdValue(pack.contents, prices);
  const owed = usdValue([terms.repayment], prices);
  const short = balance !== null && balance < k;
  const redeem = async () => {
    const ok = await confirm({
      footnote: SIGN_FOOTNOTE,
      title: 'Redeem your coins?',
      rows: [
        ['You pay', amountText(terms.repayment, 6)],
        ['You receive', pack.contents.map((line) => amountText(line, 8)).join(' + ')],
        ['Due by', terms.expiresAtNs === null ? '-' : formatDateTimeNs(terms.expiresAtNs)],
      ],
      body: 'The repayment goes to the Title holder and the pack releases its contents to you.',
      confirmLabel: 'Pay and Redeem',
    });
    if (!ok) return;
    const sent = await run([
      mosaecCalls(network).exercise({
        pack: pack.id,
        kToken: terms.repayment.tokenId,
        kAmount: k,
      }),
    ]);
    if (sent !== null) track('redeem_settled');
  };

  return (
    <Card title="Redeem your coins">
      <Facts
        rows={[
          ['You pay', amountText(terms.repayment, 6)],
          ['You receive', pack.contents.map((line) => amountText(line, 8)).join(' + ')],
          ['Your balance', balanceText(balance, terms.repayment)],
        ]}
      />
      {worth !== null && owed !== null && <ValueCheck side="borrower" worth={worth} owed={owed} />}
      {short && <Callout tone="warning">Your Mosaec balance is below the repayment.</Callout>}
      {terms.expiresAtNs !== null && (
        <DueReminder
          reminder={{
            dueNs: terms.expiresAtNs,
            packIndex: pack.index,
            owed: amountText(terms.repayment, 2),
            path: packPath(pack.id),
          }}
        />
      )}
      <Button
        fullWidth
        disabled={short}
        loading={state.phase === 'pending'}
        onClick={() => {
          void redeem();
        }}
      >
        {state.phase === 'pending' ? 'Waiting for the Wallet' : 'Redeem'}
      </Button>
    </Card>
  );
}

function SimpleAction({
  title,
  body,
  label,
  success,
  call,
  ask,
}: {
  readonly title: string;
  readonly body: string;
  readonly label: string;
  readonly success: string;
  readonly call: () => Parameters<ReturnType<typeof useTransaction>['run']>[0];
  /** Asked before the wallet opens. */
  readonly ask: { readonly title: string; readonly body: string; readonly warning?: string };
}) {
  const confirm = useConfirm();
  const { state, run } = useTransaction({ pending: title, success });
  return (
    <Card title={title}>
      <p className="t-body-sm">{body}</p>
      <Button
        variant="secondary"
        fullWidth
        loading={state.phase === 'pending'}
        onClick={() => {
          void confirm({ ...ask, confirmLabel: label, footnote: SIGN_FOOTNOTE }).then((ok) => {
            if (ok) void run(call());
          });
        }}
      >
        {state.phase === 'pending' ? 'Waiting for the Wallet' : label}
      </Button>
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
          ask={{
            title: 'Cancel your offer?',
            body: 'The offer leaves the market and the pack unfreezes. You keep the Title and the coins.',
          }}
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
          <Callout tone="warning">
            Withdraw the Ticket to a wallet before the date: only its direct holder can redeem.
          </Callout>
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
          ask={{
            title: 'Close this pawn?',
            body: 'The term has ended. Closing gives the contents to the Title holder.',
            warning: 'The Ticket can no longer redeem after this.',
          }}
        />,
      );
    }
  }

  if (pack.state === 'free' && isTitle) {
    if (pack.contents.length > 0) {
      const contentsText = pack.contents.map((line) => amountText(line, 8)).join(' + ');
      const payout = payoutOf(pack.status, contentsText);
      cards.push(
        <SimpleAction
          key="withdraw"
          title={payout.title}
          body={payout.note}
          label={payout.label}
          success={
            payout.kind === 'own'
              ? 'Withdrawn to your Mosaec balance.'
              : `Collected ${contentsText} to your Mosaec balance.`
          }
          ask={{
            title: payout.kind === 'own' ? 'Withdraw the contents?' : `${payout.title}?`,
            body: `Moves ${contentsText} from the pack to your Mosaec balance.`,
          }}
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

  /* A Ticket only matters while its pawn runs; a Title always can move. */
  const sendable = [
    ...(isTitle ? (['title'] as const) : []),
    ...(isTicket && pack.state === 'written' && !pastDeadline ? (['ticket'] as const) : []),
  ];
  if (sendable.length > 0) cards.push(<TransferCard key="send" pack={pack} rights={sendable} />);

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
