'use client';

import { BellRingingIcon, GoogleLogoIcon } from '@phosphor-icons/react';

import { cx } from '@mosaec/ui';

import { googleCalendarUrl, reminderIcs } from '../../../lib/reminder';

import styles from './DueReminder.module.css';

import type { Reminder } from '../../../lib/reminder';

/**
 * Two ways to put the repayment date in the borrower's own calendar, with alarms a day and an hour
 * before. Missing the date is the one way to lose the coins, so this sits next to every due date.
 */
export function DueReminder({
  reminder,
  className,
}: {
  readonly reminder: Omit<Reminder, 'url'> & { readonly path: string };
  readonly className?: string | undefined;
}) {
  const full = (): Reminder => ({
    ...reminder,
    url: new URL(reminder.path, window.location.origin).toString(),
  });

  const download = () => {
    const blob = new Blob([reminderIcs(full())], { type: 'text/calendar;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `mosaec-pack-${reminder.packIndex}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
  };

  return (
    <div className={cx(styles.row, className)}>
      <button type="button" className={styles.chip} onClick={download}>
        <BellRingingIcon size={14} weight="fill" />
        Remind Me
      </button>
      <button
        type="button"
        className={styles.chip}
        aria-label="Add the due date to Google Calendar"
        onClick={() => {
          window.open(googleCalendarUrl(full()), '_blank', 'noopener,noreferrer');
        }}
      >
        <GoogleLogoIcon size={14} weight="bold" />
        Google
      </button>
    </div>
  );
}
