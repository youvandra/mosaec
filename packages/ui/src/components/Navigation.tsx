'use client';

import { ListIcon, XIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { ButtonLink } from './Button';
import { cx } from './cx';
import { Logo } from './Logo';
import styles from './Navigation.module.css';

import type { ElementType } from 'react';

export interface NavItem {
  readonly label: string;
  readonly href: string;
}

export interface NavigationProps {
  readonly items: readonly NavItem[];
  readonly homeHref: string;
  readonly cta: NavItem;
  readonly linkAs?: ElementType;
}

const COMPACT_AFTER_PX = 24;

function RollingLabel({ text }: { readonly text: string }) {
  return (
    <span className={styles.linkClip}>
      <span className={styles.linkTrack}>
        <span>{text}</span>
        <span aria-hidden="true">{text}</span>
      </span>
    </span>
  );
}

/** Floating glass navigation pill; compacts on scroll and opens a drawer on phones. */
export function Navigation({ items, homeHref, cta, linkAs: Link = 'a' }: NavigationProps) {
  const [compact, setCompact] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setCompact(window.scrollY > COMPACT_AFTER_PX);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const close = () => {
    setOpen(false);
  };

  return (
    <div className={styles.wrap}>
      <nav className={cx(styles.nav, compact && styles.compact)} aria-label="Main">
        <Link href={homeHref} className={styles.home} aria-label="Mosaec home">
          <Logo variant="mark" />
        </Link>
        <div className={styles.links}>
          {items.map((item) => (
            <Link key={item.href} href={item.href} className={styles.link}>
              <RollingLabel text={item.label} />
            </Link>
          ))}
        </div>
        <span className={styles.divider} aria-hidden="true" />
        <ButtonLink href={cta.href} as={Link} showIcon className={styles.cta}>
          {cta.label}
        </ButtonLink>
        <button
          type="button"
          className={styles.menuButton}
          aria-expanded={open}
          aria-controls="nav-drawer"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => {
            setOpen((value) => !value);
          }}
        >
          {open ? <XIcon size={20} /> : <ListIcon size={20} />}
        </button>
        <div id="nav-drawer" className={styles.drawer} data-open={open}>
          {items.map((item) => (
            <Link key={item.href} href={item.href} className={styles.link} onClick={close}>
              {item.label}
            </Link>
          ))}
          <ButtonLink href={cta.href} as={Link} showIcon fullWidth onClick={close}>
            {cta.label}
          </ButtonLink>
        </div>
      </nav>
    </div>
  );
}
