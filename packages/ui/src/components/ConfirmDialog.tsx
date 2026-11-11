'use client';

import { WarningIcon } from '@phosphor-icons/react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

import { Button } from './Button';
import styles from './ConfirmDialog.module.css';
import { cx } from './cx';
import { Dialog } from './Dialog';

import type { ReactNode } from 'react';

export interface ConfirmOptions {
  readonly title: string;
  /** One or two sentences on what happens. */
  readonly body?: ReactNode;
  /** Label and value rows, such as amounts and dates. */
  readonly rows?: readonly (readonly [string, ReactNode])[];
  /** A line that stands out: what cannot be undone. */
  readonly warning?: string;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  /** `danger` turns the confirm button and warning red. */
  readonly tone?: 'default' | 'danger';
  /** Small print under the buttons, such as a link to the terms. */
  readonly footnote?: ReactNode;
}

export interface ConfirmDialogProps extends ConfirmOptions {
  readonly open: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** A modal that asks once before an action: summary rows, an optional warning, two buttons. */
export function ConfirmDialog({
  open,
  title,
  body,
  rows,
  warning,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  footnote,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} title={title} onClose={onCancel}>
      <div className={styles.stack}>
        {body !== undefined && <div className={cx('t-body-sm', styles.body)}>{body}</div>}
        {rows !== undefined && rows.length > 0 && (
          <dl className={styles.rows}>
            {rows.map(([label, value]) => (
              <div key={label} className={styles.row}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {warning !== undefined && (
          <p className={cx(styles.warning, tone === 'danger' && styles.danger)}>
            <WarningIcon size={16} weight="fill" />
            <span>{warning}</span>
          </p>
        )}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </Button>
        </div>
        {footnote !== undefined && <p className={styles.footnote}>{footnote}</p>}
      </div>
    </Dialog>
  );
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/** Lets any child ask `await confirm({...})` and renders the one dialog that answers it. */
export function ConfirmProvider({ children }: { readonly children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  }, []);

  const confirm = useCallback<Confirm>((next) => {
    resolver.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {options !== null && (
        <ConfirmDialog
          {...options}
          open
          onConfirm={() => {
            settle(true);
          }}
          onCancel={() => {
            settle(false);
          }}
        />
      )}
    </ConfirmContext.Provider>
  );
}

/** `await confirm(options)` resolves `true` only when the person presses the confirm button. */
export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (confirm === null) throw new Error('useConfirm needs a ConfirmProvider above it.');
  return confirm;
}
