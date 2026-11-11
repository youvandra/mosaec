import styles from './AppIcon.module.css';
import { cx } from './cx';

import type { CSSProperties, ReactNode } from 'react';

export type AppIconColor =
  'blue' | 'ink' | 'green' | 'light' | 'orange' | 'mint' | 'violet' | 'coral' | 'teal' | 'lime';

export interface AppIconProps {
  readonly color?: AppIconColor;
  /** Edge length in px. */
  readonly size?: number;
  /** A glyph (icon) or an asset mark image. */
  readonly children: ReactNode;
  /** Sizes the child as a full-colour mark instead of a glyph. */
  readonly mark?: boolean;
  readonly className?: string | undefined;
  readonly label?: string;
}

/** Squircle tile with the template's triple shadow. */
export function AppIcon({
  color = 'blue',
  size = 88,
  children,
  mark,
  className,
  label,
}: AppIconProps) {
  const style = { '--size': `${size.toString()}px` } as CSSProperties;
  return (
    <span
      className={cx(styles.icon, styles[color], mark === true && styles.mark, className)}
      style={style}
      role={label === undefined ? undefined : 'img'}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
    >
      {children}
    </span>
  );
}
