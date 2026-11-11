import { ASSETS } from '@mosaec/config/assets';
import { MosaecError } from '@mosaec/domain';

import type { FaucetRepository } from '../repositories/faucet-repository';
import type { NetworkId } from '@mosaec/config/assets';

/** One grant: enough for a pawn on each side. */
export const FAUCET_GRANT = [
  { symbol: 'ZEC', amount: 100_000_000n },
  { symbol: 'BTC', amount: 1_000_000n },
  { symbol: 'SOL', amount: 1_000_000_000n },
  { symbol: 'USDC', amount: 1_000_000_000n },
] as const;

const DAY_MS = 86_400_000;

/** Grants on one network per rolling day, across every account and address. */
export const FAUCET_DAILY_CAP = 25;
/** The faucet stops while it holds less than this many grants of any token. */
export const FAUCET_RESERVE_GRANTS = 3n;

/** Sends test tokens inside the verifier from the faucet account. */
export interface FaucetSender {
  send(
    network: NetworkId,
    receiverId: string,
    lines: readonly { tokenId: string; amount: bigint }[],
  ): Promise<string>;
  /** Whether a NEAR account with this id exists; the verifier would credit any well-formed id. */
  accountExists(network: NetworkId, accountId: string): Promise<boolean>;
  /** The faucet's verifier balance per token, in the order given. */
  balances(network: NetworkId, tokenIds: readonly string[]): Promise<readonly bigint[]>;
}

/**
 * Testnet only: grants test ZEC and USDC at most once a day per account and per client address,
 * within a daily cap, and never below a small reserve. Addresses are held in memory only, so
 * nothing about a visitor is stored.
 *
 * Claims run one at a time (one API process per host): every limit is checked and the grant sent
 * and recorded before the next claim reads them, so parallel requests cannot all pass the checks,
 * and sends from the faucet key never race for a nonce.
 */
export class FaucetService {
  private readonly byAddress = new Map<string, number>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly claims: FaucetRepository,
    private readonly sender: FaucetSender | null,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private addressUsed(address: string, nowMs: number): boolean {
    for (const [key, at] of this.byAddress) {
      if (nowMs - at >= DAY_MS) this.byAddress.delete(key);
    }
    const last = this.byAddress.get(address);
    return last !== undefined && nowMs - last < DAY_MS;
  }

  get enabled(): boolean {
    return this.sender !== null;
  }

  claim(network: NetworkId, accountId: string, address: string) {
    const run = this.queue.then(() => this.claimNow(network, accountId, address));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async claimNow(network: NetworkId, accountId: string, address: string) {
    if (network !== 'testnet' || this.sender === null) {
      throw new MosaecError('NOT_FOUND', { cause: new Error('the faucet runs on testnet only') });
    }
    const nowMs = this.now().getTime();
    const since = new Date(nowMs - DAY_MS);
    if (await this.claims.claimedSince(network, accountId, since)) {
      throw new MosaecError('FAUCET_ACCOUNT_USED');
    }
    if (this.addressUsed(address, nowMs)) {
      throw new MosaecError('FAUCET_IP_USED');
    }
    if ((await this.claims.countSince(network, since)) >= FAUCET_DAILY_CAP) {
      throw new MosaecError('FAUCET_DAILY_CAP');
    }
    if (!(await this.sender.accountExists(network, accountId))) {
      throw new MosaecError('FAUCET_NO_ACCOUNT');
    }
    const lines = FAUCET_GRANT.map((line) => ({
      tokenId: ASSETS[line.symbol].tokenIds[network],
      amount: line.amount,
    }));
    const held = await this.sender.balances(
      network,
      lines.map((line) => line.tokenId),
    );
    if (lines.some((line, i) => (held[i] ?? 0n) < line.amount * FAUCET_RESERVE_GRANTS)) {
      throw new MosaecError('FAUCET_LOW');
    }
    this.byAddress.set(address, nowMs);
    let txHash: string;
    try {
      txHash = await this.sender.send(network, accountId, lines);
    } catch (cause) {
      this.byAddress.delete(address);
      throw cause;
    }
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
