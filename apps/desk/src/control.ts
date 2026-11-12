import { parseArgs } from 'node:util';

import { connect } from '@mosaec/db';

import { loadControlEnv } from './env';
import { DeskRepository } from './repository';

const USAGE = 'usage: control pause --reason "<why>" | resume --reason "<why>" | status';

/**
 * The desk's kill switch, run on the server over SSH. It writes `desk_controls`, which the desk
 * reads before every quote and every signature, so a pause needs no redeploy. There is no public
 * admin endpoint.
 */
async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { reason: { type: 'string' } },
  });
  const [command] = positionals;
  const env = loadControlEnv(process.env);
  const { db, close } = connect(env.DATABASE_URL);
  const repository = new DeskRepository(db);
  try {
    if (command === 'status') {
      const control = await repository.control(env.MOSAEC_NETWORK);
      console.log(
        JSON.stringify({ network: env.MOSAEC_NETWORK, ...(control ?? { paused: false }) }),
      );
      return;
    }
    const reason = values.reason?.trim();
    if ((command !== 'pause' && command !== 'resume') || reason === undefined || reason === '') {
      console.error(USAGE);
      process.exitCode = 2;
      return;
    }
    const control = await repository.setControl(env.MOSAEC_NETWORK, command === 'pause', reason);
    console.log(JSON.stringify({ network: env.MOSAEC_NETWORK, ...control }));
  } finally {
    await close();
  }
}

void main();
