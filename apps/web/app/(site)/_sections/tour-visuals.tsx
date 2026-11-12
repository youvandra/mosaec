import { CheckIcon, KeyIcon, LockKeyIcon, TicketIcon } from '@phosphor-icons/react/dist/ssr';
import Image from 'next/image';

import { AmountPair, AppIcon, NftCard, ProgressBar, StatusPill } from '@mosaec/ui';

import { ASSET_MARK, markFill } from '../../../lib/asset-marks';
import { CODE_HASHES, shortHash } from '../../../lib/deployments';
import { EXAMPLE_PAWN as E } from '../_content/facts';

import styles from './tour-visuals.module.css';

import type { ReactNode } from 'react';

const PACK_CODE_HASH = CODE_HASHES.testnet?.pack ?? '';

function Row({
  icon,
  label,
  sub,
  value,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly sub?: string;
  readonly value: ReactNode;
}) {
  return (
    <div className={styles.row}>
      <div className={styles.rowLeft}>
        {icon}
        <div>
          <div className="t-label">{label}</div>
          {sub !== undefined && <div className="t-caption">{sub}</div>}
        </div>
      </div>
      <div className={styles.rowValue}>{value}</div>
    </div>
  );
}

export function PackVisual() {
  return (
    <div className={styles.list}>
      <Row
        icon={
          <AppIcon color="light" size={40} mark fill={markFill(ASSET_MARK.ZEC)}>
            <Image src={ASSET_MARK.ZEC} alt="" width={24} height={24} />
          </AppIcon>
        }
        label="Zcash"
        sub="Held inside the verifier"
        value={`${E.collateral} ZEC`}
      />
      <Row
        icon={
          <AppIcon color="ink" size={40}>
            <KeyIcon weight="fill" />
          </AppIcon>
        }
        label="Access keys"
        sub="Nobody can sign for the pack"
        value="0"
      />
      <Row
        icon={
          <AppIcon color="blue" size={40}>
            <LockKeyIcon weight="fill" />
          </AppIcon>
        }
        label="Code hash"
        sub="Same for every pack"
        value={<span className={styles.mono}>{shortHash(PACK_CODE_HASH)}</span>}
      />
    </div>
  );
}

export function AskVisual() {
  return (
    <AmountPair
      from={{ label: 'You deposit', amount: E.collateral, symbol: 'ZEC', mark: ASSET_MARK.ZEC }}
      to={{ label: 'You receive', amount: E.principal, symbol: 'USDC', mark: ASSET_MARK.USDC }}
      note={`Repay ${E.repayment} USDC within ${E.termDays.toString()} days`}
    />
  );
}

const FILL_STEPS = [
  { label: 'Lender pays', sub: `${E.principal} USDC into the registry` },
  { label: 'Terms match', sub: 'Contents hash, repayment and term' },
  { label: 'Title to the lender', sub: 'Owner of the pack from now on' },
  { label: 'USDC and Ticket to you', sub: 'Your right to buy the ZEC back' },
] as const;

export function FillVisual() {
  return (
    <div className={styles.flow}>
      {FILL_STEPS.map((step) => (
        <div key={step.label} className={styles.flowStep}>
          <span className={styles.flowDot}>
            <CheckIcon weight="bold" size={14} />
          </span>
          <div className={styles.flowText}>
            <span className="t-label">{step.label}</span>
            <span className="t-caption">{step.sub}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function RedeemVisual() {
  return (
    <div className={styles.cardRow}>
      <NftCard
        kind="ticket"
        tokenLabel="Pack #0"
        value={`${E.repayment} USDC`}
        meta={`Buys ${E.collateral} ZEC`}
        icon={<TicketIcon size={22} weight="fill" />}
        className={styles.cardTilt}
      />
      <div className={styles.side}>
        <StatusPill tone="positive">Active</StatusPill>
        <ProgressBar
          label="Term elapsed"
          valueText={`31 of ${E.termDays.toString()} days`}
          ratio={31 / E.termDays}
        />
        <ProgressBar label="ZEC price moves" valueText="Ignored" ratio={0} tone="positive" />
      </div>
    </div>
  );
}

export function ExitVisual() {
  return (
    <div className={styles.side} style={{ width: '100%', maxWidth: 380 }}>
      <AmountPair
        from={{ label: 'From the pack', amount: E.collateral, symbol: 'ZEC', mark: ASSET_MARK.ZEC }}
        to={{ label: 'To Zcash', amount: E.collateral, symbol: 'ZEC', mark: ASSET_MARK.ZEC }}
        note="Bridge fee applies"
      />
    </div>
  );
}
