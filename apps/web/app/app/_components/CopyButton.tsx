'use client';

import { CheckIcon, CopyIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { useToast } from '@mosaec/ui';

import styles from './CopyButton.module.css';

/** Copies `text` and confirms for two seconds. */
export function CopyButton({
  text,
  label = 'Copy',
}: {
  readonly text: string;
  readonly label?: string;
}) {
  const [done, setDone] = useState(false);
  const toast = useToast();
  return (
    <button
      type="button"
      className={styles.copy}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(
          () => {
            setDone(true);
            window.setTimeout(() => {
              setDone(false);
            }, 2_000);
          },
          () => {
            toast.show({
              tone: 'error',
              title: 'Copy blocked',
              body: 'Select the text and copy it by hand.',
            });
          },
        );
      }}
    >
      {done ? <CheckIcon size={14} weight="bold" /> : <CopyIcon size={14} weight="bold" />}
      {done ? 'Copied' : label}
    </button>
  );
}
