'use client';

import { useEffect, useState } from 'react';

const MS_PER_NS = 1_000_000n;
const TICK_MS = 1000;

function parts(ms: number, compact: boolean): string {
  if (ms <= 0) return 'Passed';
  const left = compact ? '' : ' left';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d.toString()}d ${h.toString()}h${left}`;
  if (h > 0) return `${h.toString()}h ${m.toString()}m${left}`;
  return `${m.toString()}m ${(s % 60).toString()}s${left}`;
}

/** Time left until a nanosecond deadline, updated every second after hydration. */
export function Countdown({
  untilNs,
  compact = false,
}: {
  readonly untilNs: string;
  readonly compact?: boolean;
}) {
  const target = Number(BigInt(untilNs) / MS_PER_NS);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, TICK_MS);
    return () => {
      window.clearInterval(id);
    };
  }, []);

  return <span suppressHydrationWarning>{now === null ? '' : parts(target - now, compact)}</span>;
}
