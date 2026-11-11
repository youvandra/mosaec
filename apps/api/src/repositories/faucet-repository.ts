import { and, eq, gte } from 'drizzle-orm';

import { schema } from '@mosaec/db';

import type { Db } from '@mosaec/db';

const { faucetClaims } = schema;

export class FaucetRepository {
  constructor(private readonly db: Db) {}

  async claimedSince(network: string, accountId: string, since: Date): Promise<boolean> {
    const [row] = await this.db
      .select({ id: faucetClaims.id })
      .from(faucetClaims)
      .where(
        and(
          eq(faucetClaims.network, network),
          eq(faucetClaims.accountId, accountId),
          gte(faucetClaims.claimedAt, since),
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  async record(network: string, accountId: string, txHash: string): Promise<void> {
    await this.db.insert(faucetClaims).values({ network, accountId, txHash });
  }
}
