import { contractCodeIn, parseEventLog } from '@mosaec/domain';

import type { ErrorCode, EventEnvelope } from '@mosaec/domain';

/** The parts of an RPC `tx` result this module reads. */
export interface RpcTxResult {
  readonly status: Readonly<Record<string, unknown>>;
  readonly receipts_outcome: readonly {
    readonly outcome: {
      readonly executor_id: string;
      readonly logs: readonly string[];
      readonly status: Readonly<Record<string, unknown>>;
    };
  }[];
}

/**
 * `settled`: every step went through. `refused`: a Mosaec contract declined and the payment came
 * back in full. `failed`: the transaction itself failed.
 */
export type OutcomeStatus = 'settled' | 'refused' | 'failed';

export interface Outcome {
  readonly status: OutcomeStatus;
  readonly code?: ErrorCode;
  readonly events: readonly EventEnvelope[];
  /** True when the verifier sent value back with memo `refund`. */
  readonly refunded: boolean;
}

interface Nep245Transfer {
  readonly memo?: string;
}

function hasRefund(log: string): boolean {
  if (!log.startsWith('EVENT_JSON:')) {
    return false;
  }
  try {
    const parsed = JSON.parse(log.slice('EVENT_JSON:'.length)) as {
      standard?: string;
      event?: string;
      data?: Nep245Transfer[];
    };
    return (
      parsed.standard === 'nep245' &&
      parsed.event === 'mt_transfer' &&
      (parsed.data ?? []).some((t) => t.memo === 'refund')
    );
  } catch {
    return false;
  }
}

/** Reads a finished transaction: Mosaec events, any refusal code, and verifier refunds. */
export function parseOutcome(tx: RpcTxResult): Outcome {
  const outcomes = tx.receipts_outcome.map((r) => r.outcome);
  const logs = outcomes.flatMap((o) => o.logs);
  const events = logs.map(parseEventLog).filter((e): e is EventEnvelope => e !== undefined);
  const refunded = logs.some(hasRefund);

  const refusedEvent = events.find((e) => e.event === 'refused');
  const refusedCode =
    typeof refusedEvent?.data.code === 'string'
      ? contractCodeIn(`${refusedEvent.data.code}:`)
      : undefined;
  const failureCode = outcomes
    .map((o) =>
      'Failure' in o.status ? contractCodeIn(JSON.stringify(o.status.Failure)) : undefined,
    )
    .find((code) => code !== undefined);

  if (!('SuccessValue' in tx.status)) {
    const code = failureCode;
    return code === undefined
      ? { status: 'failed', events, refunded }
      : { status: 'failed', code, events, refunded };
  }
  const code = refusedCode ?? failureCode;
  if (code !== undefined || refusedEvent !== undefined) {
    return code === undefined
      ? { status: 'refused', events, refunded }
      : { status: 'refused', code, events, refunded };
  }
  return { status: 'settled', events, refunded };
}
