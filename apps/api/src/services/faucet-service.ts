import { ASSETS } from '@mosaec/config/assets';
import { MosaecError } from '@mosaec/domain';

import type { FaucetRepository } from '../repositories/faucet-repository';
import type { NetworkId } from '@mosaec/config/assets';

/** One grant: enough for a pawn on each side. */
export const FAUCET_GRANT = [
  { symbol: 'ZEC', amount: 100_000_000n },
  { symbol: 'USDC', amount: 1_000_000_000n },
] as const;

const DAY_MS = 86_400_000;

/** Sends test tokens inside the verifier from the faucet account. */
export interface FaucetSender {
  send(
    network: NetworkId,
    receiverId: string,
    lines: readonly { tokenId: string; amount: bigint }[],
  ): Promise<string>;
}

/** Testnet only: grants test ZEC and USDC to a NEAR account at most once a day. */
export class FaucetService {
  constructor(
    private readonly claims: FaucetRepository,
    private readonly sender: FaucetSender | null,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get enabled(): boolean {
    return this.sender !== null;
  }

  async claim(network: NetworkId, accountId: string) {
    if (network !== 'testnet' || this.sender === null) {
      throw new MosaecError('NOT_FOUND', { cause: new Error('the faucet runs on testnet only') });
    }
    const since = new Date(this.now().getTime() - DAY_MS);
    if (await this.claims.claimedSince(network, accountId, since)) {
      throw new MosaecError('RATE_LIMITED', { cause: new Error('one grant per account per day') });
    }
    const lines = FAUCET_GRANT.map((line) => ({
      tokenId: ASSETS[line.symbol].tokenIds[network],
      amount: line.amount,
    }));
    const txHash = await this.sender.send(network, accountId, lines);
    await this.claims.record(network, accountId, txHash);
    return {
      accountId,
      txHash,
      granted: FAUCET_GRANT.map((line) => ({
        symbol: line.symbol,
        amount: line.amount.toString(),
      })),
    };
  }
}
