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
  /**
   * Solid tile colour for a round token mark, set to the mark's own disc colour so the disc
   * melts into the tile and only the glyph shows.
   */
  readonly fill?: string | undefined;
  readonly className?: string | undefined;
  readonly label?: string;
}

/** Squircle tile with the template's triple shadow. */
export function AppIcon({
  color = 'blue',
  size = 88,
  children,
  mark,
  fill,
  className,
  label,
}: AppIconProps) {
  const style = {
    '--size': `${size.toString()}px`,
    ...(fill === undefined ? {} : { background: fill }),
  } as CSSProperties;
  return (
    <span
      className={cx(
        styles.icon,
        styles[color],
        mark === true && styles.mark,
        fill !== undefined && styles.filled,
        className,
      )}
      style={style}
      role={label === undefined ? undefined : 'img'}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
    >
      {children}
    </span>
  );
}
