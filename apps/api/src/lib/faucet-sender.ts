import { Account } from '@near-js/accounts';
import { JsonRpcProvider } from '@near-js/providers';
import { KeyPairSigner } from '@near-js/signers';
import { actionCreators } from '@near-js/transactions';

import { NETWORKS } from '@mosaec/config/networks';

import type { FaucetSender } from '../services/faucet-service';
import type { NetworkId } from '@mosaec/config/assets';
import type { KeyPairString } from '@near-js/crypto';

const GAS_PER_TRANSFER = 15_000_000_000_000n;
const ONE_YOCTO = 1n;

/** Signs verifier `mt_transfer` calls from the faucet account, one batch per grant. */
export class NearFaucetSender implements FaucetSender {
  constructor(
    private readonly accountId: string,
    private readonly secretKey: string,
  ) {}

  async balances(network: NetworkId, tokenIds: readonly string[]): Promise<readonly bigint[]> {
    const { rpcUrl, verifierAccountId } = NETWORKS[network];
    const provider = new JsonRpcProvider({ url: rpcUrl });
    const raw = await provider.callFunction<readonly string[]>(
      verifierAccountId,
      'mt_batch_balance_of',
      { account_id: this.accountId, token_ids: tokenIds },
    );
    return (raw ?? []).map((value) => BigInt(value));
  }

  async send(
    network: NetworkId,
    receiverId: string,
    lines: readonly { tokenId: string; amount: bigint }[],
  ): Promise<string> {
    const { rpcUrl, verifierAccountId } = NETWORKS[network];
    const account = new Account(
      this.accountId,
      new JsonRpcProvider({ url: rpcUrl }),
      KeyPairSigner.fromSecretKey(this.secretKey as KeyPairString),
    );
    const result = (await account.signAndSendTransaction({
      receiverId: verifierAccountId,
      actions: lines.map((line) =>
        actionCreators.functionCall(
          'mt_transfer',
          new TextEncoder().encode(
            JSON.stringify({
              receiver_id: receiverId,
              token_id: line.tokenId,
              amount: line.amount.toString(),
              memo: 'mosaec testnet faucet',
            }),
          ),
          GAS_PER_TRANSFER,
          ONE_YOCTO,
        ),
      ),
    })) as { readonly transaction: { readonly hash: string } };
    return result.transaction.hash;
  }
}
