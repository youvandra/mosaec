'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ASSETS } from '@mosaec/config/assets';
import { NETWORKS } from '@mosaec/config/networks';
import { parseUnits } from '@mosaec/domain';
import { MINT_DEPOSIT_YOCTO, MosaecViews, mosaecCalls } from '@mosaec/sdk';
import { Button, ButtonLink, FilterPill, cx } from '@mosaec/ui';

import { getPositions } from '../../../lib/api';
import { ASSET_MARK } from '../../../lib/asset-marks';
import { formatUnits } from '../../../lib/format';
import { useNetwork } from '../../../lib/near/network';
import { useTransaction } from '../../../lib/near/useTransaction';
import { useWallet } from '../../../lib/near/wallet';
import { SUGGESTED_MONTHLY_RATE_BPS, TERM_OPTIONS, suggestedRepayment } from '../../../lib/rates';
import actionStyles from '../_components/ActionCard.module.css';
import { Facts } from '../_components/Panel';
import { packPath } from '../_components/routes';
import { TxStatus } from '../_components/TxStatus';
import { WalletButton } from '../_components/WalletButton';

import styles from './BorrowFlow.module.css';

import type { Pack } from '../../../lib/api';
import type { Asset, AssetSymbol } from '@mosaec/config/assets';
import type { ReactNode } from 'react';

const NS_PER_MS = 1_000_000n;
const OFFER_OPEN_NS = 3n * 24n * 3_600_000_000_000n;
const SETTLEMENT = ASSETS.USDC;
const YOCTO_PER_NEAR = 10n ** 24n;
const DEFAULT_TERM_ID = 'd90';
const FALLBACK_RATE_BPS = 250;

type StepState = 'locked' | 'active' | 'done';

function Step({
  index,
  title,
  state,
  children,
}: {
  readonly index: number;
  readonly title: string;
  readonly state: StepState;
  readonly children: ReactNode;
}) {
  return (
    <section className={styles.step} data-state={state} aria-label={title}>
      <div className={styles.stepHead}>
        <span className={styles.num}>{index}</span>
        <h2 className="t-h5">{title}</h2>
      </div>
      {state !== 'locked' && children}
    </section>
  );
}

function AmountField({
  label,
  value,
  onChange,
  asset,
  hint,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly asset: Asset;
  readonly hint?: ReactNode;
}) {
  const id = `amount-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className="t-caption">
        {label}
      </label>
      <div className={styles.inputRow}>
        <input
          id={id}
          className={styles.input}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={value}
          onChange={(event) => {
            onChange(event.target.value.replace(',', '.'));
          }}
        />
        <span className={styles.unit}>
          <Image src={ASSET_MARK[asset.symbol]} alt="" width={22} height={22} />
          {asset.symbol}
        </span>
      </div>
      {hint !== undefined && <div className={cx('t-caption', styles.hint)}>{hint}</div>}
    </div>
  );
}

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

function useViews() {
  const { network } = useNetwork();
  return useMemo(() => new MosaecViews(network), [network]);
}

/** The borrower's path from a pack to a signed offer. Each step resumes from chain state. */
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
  const [refreshKey, setRefreshKey] = useState(0);

  const [depositText, setDepositText] = useState('');
  const [principalText, setPrincipalText] = useState('');
  const [termId, setTermId] = useState(DEFAULT_TERM_ID);
  const [repaymentText, setRepaymentText] = useState('');
  const [repaymentEdited, setRepaymentEdited] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const mintTx = useTransaction();
  const depositTx = useTransaction();
  const offerTx = useTransaction();

  const refresh = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

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
  }, [accountId, network, tokenId, views, refreshKey]);

  useEffect(() => {
    setPackBalance(null);
    setOffered(false);
    if (packId === null) return;
    let live = true;
    Promise.all([views.balanceOf(packId, tokenId), views.positionOf(packId)])
      .then(([balance, position]) => {
        if (!live) return;
        setPackBalance(balance);
        setOffered(position?.position.stage.state === 'offered');
      })
      .catch(() => {
        if (live) setPackBalance(null);
      });
    return () => {
      live = false;
    };
  }, [packId, tokenId, views, refreshKey]);

  const term = TERM_OPTIONS.find((option) => option.id === termId) ?? TERM_OPTIONS[1];
  const principal = parsed(principalText, SETTLEMENT.decimals);
  const rateBps = SUGGESTED_MONTHLY_RATE_BPS[collateral.symbol] ?? FALLBACK_RATE_BPS;
  const suggested =
    principal === null || term === undefined
      ? null
      : suggestedRepayment(principal, rateBps, term.termNs);

  useEffect(() => {
    if (!repaymentEdited) {
      setRepaymentText(
        suggested === null ? '' : formatUnits(suggested, SETTLEMENT.decimals).replace(/,/g, ''),
      );
    }
  }, [suggested, repaymentEdited]);

  const repayment = parsed(repaymentText, SETTLEMENT.decimals);
  const deposit = parsed(depositText, collateral.decimals);

  if (accountId === null) {
    return (
      <div className={styles.step}>
        <h2 className="t-h5">Connect a wallet to start</h2>
        <p className="t-body-sm">
          Your pack, its Title and the Ticket all live in your NEAR account.
        </p>
        <div>
          <WalletButton />
        </div>
      </div>
    );
  }

  const hasCollateral = packBalance !== null && packBalance > 0n;
  const stepState = (ready: boolean, done: boolean): StepState =>
    done ? 'done' : ready ? 'active' : 'locked';
  const loanValid =
    principal !== null && repayment !== null && repayment >= principal && term !== undefined;
  const repaymentTooLow = principal !== null && repayment !== null && repayment < principal;

  const mint = async () => {
    const sent = await mintTx.run([calls.mint()]);
    const minted = sent
      ?.flatMap((tx) => tx.outcome.events)
      .find((event) => event.event === 'pack_minted');
    const id = minted?.data.pack;
    if (typeof id === 'string') setPackId(id);
    refresh();
  };

  const sendDeposit = async () => {
    if (packId === null || deposit === null) return;
    await depositTx.run([calls.deposit(packId, [{ token_id: tokenId, amount: deposit }])]);
    setDepositText('');
    refresh();
  };

  const sendOffer = async () => {
    if (packId === null || principal === null || repayment === null || term === undefined) return;
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
    if (sent !== null) setOffered(true);
  };

  return (
    <div className={styles.flow}>
      <div className={styles.steps}>
        <Step index={1} title="Choose a pack" state={stepState(true, packId !== null)}>
          {collateralAssets.length > 1 && (
            <div className={styles.packs} role="group" aria-label="Collateral">
              {collateralAssets.map((asset) => (
                <FilterPill
                  key={asset.symbol}
                  active={asset.symbol === collateral.symbol}
                  onClick={() => {
                    setCollateral(asset);
                  }}
                >
                  {asset.symbol}
                </FilterPill>
              ))}
            </div>
          )}
          {ownedFree.length > 0 && (
            <div className={styles.packs} role="group" aria-label="Your free packs">
              {ownedFree.map((pack) => (
                <FilterPill
                  key={pack.id}
                  tone="light"
                  active={pack.id === packId}
                  onClick={() => {
                    setPackId(pack.id);
                  }}
                >
                  {`Pack #${pack.index}`}
                </FilterPill>
              ))}
            </div>
          )}
          <p className="t-body-sm">
            A new pack costs a {formatUnits(MINT_DEPOSIT_YOCTO, 24)} NEAR storage deposit. You
            receive its Title.
          </p>
          <div>
            <Button
              variant={packId === null ? 'primary' : 'secondary'}
              size="sm"
              disabled={mintTx.state.phase === 'pending'}
              onClick={() => void mint()}
            >
              {mintTx.state.phase === 'pending' ? 'Waiting for the Wallet' : 'Mint a New Pack'}
            </Button>
          </div>
          <TxStatus state={mintTx.state} success="Pack minted. You hold its Title." />
        </Step>

        <Step
          index={2}
          title={`Deposit ${collateral.symbol}`}
          state={stepState(packId !== null, hasCollateral && depositText === '')}
        >
          <AmountField
            label="Amount to seal"
            value={depositText}
            onChange={setDepositText}
            asset={collateral}
            hint={
              <>
                <span>
                  Available:{' '}
                  {walletBalance === null
                    ? 'checking'
                    : `${formatUnits(walletBalance, collateral.decimals)} ${collateral.symbol}`}
                </span>
                <span>
                  In this pack:{' '}
                  {packBalance === null
                    ? 'checking'
                    : `${formatUnits(packBalance, collateral.decimals)} ${collateral.symbol}`}
                </span>
              </>
            }
          />
          {deposit !== null &&
            packBalance !== null &&
            deposit + packBalance > collateral.capPerPack && (
              <p className={actionStyles.warn}>
                A pack holds at most {formatUnits(collateral.capPerPack, collateral.decimals)}{' '}
                {collateral.symbol} in this release.
              </p>
            )}
          <div>
            <Button
              size="sm"
              disabled={
                deposit === null ||
                (walletBalance !== null && deposit > walletBalance) ||
                depositTx.state.phase === 'pending'
              }
              onClick={() => void sendDeposit()}
            >
              {depositTx.state.phase === 'pending' ? 'Waiting for the Wallet' : 'Deposit'}
            </Button>
          </div>
          <TxStatus state={depositTx.state} success="Deposited into the pack." />
        </Step>

        <Step index={3} title="Name the loan" state={stepState(hasCollateral, loanValid)}>
          <AmountField
            label="You receive now"
            value={principalText}
            onChange={setPrincipalText}
            asset={SETTLEMENT}
          />
          <div className={styles.field}>
            <span className="t-caption">Term</span>
            <div className={styles.terms} role="group" aria-label="Term">
              {TERM_OPTIONS.filter(
                (option) => option.testnetOnly !== true || network === 'testnet',
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={styles.term}
                  aria-pressed={option.id === termId}
                  onClick={() => {
                    setTermId(option.id);
                  }}
                >
                  <span className="t-label">{option.label}</span>
                  <span className="t-caption">
                    {option.testnetOnly === true
                      ? 'Testnet rehearsal'
                      : `${(rateBps / 100).toFixed(2)}% a month`}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <AmountField
            label="You repay by the date"
            value={repaymentText}
            onChange={(value) => {
              setRepaymentEdited(true);
              setRepaymentText(value);
            }}
            asset={SETTLEMENT}
            hint={
              <span>
                Suggested at {(rateBps / 100).toFixed(2)}% a month from the {collateral.symbol}{' '}
                volatility study. Edit it to set your own price.
              </span>
            }
          />
          {repaymentTooLow && (
            <p className={cx('t-body-sm', styles.error)}>
              The repayment must be at least the loan.
            </p>
          )}
        </Step>

        <Step
          index={4}
          title="Review and sign"
          state={stepState(hasCollateral && loanValid, offered)}
        >
          <label className={actionStyles.check}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => {
                setAgreed(event.target.checked);
              }}
            />
            If I miss the date, the lender keeps everything in the pack and I keep the USDC. The
            contracts have had an internal review only.
          </label>
          <div>
            <Button
              disabled={!agreed || offered || offerTx.state.phase === 'pending'}
              onClick={() => void sendOffer()}
            >
              {offerTx.state.phase === 'pending' ? 'Waiting for the Wallet' : 'Sign the Offer'}
            </Button>
          </div>
          <TxStatus state={offerTx.state} success="Offer open. Lenders can fill it now." />
          {offered && packId !== null && (
            <div>
              <ButtonLink href={packPath(packId)} as={Link} variant="secondary" size="sm" showIcon>
                View Your Pack
              </ButtonLink>
            </div>
          )}
        </Step>
      </div>

      <aside className={cx(actionStyles.card, styles.summary)} aria-label="Summary">
        <h2 className="t-h5">Summary</h2>
        <Facts
          rows={[
            ['Pack', packId ?? 'Not chosen'],
            [
              'Collateral',
              packBalance === null
                ? 'n/a'
                : `${formatUnits(packBalance, collateral.decimals)} ${collateral.symbol}`,
            ],
            [
              'You receive',
              principal === null ? 'n/a' : `${formatUnits(principal, SETTLEMENT.decimals)} USDC`,
            ],
            [
              'You repay',
              repayment === null ? 'n/a' : `${formatUnits(repayment, SETTLEMENT.decimals)} USDC`,
            ],
            ['Term', term?.label ?? 'n/a'],
            [
              'Storage deposit',
              `${(Number(MINT_DEPOSIT_YOCTO) / Number(YOCTO_PER_NEAR)).toString()} NEAR`,
            ],
          ]}
        />
        <p className="t-caption">
          The pack ignores the {collateral.symbol} price. Only the payment and the date decide where
          the coins go.
        </p>
      </aside>
    </div>
  );
}
