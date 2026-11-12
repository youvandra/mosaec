import { Account } from '@near-js/accounts';
import { JsonRpcProvider } from '@near-js/providers';
import { KeyPairSigner } from '@near-js/signers';
import { actionCreators } from '@near-js/transactions';

import { ASSETS } from '@mosaec/config/assets';
import { MosaecViews, NearRpc, parseOutcome } from '@mosaec/sdk';

import { Serial } from './serial';

import type { OfferInput } from './policy';
import type { NetworkId } from '@mosaec/config/assets';
import type { ContractCall, Outcome } from '@mosaec/sdk';
import type { KeyPairString } from '@near-js/crypto';

/** Reads of a sent transaction's outcome before the desk gives up, doubling the gap each time. */
const CONFIRM_READS = 3;
const CONFIRM_FIRST_GAP_MS = 1_000;

/**
 * The transaction left the desk but its outcome could not be read. It may have settled, so the
 * hash travels with the error and the loop reads it again later.
 */
export class UnconfirmedSendError extends Error {
  override readonly name = 'UnconfirmedSendError';

  constructor(
    readonly hash: string,
    cause: unknown,
  ) {
    super(`transaction ${hash} was sent but its outcome could not be read`, { cause });
  }
}

export interface SentCall {
  readonly hash: string;
  readonly outcome: Outcome;
}

/** Everything the desk reads from or signs on chain. Reads need no key; sending does. */
export interface DeskChain {
  balanceUsdc(): Promise<bigint>;
  /** The offer on `pack` as the registry holds it right now, or `null` when it is not offered. */
  liveOffer(pack: string): Promise<OfferInput | null>;
  /**
   * What a pack holds when it is free and the desk holds its Title (a repayment, or coins kept
   * after a forfeit); `null` in any other state.
   */
  collectable(pack: string): Promise<readonly { tokenId: string; amount: bigint }[] | null>;
  send(call: ContractCall): Promise<SentCall>;
  /** The outcome of a transaction the desk sent earlier. */
  outcomeOf(hash: string): Promise<Outcome>;
}

/** The RPC refused a transaction because another one from the same key took its nonce. */
export function isNonceClash(cause: unknown): boolean {
  const text = cause instanceof Error ? cause.message : String(cause);
  return /nonce/i.test(text) && /larger than/i.test(text);
}

export class NearDeskChain implements DeskChain {
  /**
   * Every transaction from the desk key goes through here one at a time: the loop's collects and
   * an instant fill share one access key, and two in flight read the same nonce.
   */
  private readonly sends = new Serial();
  private readonly views: MosaecViews;
  private readonly rpc: NearRpc;
  private readonly account: Account | null;

  constructor(
    private readonly network: NetworkId,
    private readonly accountId: string,
    rpcUrl: string,
    secretKey: string | undefined,
  ) {
    this.rpc = new NearRpc(rpcUrl);
    this.views = new MosaecViews(network, this.rpc);
    this.account =
      secretKey === undefined
        ? null
        : new Account(
            accountId,
            new JsonRpcProvider({ url: rpcUrl }),
            KeyPairSigner.fromSecretKey(secretKey as KeyPairString),
          );
  }

  balanceUsdc(): Promise<bigint> {
    return this.views.balanceOf(this.accountId, ASSETS.USDC.tokenIds[this.network]);
  }

  async liveOffer(pack: string): Promise<OfferInput | null> {
    const view = await this.views.positionOf(pack);
    const stage = view?.position.stage;
    if (view === undefined || stage?.state !== 'offered') return null;
    return {
      pack,
      makerId: stage.maker_id,
      payToken: stage.pay_token,
      price: stage.price,
      kToken: stage.terms.k_token,
      kAmount: stage.terms.k_amount,
      termNs: stage.terms.term_ns,
      openUntilNs: stage.open_until_ns,
      contents: stage.contents.map((line) => ({ tokenId: line.token_id, amount: line.amount })),
      contentsHash: stage.contents_hash,
      titleOwner: view.title_owner,
    };
  }

  async collectable(pack: string): Promise<readonly { tokenId: string; amount: bigint }[] | null> {
    const view = await this.views.positionOf(pack);
    if (view === undefined) return null;
    const { stage, command_in_flight: busy } = view.position;
    if (stage.state !== 'free' || busy || view.title_owner !== this.accountId) return null;
    const lines = await this.views.holdingsOf(pack);
    return lines.map((line) => ({ tokenId: line.token_id, amount: line.amount }));
  }

  send(call: ContractCall): Promise<SentCall> {
    return this.sends.run(async () => {
      try {
        return await this.sendNow(call);
      } catch (cause) {
        /* A key used elsewhere (the CLI, another process) can still take the nonce: read it again once. */
        if (!isNonceClash(cause)) throw cause;
        return this.sendNow(call);
      }
    });
  }

  private async sendNow(call: ContractCall): Promise<SentCall> {
    if (this.account === null) {
      throw new Error('the desk has no signing key; it runs read-only');
    }
    const result = (await this.account.signAndSendTransaction({
      receiverId: call.receiverId,
      actions: [
        actionCreators.functionCall(
          call.methodName,
          new TextEncoder().encode(call.args),
          call.gas,
          call.deposit,
        ),
      ],
      throwOnFailure: false,
    })) as { readonly transaction: { readonly hash: string } };
    const hash = result.transaction.hash;
    return { hash, outcome: await this.confirm(hash) };
  }

  async outcomeOf(hash: string): Promise<Outcome> {
    return parseOutcome(await this.rpc.tx(hash, this.accountId));
  }

  /** Reads the outcome of a broadcast transaction, again after a failed read. */
  private async confirm(hash: string): Promise<Outcome> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.outcomeOf(hash);
      } catch (cause) {
        if (attempt >= CONFIRM_READS) throw new UnconfirmedSendError(hash, cause);
        const gap = CONFIRM_FIRST_GAP_MS * 2 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, gap));
      }
    }
  }
}
