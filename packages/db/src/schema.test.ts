import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { packs } from './schema';
import { createTestDb } from './testing';

import type { Db } from './client';

describe('schema', () => {
  let db: Db;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });

  afterAll(async () => {
    await close();
  });

  it('applies every migration and keeps u128 and nanosecond values exact', async () => {
    await db.insert(packs).values({
      network: 'testnet',
      packId: '0.v0.mosaec.testnet',
      packIndex: 0n,
      titleId: 't0',
      state: 'written',
      rounds: 1,
      kAmount: '340282366920938463463374607431768211455',
      expiresAtNs: '1794360365888920934',
      refreshedHeight: 277146115n,
    });
    const [row] = await db.select().from(packs).where(eq(packs.packId, '0.v0.mosaec.testnet'));
    expect(row?.kAmount).toBe('340282366920938463463374607431768211455');
    expect(row?.expiresAtNs).toBe('1794360365888920934');
    expect(row?.refreshedHeight).toBe(277146115n);
  });
});
