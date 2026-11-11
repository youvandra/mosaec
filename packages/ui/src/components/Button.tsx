import { CaretRightIcon } from '@phosphor-icons/react/dist/ssr';

import styles from './Button.module.css';
import { cx } from './cx';

import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'inverse';

interface CommonProps {
  readonly variant?: ButtonVariant;
  readonly size?: 'md' | 'sm';
  /** Shows the trailing caret. */
  readonly showIcon?: boolean;
  readonly fullWidth?: boolean;
  readonly children: string;
  readonly icon?: ReactNode;
}

function Label({ text }: { readonly text: string }) {
  return (
    <span className={styles.label}>
      <span className={styles.labelTrack}>
        <span>{text}</span>
        <span aria-hidden="true">{text}</span>
      </span>
    </span>
  );
}

function classes(props: CommonProps, className?: string): string {
  return cx(
    styles.button,
    styles[props.variant ?? 'primary'],
    props.size === 'sm' && styles.sm,
    props.fullWidth === true && styles.full,
    className,
  );
}

function Content(props: CommonProps) {
  const icon =
    props.icon ?? (props.showIcon === true ? <CaretRightIcon size={16} weight="bold" /> : null);
  return (
    <>
      <Label text={props.children} />
      {icon !== null && <span className={styles.icon}>{icon}</span>}
    </>
  );
}

export type ButtonProps = CommonProps & Omit<ComponentPropsWithoutRef<'button'>, 'children'>;

export function Button({
  variant,
  size,
  showIcon,
  fullWidth,
  icon,
  children,
  className,
  ...rest
}: ButtonProps) {
  const common = { variant, size, showIcon, fullWidth, icon, children } as CommonProps;
  return (
    <button type="button" className={classes(common, className)} {...rest}>
      <Content {...common} />
    </button>
  );
}

export type ButtonLinkProps = CommonProps &
  Omit<ComponentPropsWithoutRef<'a'>, 'children'> & {
    readonly href: string;
    /** Link component, such as Next's `Link`, for client-side navigation. */
    readonly as?: ElementType;
  };

export function ButtonLink({
  variant,
  size,
  showIcon,
  fullWidth,
  icon,
  children,
  className,
  as: Component = 'a',
  ...rest
}: ButtonLinkProps) {
  const common = { variant, size, showIcon, fullWidth, icon, children } as CommonProps;
  return (
    <Component className={classes(common, className)} {...rest}>
      <Content {...common} />
    </Component>
  );
}
