'use client';

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowsDownUpIcon,
  VaultIcon,
  WalletIcon,
} from '@phosphor-icons/react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { ASSETS, ASSET_SYMBOLS } from '@mosaec/config/assets';
import { NETWORKS } from '@mosaec/config/networks';
import { UnitsError, parseUnits } from '@mosaec/domain';
import { MosaecViews, mosaecCalls } from '@mosaec/sdk';
import { AppIcon, Button, Dialog, ErrorState, Skeleton, Tooltip, cx } from '@mosaec/ui';

import { NEAR_MARK, markFill } from '../../../lib/asset-marks';
import { formatCompact, formatUnits } from '../../../lib/format';
import { useNetwork } from '../../../lib/near/network';
import { useTransaction } from '../../../lib/near/useTransaction';
import { useWallet } from '../../../lib/near/wallet';
import { usdText, usdValue, useUsdPrices } from '../../../lib/prices';
import { CoinMark } from '../_components/CoinMark';
import { CoinTile } from '../_components/CoinTile';
import { ConnectPanel } from '../_components/ConnectPanel';
import { appPath } from '../_components/routes';

import styles from './balances.module.css';

import type { Asset, AssetSymbol } from '@mosaec/config/assets';

const NEAR_DECIMALS = 24;
/** Below this the wallet may not cover the gas of a deposit or withdraw. */
const LOW_NEAR = 50_000_000_000_000_000_000_000n;

type Direction = 'deposit' | 'withdraw';

export interface Holding {
  readonly asset: Asset;
  readonly mosaec: bigint;
  readonly wallet: bigint;
  readonly registered: boolean;
  /** False while this network has no token for the asset yet: shown, but nothing moves. */
  readonly live: boolean;
}

type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly holdings: readonly Holding[]; readonly near: bigint };

function useHoldings(version: number): Load {
  const { network } = useNetwork();
  const { accountId } = useWallet();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  useEffect(() => {
    if (accountId === null) return;
    let live = true;
    setLoad((current) => (current.kind === 'ready' ? current : { kind: 'loading' }));
    const views = new MosaecViews(network);
    const enabled: readonly AssetSymbol[] = NETWORKS[network].assets;
    /* Every asset gets a card in the same order; ones without a token here stay at zero. */
    const assets = ASSET_SYMBOLS.map((symbol) => ASSETS[symbol]);
    Promise.all([
      views.nearBalanceOf(accountId),
      ...assets.map(async (asset): Promise<Holding> => {
        if (!enabled.includes(asset.symbol)) {
          return { asset, mosaec: 0n, wallet: 0n, registered: false, live: false };
        }
        const tokenId = asset.tokenIds[network];
        const [mosaec, wallet, registered] = await Promise.all([
          views.balanceOf(accountId, tokenId),
          views.walletBalanceOf(accountId, tokenId),
          views.isRegistered(accountId, tokenId),
        ]);
        return { asset, mosaec, wallet, registered, live: true };
      }),
    ])
      .then(([near, ...holdings]) => {
        if (live) setLoad({ kind: 'ready', near: near, holdings: holdings });
      })
      .catch(() => {
        if (live)
          setLoad({ kind: 'error', message: 'NEAR did not answer. Try again in a moment.' });
      });
    return () => {
      live = false;
    };
  }, [network, accountId, version]);

  return load;
}

function short(value: bigint, asset: Asset): string {
  return formatCompact(value, asset.decimals, asset.symbol === 'USDC' ? 2 : 4);
}

function NearTile() {
  return (
    <AppIcon color="light" size={52} mark fill={markFill(NEAR_MARK.src)}>
      <Image src={NEAR_MARK.src} alt="" width={32} height={32} />
    </AppIcon>
  );
}

/** Balance cards, then one form that moves a coin between the wallet and Mosaec. */
export function BalancesDesk() {
  const { accountId } = useWallet();
  const [version, setVersion] = useState(0);
  const load = useHoldings(version);

  if (accountId === null) {
    return (
      <ConnectPanel
        icon={<WalletIcon weight="fill" />}
        title="Connect to see your balances."
        body="Your coins in the wallet and in Mosaec, side by side."
        items={[
          {
            icon: <WalletIcon weight="fill" />,
            color: 'ink',
            title: 'In Your Wallet',
            body: 'Coins your NEAR account holds.',
          },
          {
            icon: <VaultIcon weight="fill" />,
            color: 'blue',
            title: 'In Mosaec',
            body: 'Coins ready to pawn or to lend.',
          },
          {
            icon: <ArrowsDownUpIcon weight="bold" />,
            color: 'green',
            title: 'Deposit and Withdraw',
            body: 'One signature moves a coin either way.',
          },
        ]}
        footer={
          <div className={styles.coins}>
            {ASSET_SYMBOLS.map((symbol) => (
              <CoinTile key={symbol} symbol={symbol} size={32} />
            ))}
            <AppIcon color="light" size={32} mark fill={markFill(NEAR_MARK.src)}>
              <Image src={NEAR_MARK.src} alt="" width={20} height={20} />
            </AppIcon>
            <span className="t-caption">{ASSET_SYMBOLS.join(', ')} and NEAR</span>
          </div>
        }
      />
    );
  }
  if (load.kind === 'error') {
    return (
      <ErrorState title="Balances could not load">
        <span>{load.message}</span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setVersion((v) => v + 1);
          }}
        >
          Try Again
        </Button>
      </ErrorState>
    );
  }
  if (load.kind === 'loading') {
    return (
      <div className={styles.grid}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} height={148} />
        ))}
      </div>
    );
  }

  return (
    <BalancesView
      holdings={load.holdings}
      near={load.near}
      accountId={accountId}
      onDone={() => {
        setVersion((v) => v + 1);
      }}
    />
  );
}

/** The loaded page: one card per coin, each with its two moves, and NEAR for fees. */
export function BalancesView({
  holdings,
  near,
  accountId,
  onDone,
}: {
  readonly holdings: readonly Holding[];
  readonly near: bigint;
  readonly accountId: string;
  readonly onDone: () => void;
}) {
  const [move, setMove] = useState<{ symbol: AssetSymbol; direction: Direction } | null>(null);
  const prices = useUsdPrices();
  const live = holdings.filter((h) => h.live);
  const empty = live.every((h) => h.mosaec === 0n && h.wallet === 0n);
  const open = holdings.find((h) => h.asset.symbol === move?.symbol);
  const line = (h: Holding, amount: bigint) =>
    usdValue(
      [
        {
          tokenId: '',
          symbol: h.asset.symbol,
          decimals: h.asset.decimals,
          amount: amount.toString(),
        },
      ],
      prices,
    );
  const total = (pick: (h: Holding) => bigint) =>
    live.reduce<number | null>((sum, h) => {
      const v = line(h, pick(h));
      return sum === null || v === null ? null : sum + v;
    }, 0);
  const inMosaec = total((h) => h.mosaec);
  const inWallet = total((h) => h.wallet);
  return (
    <>
      <div className={styles.summary}>
        <div className={styles.summaryFigure}>
          <span className={styles.label}>In Mosaec</span>
          <span className={styles.summaryValue}>{inMosaec === null ? '–' : usdText(inMosaec)}</span>
        </div>
        <span className={styles.summaryRule} aria-hidden="true" />
        <div className={styles.summaryFigure}>
          <span className={styles.label}>In your wallet</span>
          <span className={styles.summaryValue}>{inWallet === null ? '–' : usdText(inWallet)}</span>
        </div>
        <span className={cx('t-caption', styles.summaryNote)}>Reference prices from CoinGecko</span>
      </div>
      <div className={styles.grid}>
        {holdings.map((h) => {
          const worth = h.live ? line(h, h.mosaec) : null;
          const pending = `${h.asset.symbol} has no test token on this network yet.`;
          return (
            <article key={h.asset.symbol} className={cx(styles.card, !h.live && styles.idle)}>
              <div className={styles.cardTop}>
                <div className={styles.figures}>
                  <span className={styles.label}>{h.asset.symbol} in Mosaec</span>
                  <span className={styles.valueRow}>
                    <span className={styles.value} title={formatUnits(h.mosaec, h.asset.decimals)}>
                      {h.live ? short(h.mosaec, h.asset) : '–'}
                    </span>
                    {worth !== null && h.mosaec > 0n && (
                      <span className={styles.usd}>{usdText(worth)}</span>
                    )}
                  </span>
                  <span className={styles.wallet} title={formatUnits(h.wallet, h.asset.decimals)}>
                    {h.live ? `Wallet ${short(h.wallet, h.asset)}` : 'Not on testnet yet'}
                  </span>
                </div>
                <CoinTile symbol={h.asset.symbol} size={52} />
              </div>
              {h.live ? (
                <div className={styles.moves}>
                  <button
                    type="button"
                    className={styles.move}
                    disabled={h.wallet === 0n}
                    onClick={() => {
                      setMove({ symbol: h.asset.symbol, direction: 'deposit' });
                    }}
                  >
                    <ArrowDownIcon size={14} weight="bold" />
                    Deposit
                  </button>
                  <button
                    type="button"
                    className={styles.move}
                    disabled={h.mosaec === 0n}
                    onClick={() => {
                      setMove({ symbol: h.asset.symbol, direction: 'withdraw' });
                    }}
                  >
                    <ArrowUpIcon size={14} weight="bold" />
                    Withdraw
                  </button>
                </div>
              ) : (
                <Tooltip label={pending} className={styles.movesTip}>
                  <div className={styles.moves}>
                    <button type="button" className={styles.move} disabled aria-label={pending}>
                      <ArrowDownIcon size={14} weight="bold" />
                      Deposit
                    </button>
                    <button type="button" className={styles.move} disabled aria-label={pending}>
                      <ArrowUpIcon size={14} weight="bold" />
                      Withdraw
                    </button>
                  </div>
                </Tooltip>
              )}
            </article>
          );
        })}
        <article className={cx(styles.card, styles.near)}>
          <div className={styles.cardTop}>
            <div className={styles.figures}>
              <span className={styles.label}>NEAR for fees</span>
              <span className={styles.value}>{formatUnits(near, NEAR_DECIMALS, 3)}</span>
              <span className={cx(styles.wallet, near < LOW_NEAR && styles.low)}>
                {near < LOW_NEAR ? 'Low, top up to sign' : 'Pays the gas'}
              </span>
            </div>
            <NearTile />
          </div>
        </article>
      </div>
      <p className={cx('t-caption', styles.note)}>
        {empty ? (
          <>
            No coins yet. Claim free ones on <Link href={appPath('/faucet')}>Test Tokens</Link>.
          </>
        ) : (
          'Mosaec balance is your NEAR Intents account. Pawns pay out to it.'
        )}
      </p>
      {open !== undefined && move !== null && (
        <MoveDialog
          key={`${move.symbol}-${move.direction}`}
          holding={open}
          direction={move.direction}
          accountId={accountId}
          onClose={() => {
            setMove(null);
          }}
          onDone={onDone}
        />
      )}
    </>
  );
}

function MoveDialog({
  holding,
  direction,
  accountId,
  onClose,
  onDone,
}: {
  readonly holding: Holding;
  readonly direction: Direction;
  readonly accountId: string;
  readonly onClose: () => void;
  readonly onDone: () => void;
}) {
  const { network } = useNetwork();
  const { state, run } = useTransaction({
    pending: `${direction === 'deposit' ? 'Depositing' : 'Withdrawing'} ${holding.asset.symbol}`,
    success: direction === 'deposit' ? 'In your Mosaec balance' : 'Back in your wallet',
  });
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  /* Runs after the dialog's own effect opened it, so focus lands in the field, not on Close. */
  useEffect(() => {
    input.current?.focus();
  }, []);
  const { asset } = holding;
  const available = direction === 'deposit' ? holding.wallet : holding.mosaec;
  const verb = direction === 'deposit' ? 'Deposit' : 'Withdraw';

  let amount: bigint | null = null;
  let problem: string | null = null;
  if (text.trim() !== '') {
    try {
      amount = parseUnits(text, asset.decimals);
      if (amount === 0n) problem = 'Enter more than zero.';
      else if (amount > available) problem = 'More than you have.';
    } catch (cause) {
      problem =
        cause instanceof UnitsError
          ? `Up to ${asset.decimals.toString()} decimals.`
          : 'Not a number.';
    }
  }
  const needsSetup = direction === 'withdraw' && !holding.registered;

  const submit = () => {
    if (amount === null || problem !== null) return;
    const calls = mosaecCalls(network);
    const tokenId = asset.tokenIds[network];
    void run(
      direction === 'deposit'
        ? [calls.verifierDeposit(tokenId, amount)]
        : [
            ...(needsSetup ? [calls.ftStorageDeposit(tokenId, accountId)] : []),
            calls.verifierWithdraw(tokenId, accountId, amount),
          ],
    ).then((sent) => {
      if (sent !== null) onDone();
    });
  };

  return (
    <Dialog open title={`${verb} ${asset.symbol}`} onClose={onClose}>
      <div className={styles.dialog}>
        <div className={styles.well}>
          <div className={styles.wellMeta}>
            <span className={styles.wellLabel}>
              {direction === 'deposit' ? 'Wallet to Mosaec' : 'Mosaec to wallet'}
            </span>
            <input
              className={styles.input}
              inputMode="decimal"
              placeholder="0"
              ref={input}
              value={text}
              aria-label={`Amount of ${asset.symbol}`}
              onChange={(event) => {
                setText(event.target.value.replace(',', '.'));
              }}
            />
            <span className={styles.available} title={formatUnits(available, asset.decimals)}>
              {short(available, asset)} available
              <button
                type="button"
                className={styles.max}
                onClick={() => {
                  setText(formatUnits(available, asset.decimals).replace(/,/g, ''));
                }}
              >
                Max
              </button>
            </span>
          </div>
          <CoinMark symbol={asset.symbol} size={32} />
        </div>
        {needsSetup && (
          <p className={styles.setup}>First withdraw also registers your wallet: 0.00125 NEAR.</p>
        )}
        {problem !== null && <p className={styles.problem}>{problem}</p>}
        <Button
          fullWidth
          disabled={amount === null || problem !== null}
          loading={state.phase === 'pending'}
          onClick={submit}
        >
          {state.phase === 'pending' ? 'Waiting for the Wallet' : verb}
        </Button>
      </div>
    </Dialog>
  );
}
