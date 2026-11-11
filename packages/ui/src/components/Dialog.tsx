'use client';

import { XIcon } from '@phosphor-icons/react';
import { useEffect, useRef } from 'react';

import styles from './Dialog.module.css';

import type { ReactNode } from 'react';

export interface DialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/** Modal built on the native `dialog` element: focus trap, Escape and backdrop come with it. */
export function Dialog({ open, title, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (node === null) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="dialog-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className={styles.head}>
        <h2 id="dialog-title" className="t-h4">
          {title}
        </h2>
        <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
          <XIcon size={16} />
        </button>
      </div>
      <div className={styles.body}>{children}</div>
    </dialog>
  );
}
