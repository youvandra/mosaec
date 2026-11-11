/*
 * Due-date reminders as plain calendar data: an .ics event with two alarms, and the same event
 * as a Google Calendar link. Nothing is sent anywhere; the borrower's own calendar does the work.
 */

const NS_PER_MS = 1_000_000n;

export interface Reminder {
  /** Repayment deadline in nanoseconds since the epoch. */
  readonly dueNs: string;
  readonly packIndex: string;
  /** What the borrower owes, e.g. "107.50 USDC". */
  readonly owed: string;
  /** Absolute link to the pack page. */
  readonly url: string;
}

function dueDate(dueNs: string): Date {
  return new Date(Number(BigInt(dueNs) / NS_PER_MS));
}

/** `20261111T143000Z`, the UTC form both .ics and Google expect. */
function stamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** RFC 5545 text escaping. */
function text(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** RFC 5545 line folding: at most 75 octets a line, continuations start with a space. */
function fold(line: string): string {
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    parts.push(rest.slice(0, 74));
    rest = rest.slice(74);
  }
  parts.push(rest);
  return parts.join('\r\n ');
}

function summary(r: Reminder): string {
  return `Repay Mosaec pack #${r.packIndex}`;
}

function details(r: Reminder): string {
  return `Repay ${r.owed} before this time or the lender keeps the coins.\n${r.url}`;
}

/** A one-event calendar with alarms a day and an hour before the date. */
export function reminderIcs(r: Reminder): string {
  const due = dueDate(r.dueNs);
  const start = new Date(due.getTime() - 30 * 60_000);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mosaec//Pawn reminder//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:pack-${r.packIndex}-${r.dueNs}@mosaec`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(due)}`,
    `SUMMARY:${text(summary(r))}`,
    `DESCRIPTION:${text(details(r))}`,
    `URL:${r.url}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${text(summary(r))} in one day`,
    'TRIGGER;RELATED=END:-P1D',
    'END:VALARM',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${text(summary(r))} in one hour`,
    'TRIGGER;RELATED=END:-PT1H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .map(fold)
    .join('\r\n')
    .concat('\r\n');
}

export function googleCalendarUrl(r: Reminder): string {
  const due = dueDate(r.dueNs);
  const start = new Date(due.getTime() - 30 * 60_000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: summary(r),
    dates: `${stamp(start)}/${stamp(due)}`,
    details: details(r),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
