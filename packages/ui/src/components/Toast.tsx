'use client';

import {
  CheckCircleIcon,
  InfoIcon,
  SpinnerGapIcon,
  WarningCircleIcon,
  XIcon,
} from '@phosphor-icons/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { cx } from './cx';
import styles from './Toast.module.css';

import type { ReactNode } from 'react';

export type ToastTone = 'success' | 'error' | 'info' | 'pending';

export interface ToastInput {
  readonly tone?: ToastTone;
  readonly title: string;
  readonly body?: string | undefined;
  /** Link shown under the body, such as an explorer transaction. */
  readonly action?: { readonly label: string; readonly href: string } | undefined;
  /** Milliseconds before it closes itself; `null` keeps it until closed or replaced. */
  readonly duration?: number | null;
}

interface ToastItem extends ToastInput {
  readonly id: number;
  readonly leaving: boolean;
}

export interface ToastApi {
  /** Shows a toast and returns its id. */
  readonly show: (input: ToastInput) => number;
  /** Replaces a toast in place, such as pending to success. */
  readonly update: (id: number, input: ToastInput) => void;
  readonly dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DEFAULT_MS: Readonly<Record<ToastTone, number | null>> = {
  success: 5_000,
  info: 4_000,
  error: 8_000,
  pending: null,
};
const LEAVE_MS = 220;
const MAX_VISIBLE = 4;

const ICONS: Readonly<Record<ToastTone, ReactNode>> = {
  success: <CheckCircleIcon size={20} weight="fill" />,
  error: <WarningCircleIcon size={20} weight="fill" />,
  info: <InfoIcon size={20} weight="fill" />,
  pending: <SpinnerGapIcon size={20} weight="bold" className={styles.spin} />,
};

/** Holds the toast stack for its subtree and renders the viewport at the bottom right. */
export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [items, setItems] = useState<readonly ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const remove = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((list) => list.map((item) => (item.id === id ? { ...item, leaving: true } : item)));
    window.setTimeout(() => {
      setItems((list) => list.filter((item) => item.id !== id));
    }, LEAVE_MS);
  }, []);

  const schedule = useCallback(
    (id: number, input: ToastInput) => {
      window.clearTimeout(timers.current.get(id));
      const ms = input.duration === undefined ? DEFAULT_MS[input.tone ?? 'info'] : input.duration;
      if (ms !== null) {
        timers.current.set(
          id,
          window.setTimeout(() => {
            remove(id);
          }, ms),
        );
      }
    },
    [remove],
  );

  const show = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-(MAX_VISIBLE - 1)), { ...input, id, leaving: false }]);
      schedule(id, input);
      return id;
    },
    [schedule],
  );

  const update = useCallback(
    (id: number, input: ToastInput) => {
      setItems((list) =>
        list.map((item) => (item.id === id ? { ...input, id, leaving: false } : item)),
      );
      schedule(id, input);
    },
    [schedule],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((timer) => {
        window.clearTimeout(timer);
      });
    };
  }, []);

  const api = useMemo<ToastApi>(() => ({ show, update, dismiss: remove }), [show, update, remove]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ol className={styles.viewport} aria-live="polite" aria-label="Notifications">
        {items.map((item) => {
          const tone = item.tone ?? 'info';
          return (
            <li
              key={item.id}
              className={cx(styles.toast, styles[tone], item.leaving && styles.leaving)}
              role={tone === 'error' ? 'alert' : 'status'}
            >
              <span className={styles.icon}>{ICONS[tone]}</span>
              <div className={styles.text}>
                <p className={styles.title}>{item.title}</p>
                {item.body !== undefined && <p className={styles.body}>{item.body}</p>}
                {item.action !== undefined && (
                  <a
                    className={styles.action}
                    href={item.action.href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {item.action.label}
                  </a>
                )}
              </div>
              <button
                type="button"
                className={styles.close}
                aria-label="Dismiss"
                onClick={() => {
                  remove(item.id);
                }}
              >
                <XIcon size={14} weight="bold" />
              </button>
            </li>
          );
        })}
      </ol>
    </ToastContext.Provider>
  );
}

/** The toast API of the nearest `ToastProvider`. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) throw new Error('useToast needs a ToastProvider above it.');
  return api;
}
