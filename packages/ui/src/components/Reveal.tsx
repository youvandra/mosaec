'use client';

import { useInViewMotion } from './useInViewMotion';

import type { CSSProperties, ElementType, ReactNode } from 'react';

export interface RevealProps {
  readonly as?: ElementType;
  /** Seconds before the element moves in. */
  readonly delay?: number;
  /** `load` animates on first paint with CSS only; `view` enters and leaves with the scroll. */
  readonly trigger?: 'view' | 'load';
  /** Lift in px while out of view. */
  readonly y?: number;
  readonly className?: string | undefined;
  readonly children: ReactNode;
  readonly id?: string;
}

/** Fades, lifts and scales content in as it enters, and back out as it leaves. */
export function Reveal({
  as: Tag = 'div',
  delay = 0.1,
  trigger = 'view',
  y = 24,
  className,
  children,
  id,
}: RevealProps) {
  const ref = useInViewMotion<HTMLElement>();
  const style = {
    '--reveal-delay': `${delay.toString()}s`,
    '--reveal-y': `${y.toString()}px`,
  } as CSSProperties;
  return (
    <Tag
      ref={trigger === 'view' ? ref : undefined}
      id={id}
      className={className}
      style={style}
      data-reveal={trigger === 'load' ? 'load' : 'view'}
    >
      {children}
    </Tag>
  );
}
