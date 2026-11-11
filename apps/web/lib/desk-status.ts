import type { DeskOverview } from './api';

/**
 * Whether the house desk loop is running. Each run saves fresh reference prices, so the newest
 * price is the loop's heartbeat. The loop runs every five minutes; three missed runs = stopped.
 */
export type DeskStatus = 'live' | 'paused' | 'stopped' | 'soon';

const STALE_MS = 15 * 60 * 1_000;

export const DESK_STATUS_LABEL: Readonly<Record<DeskStatus, string>> = {
  live: 'Live',
  paused: 'Paused',
  stopped: 'Offline',
  soon: 'Soon',
};

/** `null` overview means the API has no desk to report: it has not launched. */
export function deskStatus(overview: DeskOverview | null, nowMs: number): DeskStatus {
  if (overview === null) return 'soon';
  if (overview.policy.paused) return 'paused';
  const beats = overview.prices
    .map((price) => Date.parse(price.observedAt))
    .filter(Number.isFinite);
  if (beats.length === 0) return 'soon';
  return nowMs - Math.max(...beats) <= STALE_MS ? 'live' : 'stopped';
}
