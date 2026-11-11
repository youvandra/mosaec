'use client';

/**
 * Transactions the indexer has not shown yet, per pack. The wallet confirms in seconds while the
 * indexer trails the chain by up to ~45 s; pages read this to say "Confirming" instead of showing
 * the old state as if nothing happened. Kept in sessionStorage so it survives a navigation.
 */
const KEY = 'mosaec:confirming';
const EVENT = 'mosaec:confirming';
/** Past this the pack page stops waiting and shows what the indexer has. */
export const CONFIRM_TIMEOUT_MS = 120_000;

export interface Confirming {
  readonly hash: string;
  readonly at: number;
}

type Store = Record<string, Confirming>;

function read(): Store {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw === null ? {} : (JSON.parse(raw) as Store);
  } catch {
    return {};
  }
}

function write(store: Store): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* Private mode or blocked storage: the page falls back to timed refreshes. */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Pack ids a call acts on: a `pack` argument, or a deposit whose receiver is a pack account. */
export function packsOf(call: { readonly receiverId: string; readonly args: string }): string[] {
  try {
    const args = JSON.parse(call.args) as Record<string, unknown>;
    const ids = [args.pack, args.receiver_id].filter(
      (value): value is string => typeof value === 'string' && /^\d+\.v\d+\./.test(value),
    );
    return [...new Set(ids)];
  } catch {
    return [];
  }
}

export function markConfirming(packs: readonly string[], hash: string): void {
  if (packs.length === 0) return;
  const store = read();
  for (const pack of packs) store[pack] = { hash, at: Date.now() };
  write(store);
}

export function confirmingOf(pack: string): Confirming | null {
  const entry = read()[pack];
  if (entry === undefined || Date.now() - entry.at > CONFIRM_TIMEOUT_MS) return null;
  return entry;
}

export function clearConfirming(pack: string): void {
  const store = read();
  if (!(pack in store)) return;
  write(Object.fromEntries(Object.entries(store).filter(([key]) => key !== pack)));
}

export function onConfirmingChange(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => {
    window.removeEventListener(EVENT, listener);
  };
}
