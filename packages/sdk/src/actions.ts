import { NETWORKS } from '@mosaec/config/networks';

import { canonicalContents } from './contents';
import { GAS, GAS_FLOOR } from './gas';
import { stringifyContractJson } from './json';

import type { NetworkId } from '@mosaec/config/assets';
import type { ContentLine } from '@mosaec/domain';

/** One function call ready for a wallet: `args` is the exact JSON the contract receives. */
export interface ContractCall {
  readonly receiverId: string;
  readonly methodName: string;
  readonly args: string;
  readonly gas: bigint;
  readonly deposit: bigint;
}

/** Deposit `mint` requires (`MINT_DEPOSIT`, 0.051 NEAR); `config().mint_deposit` reports it too. */
export const MINT_DEPOSIT_YOCTO = 51_000_000_000_000_000_000_000n;

/** NEP-145 registration on a test or bridged token (`storage_balance_bounds().min`, 0.00125 NEAR). */
export const FT_STORAGE_DEPOSIT_YOCTO = 1_250_000_000_000_000_000_000n;

/** The NEP-141 contract behind a verifier token id such as `nep141:zec.mosaec.testnet`. */
export function ftAccountOf(tokenId: string): string {
  if (!tokenId.startsWith('nep141:')) throw new RangeError(`${tokenId} is not a NEP-141 token id`);
  return tokenId.slice('nep141:'.length);
}

/** NEP-245 transfers require exactly one yoctoNEAR. */
export const ONE_YOCTO = 1n;

/** Message an exercise carries in `mt_transfer_call`. */
export const EXERCISE_MSG = '"exercise"';

export interface PawnTerms {
  readonly kToken: string;
  readonly kAmount: bigint;
  readonly termNs: bigint;
}

export type Destination =
  | { readonly kind: 'verifier'; readonly accountId: string }
  | { readonly kind: 'home_chain'; readonly address: string };

function call(
  receiverId: string,
  methodName: string,
  args: unknown,
  gas: bigint,
  deposit = 0n,
  floor = 0n,
): ContractCall {
  if (gas < floor) {
    throw new RangeError(`${methodName} needs at least ${floor.toString()} gas`);
  }
  return { receiverId, methodName, args: stringifyContractJson(args), gas, deposit };
}

function termsArgs(terms: PawnTerms): Record<string, unknown> {
  return { k_token: terms.kToken, k_amount: terms.kAmount.toString(), term_ns: terms.termNs };
}

function checkTerm(network: NetworkId, termNs: bigint): void {
  const { min, max } = NETWORKS[network].termBoundsNs;
  if (termNs < min || termNs > max) {
    throw new RangeError(`term must be between ${min.toString()} and ${max.toString()} ns`);
  }
}

function positive(amount: bigint, what: string): void {
  if (amount <= 0n) {
    throw new RangeError(`${what} must be positive`);
  }
}

/** Builders for every user-signed Mosaec call on one network. Pure: no network access. */
export function mosaecCalls(network: NetworkId) {
  const { registryAccountId: registry, verifierAccountId: verifier } = NETWORKS[network];

  return {
    /** Creates a pack and its Title for the signer. */
    mint: (deposit = MINT_DEPOSIT_YOCTO): ContractCall =>
      call(registry, 'mint', {}, GAS.mint, deposit, GAS_FLOOR.mint),

    /** Moves collateral from the signer's verifier balance into the pack, in one batch. */
    deposit: (pack: string, lines: readonly ContentLine[]): ContractCall => {
      const canonical = canonicalContents(lines);
      return call(
        verifier,
        'mt_batch_transfer',
        {
          receiver_id: pack,
          token_ids: canonical.map((l) => l.token_id),
          amounts: canonical.map((l) => l.amount.toString()),
        },
        GAS.deposit,
        ONE_YOCTO,
      );
    },

    /** Opens an offer on a pack the signer holds the Title of. */
    offer: (input: {
      pack: string;
      tokenIds: readonly string[];
      terms: PawnTerms;
      payToken: string;
      price: bigint;
      offerExpiresAtNs: bigint;
    }): ContractCall => {
      checkTerm(network, input.terms.termNs);
      positive(input.price, 'price');
      positive(input.terms.kAmount, 'repayment');
      return call(
        registry,
        'offer',
        {
          pack: input.pack,
          token_ids: [...input.tokenIds].sort(),
          terms: termsArgs(input.terms),
          pay_token: input.payToken,
          price: input.price.toString(),
          offer_expires_at_ns: input.offerExpiresAtNs,
        },
        GAS.offer,
        0n,
        GAS_FLOOR.command,
      );
    },

    cancel: (pack: string): ContractCall => call(registry, 'cancel', { pack }, GAS.cancel),

    /** Pays the principal and takes the Title. `contentsHash` is what the lender saw. */
    fill: (input: {
      pack: string;
      terms: PawnTerms;
      contentsHash: string;
      payToken: string;
      price: bigint;
    }): ContractCall => {
      positive(input.price, 'price');
      const msg = stringifyContractJson({
        fill: {
          pack: input.pack,
          terms: termsArgs(input.terms),
          contents_hash: input.contentsHash,
        },
      });
      return call(
        verifier,
        'mt_transfer_call',
        {
          receiver_id: registry,
          token_id: input.payToken,
          amount: input.price.toString(),
          msg,
        },
        GAS.fill,
        ONE_YOCTO,
      );
    },

    /** Pays `K` to the pack and takes the recorded contents. Signer must hold the Ticket. */
    exercise: (input: { pack: string; kToken: string; kAmount: bigint }): ContractCall => {
      positive(input.kAmount, 'repayment');
      return call(
        verifier,
        'mt_transfer_call',
        {
          receiver_id: input.pack,
          token_id: input.kToken,
          amount: input.kAmount.toString(),
          msg: EXERCISE_MSG,
        },
        GAS.exercise,
        ONE_YOCTO,
      );
    },

    /** Moves value out of a free pack on the Title holder's command. */
    withdraw: (input: {
      pack: string;
      tokenId: string;
      amount: bigint;
      destination: Destination;
    }): ContractCall => {
      positive(input.amount, 'amount');
      const destination =
        input.destination.kind === 'verifier'
          ? { kind: 'verifier', account_id: input.destination.accountId }
          : { kind: 'home_chain', address: input.destination.address };
      return call(
        registry,
        'withdraw',
        {
          pack: input.pack,
          token_id: input.tokenId,
          amount: input.amount.toString(),
          destination,
        },
        GAS.withdraw,
        0n,
        GAS_FLOOR.command,
      );
    },

    /** Ends a pawn past its deadline; anyone may call it. */
    expire: (pack: string): ContractCall =>
      call(registry, 'expire', { pack }, GAS.expire, 0n, GAS_FLOOR.command),

    /** Records a verifier pause or lock inside `[T - 24h, T]`; anyone may call it. */
    recordDisruption: (pack: string): ContractCall =>
      call(pack, 'record_disruption', {}, GAS.recordDisruption, 0n, GAS_FLOOR.recordDisruption),

    /** Retries delivery of exercised contents. */
    claim: (pack: string): ContractCall => call(pack, 'claim', {}, GAS.claim, 0n, GAS_FLOOR.claim),

    /** Retries delivery of the lender's principal to the maker. */
    claimPayout: (pack: string): ContractCall =>
      call(registry, 'claim_payout', { pack }, GAS.claimPayout, 0n, GAS_FLOOR.command),

    /** Moves a wallet's tokens into its verifier balance (an empty `msg` credits the sender). */
    verifierDeposit: (tokenId: string, amount: bigint): ContractCall => {
      positive(amount, 'amount');
      return call(
        ftAccountOf(tokenId),
        'ft_transfer_call',
        { receiver_id: verifier, amount: amount.toString(), msg: '' },
        GAS.verifierDeposit,
        ONE_YOCTO,
      );
    },

    /** Moves verifier balance back to a NEAR wallet as the plain token. */
    verifierWithdraw: (tokenId: string, receiverId: string, amount: bigint): ContractCall => {
      positive(amount, 'amount');
      return call(
        verifier,
        'ft_withdraw',
        { token: ftAccountOf(tokenId), receiver_id: receiverId, amount: amount.toString() },
        GAS.verifierWithdraw,
        ONE_YOCTO,
      );
    },

    /** Registers `accountId` on a token contract so it can hold that token. */
    ftStorageDeposit: (tokenId: string, accountId: string): ContractCall =>
      call(
        ftAccountOf(tokenId),
        'storage_deposit',
        { account_id: accountId, registration_only: true },
        GAS.storageDeposit,
        FT_STORAGE_DEPOSIT_YOCTO,
      ),

    /** Sends a Title or Ticket to another account. */
    nftTransfer: (tokenId: string, receiverId: string): ContractCall =>
      call(
        registry,
        'nft_transfer',
        { receiver_id: receiverId, token_id: tokenId },
        GAS.nftTransfer,
        ONE_YOCTO,
      ),
  };
}

export type MosaecCalls = ReturnType<typeof mosaecCalls>;
