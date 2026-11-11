import { z } from 'zod';

/** One executed receipt, as either chain source reports it. */
export interface ReceiptOutcome {
  readonly receiptId: string;
  readonly txHash: string | null;
  readonly executorId: string;
  readonly logs: readonly string[];
  readonly status: Readonly<Record<string, unknown>>;
}

/** The receipts of one block that touch Mosaec accounts, in execution order. */
export interface ChainBlock {
  readonly height: bigint;
  readonly timestampNs: string;
  readonly outcomes: readonly ReceiptOutcome[];
}

/** Accounts whose receipts the indexer reads on one network. */
export interface Scope {
  readonly registry: string;
  readonly verifier: string;
}

export interface EventRecord {
  readonly receiptId: string;
  readonly logIndex: number;
  readonly txHash: string | null;
  readonly executorId: string;
  readonly standard: string;
  readonly event: string;
  readonly packId: string | null;
  readonly data: unknown;
}

export interface BlockRecords {
  readonly height: bigint;
  readonly timestampNs: string;
  readonly events: readonly EventRecord[];
}

const EVENT_PREFIX = 'EVENT_JSON:';

const envelopeSchema = z.object({
  standard: z.string(),
  event: z.string(),
  data: z.unknown(),
});

function isPack(accountId: string, registry: string): boolean {
  return (
    accountId.endsWith(`.${registry}`) && /^\d+$/.test(accountId.slice(0, -registry.length - 1))
  );
}

/** Pack of a Title (`t7`) or Ticket (`k7.2`) token id. */
export function packOfToken(tokenId: string, registry: string): string | null {
  const match = /^[tk](\d+)(?:\.\d+)?$/.exec(tokenId);
  return match?.[1] === undefined ? null : `${match[1]}.${registry}`;
}

function packOf(standard: string, data: unknown, scope: Scope): string | null {
  if (standard === 'mosaec') {
    const pack = (data as { pack?: unknown } | null)?.pack;
    return typeof pack === 'string' ? pack : null;
  }
  const entries = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  for (const entry of entries) {
    if (standard === 'nep171') {
      const tokenIds = entry.token_ids;
      const first = Array.isArray(tokenIds) && typeof tokenIds[0] === 'string' ? tokenIds[0] : '';
      const pack = packOfToken(first, scope.registry);
      if (pack !== null) {
        return pack;
      }
    }
    for (const key of ['old_owner_id', 'new_owner_id', 'owner_id'] as const) {
      const owner = entry[key];
      if (typeof owner === 'string' && isPack(owner, scope.registry)) {
        return owner;
      }
    }
  }
  return null;
}

function parseEnvelope(log: string): z.output<typeof envelopeSchema> | undefined {
  if (!log.startsWith(EVENT_PREFIX)) {
    return undefined;
  }
  try {
    const parsed = envelopeSchema.safeParse(JSON.parse(log.slice(EVENT_PREFIX.length)));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Pulls the records the read model needs from one block: every `mosaec` and `nep171` event from
 * the registry and its packs, and verifier `nep245` transfers that touch a pack. Failed receipts
 * are skipped; their state changes never happened.
 */
export function extractBlock(block: ChainBlock, scope: Scope): BlockRecords {
  const events: EventRecord[] = [];
  for (const outcome of block.outcomes) {
    if ('Failure' in outcome.status) {
      continue;
    }
    const executor = outcome.executorId;
    const ours = executor === scope.registry || isPack(executor, scope.registry);
    if (!ours && executor !== scope.verifier) {
      continue;
    }
    outcome.logs.forEach((log, logIndex) => {
      const envelope = parseEnvelope(log);
      if (envelope === undefined) {
        return;
      }
      const wanted = ours
        ? envelope.standard === 'mosaec' || envelope.standard === 'nep171'
        : envelope.standard === 'nep245';
      if (!wanted) {
        return;
      }
      const packId = packOf(envelope.standard, envelope.data, scope);
      if (!ours && packId === null) {
        return;
      }
      events.push({
        receiptId: outcome.receiptId,
        logIndex,
        txHash: outcome.txHash,
        executorId: executor,
        standard: envelope.standard,
        event: envelope.event,
        packId,
        data: envelope.data,
      });
    });
  }
  return { height: block.height, timestampNs: block.timestampNs, events };
}
