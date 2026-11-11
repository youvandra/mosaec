import { Account } from '@near-js/accounts';
import { JsonRpcProvider } from '@near-js/providers';
import { KeyPairSigner } from '@near-js/signers';
import { actionCreators } from '@near-js/transactions';

import { ASSETS } from '@mosaec/config/assets';
import { MosaecViews, NearRpc, parseOutcome } from '@mosaec/sdk';

import type { OfferInput } from './policy';
import type { NetworkId } from '@mosaec/config/assets';
import type { ContractCall, Outcome } from '@mosaec/sdk';
import type { KeyPairString } from '@near-js/crypto';

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
}

export class NearDeskChain implements DeskChain {
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

  async send(call: ContractCall): Promise<SentCall> {
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
    const raw = await this.rpc.tx(hash, this.accountId);
    return { hash, outcome: parseOutcome(raw) };
  }
}
