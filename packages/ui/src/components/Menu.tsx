'use client';

import { CaretDownIcon, CheckIcon } from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState } from 'react';

import { cx } from './cx';
import styles from './Menu.module.css';

import type { KeyboardEvent, ReactNode } from 'react';

export interface MenuOption<T extends string> {
  readonly id: T;
  readonly label: string;
  readonly hint?: string;
}

export interface SelectMenuProps<T extends string> {
  /** Names the control for screen readers and prefixes the trigger, such as "Sort". */
  readonly label: string;
  readonly options: readonly MenuOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly icon?: ReactNode;
  readonly align?: 'start' | 'end';
  readonly className?: string;
}

/**
 * A pill that opens a short list and keeps one choice, such as a sort order. Arrow keys move,
 * Enter picks, Escape and an outside click close.
 */
export function SelectMenu<T extends string>({
  label,
  options,
  value,
  onChange,
  icon,
  align = 'end',
  className,
}: SelectMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const listId = useId();
  const current = options.find((option) => option.id === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (root.current !== null && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
    };
  }, [open]);

  useEffect(() => {
    if (open) items.current[focus]?.focus();
  }, [open, focus]);

  const openAt = () => {
    setFocus(
      Math.max(
        0,
        options.findIndex((option) => option.id === value),
      ),
    );
    setOpen(true);
  };

  const pick = (id: T) => {
    onChange(id);
    setOpen(false);
    trigger.current?.focus();
  };

  const onListKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setFocus((at) => (at + 1) % options.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setFocus((at) => (at - 1 + options.length) % options.length);
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={root} className={cx(styles.root, className)}>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (open) setOpen(false);
          else openAt();
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            openAt();
          }
        }}
      >
        {icon}
        <span className={styles.prefix}>{label}</span>
        <span className={styles.value}>{current?.label}</span>
        <CaretDownIcon size={14} weight="bold" className={cx(styles.caret, open && styles.up)} />
      </button>
      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          className={cx(styles.list, align === 'start' ? styles.start : styles.end)}
          onKeyDown={onListKey}
        >
          {options.map((option, i) => {
            const selected = option.id === value;
            return (
              <button
                key={option.id}
                ref={(node) => {
                  items.current[i] = node;
                }}
                type="button"
                role="option"
                aria-selected={selected}
                tabIndex={i === focus ? 0 : -1}
                className={styles.option}
                onClick={() => {
                  pick(option.id);
                }}
              >
                <span className={styles.optionText}>
                  <span>{option.label}</span>
                  {option.hint !== undefined && <span className={styles.hint}>{option.hint}</span>}
                </span>
                {selected && <CheckIcon size={14} weight="bold" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
