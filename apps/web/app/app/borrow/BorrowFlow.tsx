'use client';

import {
  CaretDownIcon,
  CheckIcon,
  LockSimpleIcon,
  StampIcon,
  TicketIcon,
} from '@phosphor-icons/react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ASSETS } from '@mosaec/config/assets';
import { NETWORKS, explorerTxUrl } from '@mosaec/config/networks';
import { parseUnits } from '@mosaec/domain';
import { MINT_DEPOSIT_YOCTO, MosaecViews, aprBps, mosaecCalls } from '@mosaec/sdk';
import { Button, ButtonLink, Segmented, cx, useConfirm, useToast } from '@mosaec/ui';

import { ApiError, getPositions, requestInstantFill } from '../../../lib/api';
import { ASSET_MARK } from '../../../lib/asset-marks';
import { formatUnits, padCents } from '../../../lib/format';
import { SIGN_FOOTNOTE } from '../../../lib/legal';
import { useChainVersion } from '../../../lib/near/chain-change';
import { useNetwork } from '../../../lib/near/network';
import { useTransaction } from '../../../lib/near/useTransaction';
import { useWallet } from '../../../lib/near/wallet';
import {
  clearPendingInstant,
  loadPendingInstant,
  savePendingInstant,
} from '../../../lib/pending-instant';
import { usdText, useUsdPrices } from '../../../lib/prices';
import {
  SUGGESTED_LTV,
  SUGGESTED_MONTHLY_RATE_BPS,
  TERM_OPTIONS,
  suggestedPrincipal,
  suggestedRepayment,
} from '../../../lib/rates';
import { track } from '../../../lib/track';
import actionStyles from '../_components/ActionCard.module.css';
import { ListCard, SoftPill } from '../_components/ListCard';
import { packPath } from '../_components/routes';
import { WalletButton } from '../_components/WalletButton';

import styles from './BorrowFlow.module.css';
import { LoanChoice } from './LoanChoice';
import { useInstantQuote } from './useInstantQuote';

import type { LoanRoute } from './LoanChoice';
import type { InstantQuote, Pack } from '../../../lib/api';
import type { TxState } from '../../../lib/near/useTransaction';
import type { Asset, AssetSymbol } from '@mosaec/config/assets';
import type { ReactNode } from 'react';

const NS_PER_MS = 1_000_000n;
const OFFER_OPEN_NS = 3n * 24n * 3_600_000_000_000n;
const SETTLEMENT = ASSETS.USDC;
const DEFAULT_TERM_ID = 'd90';
const FALLBACK_RATE_BPS = 250;

/** Parses a typed amount; `null` while empty or invalid. */
function parsed(text: string, decimals: number): bigint | null {
  if (text.trim() === '') return null;
  try {
    const value = parseUnits(text, decimals);
    return value > 0n ? value : null;
  } catch {
    return null;
  }
}

const SEAL_POLLS = 10;
const SEAL_POLL_MS = 1_500;

function cash(amount: bigint | null): string {
  return amount === null ? '0.00' : padCents(formatUnits(amount, SETTLEMENT.decimals, 2));
}

function plain(amount: bigint, decimals: number): string {
  return formatUnits(amount, decimals).replace(/,/g, '');
}

function dueDate(termNs: bigint): string {
  const ms = Date.now() + Number(termNs / NS_PER_MS);
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: termNs < 86_400_000_000_000n ? '2-digit' : undefined,
    minute: termNs < 86_400_000_000_000n ? '2-digit' : undefined,
  }).format(ms);
}

/** One amount well from the source's Converter: label, the figure, and a token pill. */
function Well({
  id,
  label,
  value,
  onChange,
  pill,
  aside,
  readOnly = false,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly pill: ReactNode;
  readonly aside?: ReactNode;
  /** Shows a price someone else set (the desk quote) instead of the person's own terms. */
  readonly readOnly?: boolean;
}) {
  return (
    <div className={styles.well}>
      <div className={styles.wellMeta}>
        <span className={styles.wellHead}>
          <label htmlFor={id} className={styles.wellLabel}>
            {label}
          </label>
          {aside}
        </span>
        <input
          id={id}
          className={styles.input}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          readOnly={readOnly}
          value={value}
          onChange={(event) => {
            onChange(event.target.value.replace(',', '.'));
          }}
        />
      </div>
      {pill}
    </div>
  );
}

function TokenPill({
  symbol,
  onClick,
  expanded,
}: {
  readonly symbol: AssetSymbol;
  readonly onClick?: () => void;
  readonly expanded?: boolean;
}) {
  const body = (
    <>
      <Image src={ASSET_MARK[symbol]} alt="" width={24} height={24} />
      <span>{symbol}</span>
      {onClick !== undefined && <CaretDownIcon size={14} weight="bold" />}
    </>
  );
  return onClick === undefined ? (
    <span className={styles.pill}>{body}</span>
  ) : (
    <button
      type="button"
      className={styles.pill}
      aria-haspopup="listbox"
      aria-expanded={expanded}
      onClick={onClick}
    >
      {body}
    </button>
  );
}

/** The ruled rows between wells, as in the Converter's fee list. */
function Rows({ children }: { readonly children: ReactNode }) {
  return <dl className={styles.rows}>{children}</dl>;
}

function Row({ k, children }: { readonly k: ReactNode; readonly children: ReactNode }) {
  return (
    <div className={styles.row}>
      <dt>{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}

type StepState = 'todo' | 'current' | 'done';

function StepRow({
  index,
  title,
  detail,
  state,
}: {
  readonly index: number;
  readonly title: string;
  readonly detail: string;
  readonly state: StepState;
}) {
  return (
    <li className={styles.stepRow} data-state={state}>
      <span className={styles.stepNum}>
        {state === 'done' ? <CheckIcon size={14} weight="bold" /> : index}
      </span>
      <span className={styles.stepText}>
        <span className="t-label">{title}</span>
        <span className="t-caption">{detail}</span>
      </span>
    </li>
  );
}

function useViews() {
  const { network } = useNetwork();
  return useMemo(() => new MosaecViews(network), [network]);
}

/**
 * Quote first, chain second: anyone can price a pawn; the wallet is asked for at the first
 * signature, and each on-chain step resumes from what the chain already holds.
 */
export function BorrowFlow() {
  const { network } = useNetwork();
  const { accountId } = useWallet();
  const views = useViews();
  const calls = useMemo(() => mosaecCalls(network), [network]);
  const search = useSearchParams();

  const collateralAssets = useMemo(
    () =>
      (NETWORKS[network].assets as readonly AssetSymbol[])
        .map((symbol) => ASSETS[symbol])
        .filter((asset) => asset.role === 'collateral'),
    [network],
  );
  const [collateral, setCollateral] = useState<Asset>(collateralAssets[0] ?? ASSETS.ZEC);
  const tokenId = collateral.tokenIds[network];

  const [packId, setPackId] = useState<string | null>(search.get('pack'));
  const [ownedFree, setOwnedFree] = useState<readonly Pack[]>([]);
  const [walletBalance, setWalletBalance] = useState<bigint | null>(null);
  const [packBalance, setPackBalance] = useState<bigint | null>(null);
  const [offered, setOffered] = useState(false);
  const [funded, setFunded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [lockText, setLockText] = useState('1');
  const [lockEdited, setLockEdited] = useState(false);
  const [principalText, setPrincipalText] = useState('500');
  const [principalEdited, setPrincipalEdited] = useState(false);
  const prices = useUsdPrices();
  const [termId, setTermId] = useState(DEFAULT_TERM_ID);
  const [repaymentText, setRepaymentText] = useState('');
  const [repaymentEdited, setRepaymentEdited] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [assetMenu, setAssetMenu] = useState(false);
  const [route, setRoute] = useState<LoanRoute>('instant');
  const [instantFilling, setInstantFilling] = useState(false);
  /* The desk quote behind the signed offer: the page keeps its figures once the offer stage is over. */
  const [signedQuote, setSignedQuote] = useState<InstantQuote | null>(null);
  /* The desk refused the fill, so the signed offer waits on the open market. */
  const [deskPassed, setDeskPassed] = useState(false);
  const resumed = useRef(false);
  const toast = useToast();

  const confirm = useConfirm();
  const mintTx = useTransaction({ pending: 'Creating your pack', success: 'Pack created' });
  const depositTx = useTransaction({
    pending: 'Sealing coins in the pack',
    success: 'Coins sealed',
  });
  const offerTx = useTransaction({
    pending: 'Signing the offer',
    success: 'Offer is on the market',
  });

  const refresh = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);
  const chainVersion = useChainVersion();

  useEffect(() => {
    if (accountId === null) return;
    let live = true;
    getPositions(network, accountId)
      .then((positions) => {
        if (live) setOwnedFree(positions.owned.filter((pack) => pack.state === 'free'));
      })
      .catch(() => {
        if (live) setOwnedFree([]);
      });
    views
      .balanceOf(accountId, tokenId)
      .then((value) => {
        if (live) setWalletBalance(value);
      })
      .catch(() => {
        if (live) setWalletBalance(null);
      });
    return () => {
      live = false;
    };
  }, [accountId, network, tokenId, views, refreshKey, chainVersion]);

  useEffect(() => {
    setPackBalance(null);
    setOffered(false);
    setFunded(false);
    setSignedQuote(null);
    setDeskPassed(false);
  }, [packId, tokenId]);

  /* Re-read the pack after every chain change; what is on screen stays until the answer lands. */
  useEffect(() => {
    if (packId === null) return;
    let live = true;
    Promise.all([views.balanceOf(packId, tokenId), views.positionOf(packId)])
      .then(([balance, position]) => {
        if (!live) return;
        setPackBalance(balance);
        /* A filled pack is past this flow too: the desk or a lender already wrote it. */
        const state = position?.position.stage.state;
        /* A read can land before the last transaction is final: never step back on one pack. */
        setOffered((before) => before || state === 'offered' || state === 'written');
        setFunded((before) => before || state === 'written');
        /* Resuming a pack: start from what it already holds unless the person typed an amount. */
        if (balance > 0n && !lockEdited) setLockText(plain(balance, collateral.decimals));
      })
      .catch(() => {
        if (live) setPackBalance(null);
      });
    return () => {
      live = false;
    };
  }, [packId, tokenId, views, refreshKey, chainVersion]);

  const terms = TERM_OPTIONS.filter(
    (option) => option.testnetOnly !== true || network === 'testnet',
  );
  const term = terms.find((option) => option.id === termId) ?? terms[0];
  const principal = parsed(principalText, SETTLEMENT.decimals);
  const rateBps = SUGGESTED_MONTHLY_RATE_BPS[collateral.symbol] ?? FALLBACK_RATE_BPS;
  const suggested =
    principal === null || term === undefined
      ? null
      : suggestedRepayment(principal, rateBps, term.termNs);

  useEffect(() => {
    if (!repaymentEdited) {
      setRepaymentText(suggested === null ? '' : padCents(plain(suggested, SETTLEMENT.decimals)));
    }
  }, [suggested, repaymentEdited]);

  const repayment = parsed(repaymentText, SETTLEMENT.decimals);
  const lock = parsed(lockText, collateral.decimals);
  const coinPrice = prices?.[collateral.symbol];
  const lockUsd =
    lock === null || coinPrice === undefined
      ? null
      : (Number(lock) / 10 ** collateral.decimals) * coinPrice;
  const suggestedLoan =
    lockUsd === null ? null : suggestedPrincipal(lockUsd, SETTLEMENT.capPerPack);

  /* Until the person types a loan, it follows the coins: half their reference value. */
  useEffect(() => {
    if (!principalEdited && suggestedLoan !== null) {
      setPrincipalText(plain(suggestedLoan, SETTLEMENT.decimals));
    }
  }, [suggestedLoan, principalEdited]);

  const ltv =
    lockUsd === null || lockUsd <= 0 || principal === null
      ? null
      : Number(principal) / 10 ** SETTLEMENT.decimals / lockUsd;
  const inPack = packBalance ?? 0n;
  const toDeposit = lock === null ? null : lock > inPack ? lock - inPack : 0n;

  const repaymentTooLow = principal !== null && repayment !== null && repayment < principal;
  const overCap = lock !== null && lock > collateral.capPerPack;
  const overBalance =
    toDeposit !== null && toDeposit > 0n && walletBalance !== null && toDeposit > walletBalance;
  const quoteValid =
    lock !== null &&
    principal !== null &&
    repayment !== null &&
    !repaymentTooLow &&
    !overCap &&
    term !== undefined;

  const apr =
    principal !== null &&
    repayment !== null &&
    term !== undefined &&
    term.testnetOnly !== true &&
    repayment >= principal
      ? Number(aprBps(principal, repayment, term.termNs)) / 100
      : null;

  const mint = async () => {
    track('borrow_started');
    const sent = await mintTx.run([calls.mint()]);
    const minted = sent
      ?.flatMap((tx) => tx.outcome.events)
      .find((event) => event.event === 'pack_minted');
    const id = minted?.data.pack;
    if (typeof id === 'string') setPackId(id);
    refresh();
  };

  const sendDeposit = async () => {
    if (packId === null || toDeposit === null || toDeposit === 0n) return;
    const target = inPack + toDeposit;
    const sent = await depositTx.run([
      calls.deposit(packId, [{ token_id: tokenId, amount: toDeposit }]),
    ]);
    if (sent !== null) {
      /* Final-state reads trail the wallet by a few blocks: wait until the pack shows the coins. */
      for (let i = 0; i < SEAL_POLLS; i += 1) {
        const held = await views.balanceOf(packId, tokenId).catch(() => null);
        if (held !== null && held >= target) break;
        await new Promise((resolve) => setTimeout(resolve, SEAL_POLL_MS));
      }
    }
    refresh();
  };

  const sendOffer = async () => {
    if (packId === null || principal === null || repayment === null || term === undefined) return;
    const ok = await confirm({
      footnote: SIGN_FOOTNOTE,
      title: 'Put this pawn on the market?',
      body: 'A lender who fills it pays you the loan and takes the Title. You keep the Ticket.',
      rows: [
        ['You receive', `${cash(principal)} USDC`],
        ['You repay', `${cash(repayment)} USDC`],
        ['Due by', dueDate(term.termNs)],
        ['Locked', lockLabel],
      ],
      warning: 'Miss the date and the lender keeps the coins. No liquidation before then.',
      confirmLabel: 'Sign the Offer',
    });
    if (!ok) return;
    const sent = await offerTx.run([
      calls.offer({
        pack: packId,
        tokenIds: [tokenId],
        terms: { kToken: SETTLEMENT.tokenIds[network], kAmount: repayment, termNs: term.termNs },
        payToken: SETTLEMENT.tokenIds[network],
        price: principal,
        offerExpiresAtNs: BigInt(Date.now()) * NS_PER_MS + OFFER_OPEN_NS,
      }),
    ]);
    if (sent !== null) {
      setOffered(true);
      track('offer_signed');
    }
  };

  /** Asks the desk to fill the offer just signed; on any refusal the offer stays on the market. */
  const fillInstantly = async (pack: string, quote: InstantQuote) => {
    setSignedQuote(quote);
    setDeskPassed(false);
    setInstantFilling(true);
    const id = toast.show({
      tone: 'pending',
      title: 'House Desk is lending',
      body: 'The desk checks the offer and sends the USDC. It takes a few seconds.',
    });
    try {
      const result = await requestInstantFill(network, pack, quote);
      if (result.status === 'filled') {
        track('instant_filled');
        setFunded(true);
        toast.update(id, {
          tone: 'success',
          title: 'USDC sent to your account',
          action: { label: 'View transaction', href: explorerTxUrl(network, result.txHash) },
        });
      } else {
        setDeskPassed(true);
        toast.update(id, {
          tone: 'error',
          title: 'The desk passed on this one',
          body: `${result.reason} Your offer stays open on the market.`,
          duration: null,
        });
      }
    } catch (cause) {
      setDeskPassed(true);
      const reason = cause instanceof ApiError ? cause.message : 'The House Desk is unreachable.';
      toast.update(id, {
        tone: 'error',
        title: 'The desk passed on this one',
        body: `${reason} Your offer stays open on the market.`,
        duration: null,
      });
    } finally {
      setInstantFilling(false);
      refresh();
    }
  };

  /* Back from a redirect wallet: the offer was signed elsewhere, so ask for the fill now. */
  useEffect(() => {
    if (accountId === null || resumed.current) return;
    const pending = loadPendingInstant(network, Date.now());
    if (pending === null) return;
    resumed.current = true;
    clearPendingInstant();
    views
      .positionOf(pending.pack)
      .then((position) => {
        const stage = position?.position.stage;
        if (stage?.state !== 'offered' || stage.maker_id !== accountId) return;
        setPackId(pending.pack);
        void fillInstantly(pending.pack, pending.quote);
      })
      .catch(() => undefined);
  }, [accountId, network, views]);

  const sendInstant = async () => {
    if (packId === null) return;
    const current = await instantQuote.fresh();
    if (current.status !== 'ready') {
      toast.show({
        tone: 'error',
        title: 'No desk quote right now',
        body: current.status === 'unavailable' ? current.reason : 'Try again in a moment.',
      });
      return;
    }
    const { quote } = current;
    const principalUnits = BigInt(quote.principal);
    const repaymentUnits = BigInt(quote.repayment);
    const termNs = BigInt(quote.termNs);
    const ok = await confirm({
      footnote: SIGN_FOOTNOTE,
      title: 'Take the House Desk loan?',
      body: 'You sign the offer at the desk price; the desk fills it at once and takes the Title. You keep the Ticket.',
      rows: [
        ['You receive', `${cash(principalUnits)} USDC`],
        ['You repay', `${cash(repaymentUnits)} USDC`],
        ['Due by', dueDate(termNs)],
        ['Locked', lockLabel],
      ],
      warning: 'Miss the date and the desk keeps the coins. No liquidation before then.',
      confirmLabel: 'Sign And Get USDC',
    });
    if (!ok) return;
    savePendingInstant({ network, pack: packId, quote });
    const sent = await offerTx.run(
      [
        calls.offer({
          pack: packId,
          tokenIds: [tokenId],
          terms: { kToken: SETTLEMENT.tokenIds[network], kAmount: repaymentUnits, termNs },
          payToken: SETTLEMENT.tokenIds[network],
          price: principalUnits,
          offerExpiresAtNs: BigInt(Date.now()) * NS_PER_MS + OFFER_OPEN_NS,
        }),
      ],
      { pending: 'Signing the offer', success: 'Offer signed' },
    );
    /* Null after a redirect too: the stored quote resumes the fill when the borrower is back. */
    if (sent === null) return;
    clearPendingInstant();
    setOffered(true);
    track('offer_signed');
    await fillInstantly(packId, quote);
  };

  const hasPack = packId !== null;
  const deposited = hasPack && packBalance !== null && toDeposit === 0n;
  const stage: 'connect' | 'mint' | 'deposit' | 'offer' | 'done' =
    accountId === null
      ? 'connect'
      : offered
        ? 'done'
        : !hasPack
          ? 'mint'
          : !deposited
            ? 'deposit'
            : 'offer';
  const stepState = (step: 'mint' | 'deposit' | 'offer'): StepState => {
    const order = ['mint', 'deposit', 'offer'] as const;
    if (stage === 'done') return 'done';
    if (stage === 'connect') return 'todo';
    const at = order.indexOf(stage);
    const mine = order.indexOf(step);
    return mine < at ? 'done' : mine === at ? 'current' : 'todo';
  };

  const deskAsset =
    collateral.symbol === 'ZEC' || collateral.symbol === 'BTC' || collateral.symbol === 'SOL'
      ? collateral.symbol
      : null;
  const instantQuote = useInstantQuote(
    network,
    stage === 'offer' &&
      accountId !== null &&
      deskAsset !== null &&
      packBalance !== null &&
      packBalance > 0n &&
      term !== undefined
      ? {
          asset: deskAsset,
          amount: packBalance,
          termNs: term.termNs,
          principal: principal ?? undefined,
          borrower: accountId,
        }
      : null,
  );
  /* After an instant offer is signed, the signed quote decides the route: the desk's loan, or the market if it passed. */
  const signedDeskQuote = stage === 'done' ? signedQuote : null;
  /* A desk that cannot quote leaves the open market as the only way. */
  const loanRoute: LoanRoute =
    signedDeskQuote !== null
      ? deskPassed
        ? 'market'
        : 'instant'
      : instantQuote.state.status === 'ready'
        ? route
        : 'market';
  /* With Instant chosen, every figure on the page is the desk's price, so the ticket matches what is signed. */
  const deskQuote =
    signedDeskQuote ??
    (stage === 'offer' && loanRoute === 'instant' && instantQuote.state.status === 'ready'
      ? instantQuote.state.quote
      : null);
  const shownPrincipal = deskQuote === null ? principal : BigInt(deskQuote.principal);
  const shownRepayment = deskQuote === null ? repayment : BigInt(deskQuote.repayment);
  const shownMonthlyBps = deskQuote === null ? rateBps : deskQuote.monthlyBps;
  const shownApr =
    deskQuote === null ? apr : term?.testnetOnly === true ? null : deskQuote.aprBps / 100;
  const shownInterest =
    shownPrincipal !== null && shownRepayment !== null ? shownRepayment - shownPrincipal : null;

  const pending = (state: TxState) => state.phase === 'pending';
  const lockLabel =
    lock === null
      ? `0 ${collateral.symbol}`
      : `${formatUnits(lock, collateral.decimals, 4)} ${collateral.symbol}`;

  let action: ReactNode;
  if (stage === 'connect') {
    action = <WalletButton size="md" fullWidth label="Connect Wallet to Borrow" />;
  } else if (stage === 'mint') {
    action = (
      <Button
        fullWidth
        disabled={!quoteValid}
        loading={pending(mintTx.state)}
        onClick={() => void mint()}
      >
        {pending(mintTx.state) ? 'Waiting for the Wallet' : 'Create the Pack'}
      </Button>
    );
  } else if (stage === 'deposit') {
    action = (
      <Button
        fullWidth
        disabled={!quoteValid || overBalance}
        loading={pending(depositTx.state)}
        onClick={() => void sendDeposit()}
      >
        {pending(depositTx.state)
          ? 'Waiting for the Wallet'
          : `Seal ${toDeposit === null ? '' : formatUnits(toDeposit, collateral.decimals, 4)} ${collateral.symbol}`}
      </Button>
    );
  } else if (stage === 'offer' && loanRoute === 'instant') {
    action = (
      <Button
        fullWidth
        disabled={!agreed}
        loading={pending(offerTx.state)}
        onClick={() => void sendInstant()}
      >
        {pending(offerTx.state) ? 'Waiting for the Wallet' : 'Sign And Get USDC'}
      </Button>
    );
  } else if (stage === 'offer') {
    action = (
      <Button
        fullWidth
        disabled={!quoteValid || !agreed}
        loading={pending(offerTx.state)}
        onClick={() => void sendOffer()}
      >
        {pending(offerTx.state) ? 'Waiting for the Wallet' : 'Sign the Offer'}
      </Button>
    );
  } else if (instantFilling) {
    action = (
      <Button fullWidth loading disabled>
        House Desk Is Lending
      </Button>
    );
  } else {
    action =
      packId === null ? null : (
        <ButtonLink href={packPath(packId)} as={Link} fullWidth showIcon>
          View Your Pawn
        </ButtonLink>
      );
  }

  return (
    <div className={styles.layout}>
      <section className={styles.quote} aria-label="Your pawn">
        <Well
          id="lock"
          label="You lock"
          value={lockText}
          onChange={(value) => {
            setLockText(value);
            setLockEdited(true);
          }}
          aside={
            accountId !== null && walletBalance !== null ? (
              <button
                type="button"
                className={styles.max}
                onClick={() => {
                  const max =
                    walletBalance + inPack > collateral.capPerPack
                      ? collateral.capPerPack
                      : walletBalance + inPack;
                  setLockText(plain(max, collateral.decimals));
                }}
              >
                Max {formatUnits(walletBalance, collateral.decimals, 4)}
              </button>
            ) : undefined
          }
          pill={
            <div className={styles.picker}>
              <TokenPill
                symbol={collateral.symbol}
                expanded={assetMenu}
                onClick={() => {
                  setAssetMenu((open) => !open);
                }}
              />
              {assetMenu && (
                <ul className={styles.menu} role="listbox" aria-label="Collateral">
                  {(['ZEC', 'BTC', 'SOL'] as const).map((symbol) => {
                    const available = collateralAssets.some((item) => item.symbol === symbol);
                    return (
                      <li key={symbol}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={collateral.symbol === symbol}
                          disabled={!available}
                          className={styles.option}
                          onClick={() => {
                            const next = ASSETS[symbol];
                            if (next.symbol !== collateral.symbol) {
                              /* Each coin has its own cap: start from one full pack of the new coin. */
                              setLockText(plain(next.capPerPack, next.decimals));
                              setLockEdited(false);
                            }
                            setCollateral(next);
                            setAssetMenu(false);
                          }}
                        >
                          <Image src={ASSET_MARK[symbol]} alt="" width={24} height={24} />
                          <span className={styles.optionText}>
                            <span>{symbol}</span>
                            <span className="t-caption">
                              {available ? ASSETS[symbol].name : 'Mainnet release'}
                            </span>
                          </span>
                          {collateral.symbol === symbol && <CheckIcon size={14} weight="bold" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          }
        />
        <Rows>
          <Row k="Term">
            <Segmented
              label="Term"
              size="sm"
              tone="ink"
              value={term?.id ?? DEFAULT_TERM_ID}
              onChange={setTermId}
              options={terms.map((option) => ({
                id: option.id,
                label: option.label.replace(' minutes', ' min').replace(' days', 'd'),
              }))}
            />
          </Row>
          <Row k="Rate">
            {term?.testnetOnly === true
              ? 'Rehearsal'
              : `${(shownMonthlyBps / 100).toFixed(2)}% a month`}
          </Row>
          <Row k="Sealed in">
            {overCap ? (
              <span className={styles.bad}>
                Cap {formatUnits(collateral.capPerPack, collateral.decimals)} {collateral.symbol}
              </span>
            ) : (
              'A keyless pack'
            )}
          </Row>
        </Rows>
        <Well
          id="principal"
          label="You receive now"
          value={
            deskQuote === null
              ? principalText
              : plain(BigInt(deskQuote.principal), SETTLEMENT.decimals)
          }
          readOnly={deskQuote !== null}
          onChange={(value) => {
            setPrincipalEdited(true);
            setPrincipalText(value);
          }}
          aside={
            deskQuote === null && principalEdited && suggestedLoan !== null ? (
              <button
                type="button"
                className={styles.max}
                onClick={() => {
                  setPrincipalEdited(false);
                }}
              >
                Use {Math.round(SUGGESTED_LTV * 100).toString()}%
              </button>
            ) : undefined
          }
          pill={<TokenPill symbol="USDC" />}
        />
        <Rows>
          <Row k="Coins worth">
            {lockUsd === null ? (
              '–'
            ) : (
              <span className={cx(ltv !== null && ltv > 0.7 && styles.bad)}>
                {usdText(lockUsd)}
                {ltv === null ? '' : ` · ${Math.round(ltv * 100).toString()}% loan to value`}
              </span>
            )}
          </Row>
          <Row k="Cost of the loan">
            {shownInterest === null || shownInterest < 0n ? '0.00' : cash(shownInterest)} USDC
          </Row>
          <Row k="Yearly rate">{shownApr === null ? '–' : `${shownApr.toFixed(1)}% APR`}</Row>
          <Row k="Due if filled now">{term === undefined ? '' : dueDate(term.termNs)}</Row>
        </Rows>
        <Well
          id="repayment"
          label="You repay by the date"
          value={
            deskQuote === null
              ? repaymentText
              : padCents(plain(BigInt(deskQuote.repayment), SETTLEMENT.decimals))
          }
          readOnly={deskQuote !== null}
          onChange={(value) => {
            setRepaymentEdited(true);
            setRepaymentText(value);
          }}
          aside={
            deskQuote === null && repaymentEdited ? (
              <button
                type="button"
                className={styles.max}
                onClick={() => {
                  setRepaymentEdited(false);
                }}
              >
                Use Suggested
              </button>
            ) : undefined
          }
          pill={<TokenPill symbol="USDC" />}
        />
        <p className={cx('t-caption', styles.hint, repaymentTooLow && styles.bad)}>
          {signedDeskQuote !== null
            ? 'The House Desk price you signed.'
            : deskQuote !== null
              ? 'The House Desk price. Set Your Own Terms to change it.'
              : repaymentTooLow
                ? 'The repayment must be at least the loan.'
                : 'The repayment is your price. Nothing moves it.'}
        </p>
      </section>

      <aside className={styles.side} aria-label="Summary">
        <div className={styles.ticket}>
          <div className={styles.ticketHead}>
            <span className={styles.mono}>Pawn ticket</span>
            <span className={styles.chip}>
              <LockSimpleIcon size={12} weight="fill" />
              Zero liquidation
            </span>
          </div>
          <div className={styles.slot}>
            <span className={styles.mono}>Coins sealed</span>
            <span className={styles.slotValue}>
              <Image src={ASSET_MARK[collateral.symbol]} alt="" width={22} height={22} />
              {lockLabel}
            </span>
          </div>
          <div className={styles.slot}>
            <span className={styles.mono}>You receive now</span>
            <span className={styles.slotValue}>{cash(shownPrincipal)} USDC</span>
          </div>
          <div className={styles.slot}>
            <span className={styles.mono}>
              You repay by {term === undefined ? 'the date' : dueDate(term.termNs)}
            </span>
            <span className={styles.slotValue}>
              {cash(shownRepayment)} USDC
              {shownApr !== null && <span className={styles.apr}>{shownApr.toFixed(1)}% APR</span>}
            </span>
          </div>
          <div className={styles.rights}>
            <span className={styles.right}>
              <TicketIcon size={16} weight="fill" />
              Repay by the date, the coins come back.
            </span>
            <span className={styles.right}>
              <StampIcon size={16} weight="fill" />
              {loanRoute !== 'instant'
                ? 'Miss it, the lender keeps the coins.'
                : 'Miss it, the House Desk keeps the coins.'}
            </span>
          </div>
        </div>

        <ListCard
          title="Three signatures"
          pill={
            stage === 'done' ? (
              <SoftPill>{funded ? 'Loan funded' : 'Offer open'}</SoftPill>
            ) : stage === 'connect' ? (
              <SoftPill tone="neutral">Wallet needed</SoftPill>
            ) : (
              <SoftPill tone="accent">{`Step ${String(['mint', 'deposit', 'offer'].indexOf(stage) + 1)} of 3`}</SoftPill>
            )
          }
        >
          <StepRow
            index={1}
            title="Create the pack"
            detail={
              hasPack
                ? `Pack #${packId.split('.')[0] ?? ''} is yours`
                : `${formatUnits(MINT_DEPOSIT_YOCTO, 24)} NEAR storage deposit`
            }
            state={stepState('mint')}
          />
          <StepRow
            index={2}
            title={`Seal ${collateral.symbol}`}
            detail={
              packBalance !== null && packBalance > 0n
                ? `${formatUnits(packBalance, collateral.decimals, 4)} ${collateral.symbol} inside`
                : `Move ${lockLabel} into the pack`
            }
            state={stepState('deposit')}
          />
          <StepRow
            index={3}
            title="Sign the offer"
            detail={
              loanRoute === 'instant'
                ? 'The House Desk lends at once'
                : 'Open to lenders for 3 days'
            }
            state={stepState('offer')}
          />
          <li className={styles.actionRow}>
            {ownedFree.length > 0 && stage !== 'done' && (
              <div className={styles.reuse}>
                <span className="t-caption">Or use a pack you hold</span>
                <div className={styles.reuseList}>
                  {ownedFree.map((pack) => (
                    <button
                      key={pack.id}
                      type="button"
                      className={styles.reuseItem}
                      aria-pressed={pack.id === packId}
                      onClick={() => {
                        setPackId(pack.id);
                      }}
                    >
                      Pack #{pack.index}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {stage === 'offer' && (
              <LoanChoice
                route={loanRoute}
                onRoute={setRoute}
                quote={instantQuote.state}
                termLabel={term?.label ?? ''}
              />
            )}
            {stage === 'offer' && (
              <label className={actionStyles.check}>
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(event) => {
                    setAgreed(event.target.checked);
                  }}
                />
                {loanRoute === 'instant'
                  ? 'If I miss the date, the House Desk keeps the coins.'
                  : 'If I miss the date, the lender keeps the coins.'}
              </label>
            )}
            {overBalance && stage === 'deposit' && (
              <p className={actionStyles.warn}>
                Your balance holds {formatUnits(walletBalance, collateral.decimals, 4)}{' '}
                {collateral.symbol}. Lower the amount to lock.
              </p>
            )}
            {action}
            <p className={cx('t-caption', styles.fine)}>Each step asks your wallet first.</p>
          </li>
        </ListCard>
      </aside>
    </div>
  );
}
