import type { CSSProperties, ElementType, ReactNode } from 'react';

export interface RevealProps {
  readonly as?: ElementType;
  readonly delay?: number;
  /** `load` animates on first paint with CSS only; `view` waits until scrolled into view. */
  readonly trigger?: 'view' | 'load';
  readonly className?: string | undefined;
  readonly children: ReactNode;
  readonly id?: string;
}

/** Fades and lifts its content in: on first paint, or as it scrolls into view. CSS only. */
export function Reveal({
  as: Tag = 'div',
  delay = 0.1,
  trigger = 'view',
  className,
  children,
  id,
}: RevealProps) {
  const style = { '--reveal-delay': `${delay.toString()}s` } as CSSProperties;
  return (
    <Tag
      id={id}
      className={className}
      style={style}
      data-reveal={trigger === 'load' ? 'shown' : 'view'}
    >
      {children}
    </Tag>
  );
}
