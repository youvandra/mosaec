import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import * as schema from './schema';

import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

/** Any Drizzle Postgres database over the Mosaec schema: postgres-js in services, PGlite in tests. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const MIGRATIONS_DIR = new URL('../migrations', import.meta.url).pathname;

/** Opens a pooled connection. `close` ends the pool. */
export function connect(
  databaseUrl: string,
  maxConnections = 5,
): { db: Db; close: () => Promise<void> } {
  const client = postgres(databaseUrl, { max: maxConnections });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}

/** Applies every pending migration. Migrations are expand-only. */
export async function migrateDatabase(databaseUrl: string): Promise<void> {
  const client = postgres(databaseUrl, { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    await client.end();
  }
}
