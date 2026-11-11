'use client';

import { CaretDownIcon, CaretRightIcon, ListIcon, XIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import { ButtonLink } from './Button';
import { cx } from './cx';
import { Logo } from './Logo';
import styles from './Navigation.module.css';

import type { ElementType, ReactNode } from 'react';

export interface NavPanelItem {
  readonly title: string;
  readonly caption: string;
  readonly href: string;
  /** An App Icon tile. */
  readonly icon: ReactNode;
}

export interface NavPanel {
  readonly eyebrow: string;
  readonly items: readonly NavPanelItem[];
  /** Columns of the item grid on desktop. */
  readonly columns?: 1 | 2;
  /** A promo row under the grid. */
  readonly footer?: { readonly badge: string; readonly text: string; readonly href: string };
  /** A card beside the list, such as a featured read. */
  readonly aside?: ReactNode;
}

export interface NavMenu {
  readonly label: string;
  readonly href?: string;
  readonly panel?: NavPanel;
}

export interface NavigationProps {
  readonly menus: readonly NavMenu[];
  readonly homeHref: string;
  readonly cta: { readonly label: string; readonly href: string };
  readonly linkAs?: ElementType;
}

const COMPACT_AFTER_PX = 120;
const SCROLL_DELTA_PX = 6;
const CLOSE_DELAY_MS = 160;
/** Hover must rest this long before a menu opens, so a pointer passing over the bar opens nothing. */
const OPEN_DELAY_MS = 70;
const HOVER_POINTER = '(hover: hover) and (pointer: fine)';

function RollingLabel({ text }: { readonly text: string }) {
  return (
    <span className={styles.clip}>
      <span className={styles.track}>
        <span>{text}</span>
        <span aria-hidden="true">{text}</span>
      </span>
    </span>
  );
}

/**
 * Compact while scrolling down past the hero, full again on any scroll up. While `held` is true
 * (the pointer rests on the bar) the size stays as it is, so scrolling never shrinks the bar out
 * from under the pointer and an open menu stays open.
 */
function useCompactOnScroll(held: { readonly current: boolean }): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (held.current) {
        last = y;
        return;
      }
      if (y < COMPACT_AFTER_PX) setCompact(false);
      else if (y - last > SCROLL_DELTA_PX) setCompact(true);
      else if (last - y > SCROLL_DELTA_PX) setCompact(false);
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, [held]);
  return compact;
}

function Panel({
  panel,
  Link,
  onNavigate,
}: {
  readonly panel: NavPanel;
  readonly Link: ElementType;
  readonly onNavigate: () => void;
}) {
  return (
    <div className={cx(styles.panelBody, panel.aside !== undefined && styles.withAside)}>
      <div className={styles.panelMain}>
        <span className={cx('t-mono', styles.eyebrow)}>{panel.eyebrow}</span>
        <div className={cx(styles.grid, panel.columns === 1 && styles.single)}>
          {panel.items.map((item) => (
            <Link key={item.href} href={item.href} className={styles.item} onClick={onNavigate}>
              {item.icon}
              <span className={styles.itemText}>
                <span className={styles.itemTitle}>{item.title}</span>
                <span className={styles.itemCaption}>{item.caption}</span>
              </span>
            </Link>
          ))}
        </div>
        {panel.footer !== undefined && (
          <Link href={panel.footer.href} className={styles.promo} onClick={onNavigate}>
            <span className={styles.promoBadge}>{panel.footer.badge}</span>
            <span className={styles.promoText}>{panel.footer.text}</span>
            <CaretRightIcon size={16} className={styles.promoCaret} />
          </Link>
        )}
      </div>
      {panel.aside !== undefined && <div className={styles.aside}>{panel.aside}</div>}
    </div>
  );
}

/**
 * Keeps the last opened menu rendered while the panel closes, and reports the panel's content
 * height so open, close and a switch between menus all animate one real height.
 */
function usePanelHeight(active: NavMenu | undefined) {
  // Adjust-state-during-render: remember the last open menu without an extra effect pass.
  const [last, setLast] = useState<NavMenu | undefined>(undefined);
  if (active !== undefined && active !== last) setLast(active);
  const shown = active ?? last;
  const [contentHeight, setContentHeight] = useState(0);
  const innerRef = useRef<HTMLDivElement>(null);

  // Measure before paint, so the first open starts from the real height in the same frame.
  useLayoutEffect(() => {
    if (innerRef.current !== null) setContentHeight(innerRef.current.offsetHeight);
  }, [shown?.label]);

  useEffect(() => {
    const node = innerRef.current;
    if (node === null) return;
    const observer = new ResizeObserver(() => {
      setContentHeight(node.offsetHeight);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, []);

  return { shown, height: active === undefined ? 0 : contentHeight, innerRef };
}

/**
 * Floating glass navigation. Menus with a panel open a mega menu on hover or click; the bar
 * shrinks to logo and call to action while the reader scrolls down.
 */
export function Navigation({ menus, homeHref, cta, linkAs: Link = 'a' }: NavigationProps) {
  const hovered = useRef(false);
  const compact = useCompactOnScroll(hovered);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [drawerSection, setDrawerSection] = useState<string | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const openTimer = useRef<number | undefined>(undefined);
  const navRef = useRef<HTMLElement>(null);
  const panelId = useId();

  const cancelClose = () => {
    window.clearTimeout(closeTimer.current);
  };
  const cancelOpen = () => {
    window.clearTimeout(openTimer.current);
  };
  const scheduleClose = () => {
    cancelClose();
    cancelOpen();
    closeTimer.current = window.setTimeout(() => {
      setOpenMenu(null);
    }, CLOSE_DELAY_MS);
  };
  const scheduleOpen = (label: string) => {
    cancelClose();
    cancelOpen();
    openTimer.current = window.setTimeout(() => {
      setOpenMenu(label);
    }, OPEN_DELAY_MS);
  };
  const closeAll = useCallback(() => {
    window.clearTimeout(openTimer.current);
    setOpenMenu(null);
    setDrawer(false);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAll();
    };
    const onPointer = (event: PointerEvent) => {
      if (navRef.current !== null && !navRef.current.contains(event.target as Node)) closeAll();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [closeAll]);

  useEffect(() => {
    if (compact) setOpenMenu(null);
  }, [compact]);

  const active = menus.find((menu) => menu.label === openMenu && menu.panel !== undefined);
  const expanded = active !== undefined || drawer;
  const { shown, height, innerRef } = usePanelHeight(active);

  return (
    <div className={styles.wrap}>
      <nav
        ref={navRef}
        className={cx(
          styles.nav,
          compact && !expanded && styles.compact,
          expanded && styles.expanded,
        )}
        aria-label="Main"
        onPointerLeave={() => {
          hovered.current = false;
          scheduleClose();
        }}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') hovered.current = true;
          cancelClose();
        }}
      >
        <div className={styles.bar}>
          <Link href={homeHref} className={styles.home} aria-label="Mosaec home" onClick={closeAll}>
            <Logo variant="mark" />
            <span className={styles.wordmark} aria-hidden={!compact}>
              Mosaec
            </span>
          </Link>
          <div className={styles.menus}>
            {menus.map((menu) =>
              menu.panel !== undefined ? (
                <button
                  key={menu.label}
                  type="button"
                  className={cx(styles.link, openMenu === menu.label && styles.linkOpen)}
                  aria-expanded={openMenu === menu.label}
                  aria-controls={panelId}
                  onPointerEnter={(event) => {
                    if (event.pointerType === 'mouse') scheduleOpen(menu.label);
                  }}
                  onClick={(event) => {
                    cancelOpen();
                    // With a mouse the menu follows the pointer, so a click only confirms it.
                    // Touch and keyboard (detail 0) toggle.
                    const mouse = event.detail > 0 && window.matchMedia(HOVER_POINTER).matches;
                    setOpenMenu((value) => (value === menu.label && !mouse ? null : menu.label));
                  }}
                >
                  <RollingLabel text={menu.label} />
                  <CaretDownIcon size={14} weight="bold" className={styles.caret} />
                </button>
              ) : (
                <Link
                  key={menu.label}
                  href={menu.href}
                  className={styles.link}
                  onPointerEnter={scheduleClose}
                  onClick={closeAll}
                >
                  <RollingLabel text={menu.label} />
                </Link>
              ),
            )}
          </div>
          <span className={styles.divider} aria-hidden="true" />
          <ButtonLink href={cta.href} as={Link} showIcon className={styles.cta}>
            {cta.label}
          </ButtonLink>
          <button
            type="button"
            className={styles.menuButton}
            aria-expanded={drawer}
            aria-controls="nav-drawer"
            aria-label={drawer ? 'Close menu' : 'Open menu'}
            onClick={() => {
              setDrawer((value) => !value);
            }}
          >
            {drawer ? <XIcon size={20} /> : <ListIcon size={20} />}
          </button>
        </div>

        <div
          id={panelId}
          className={styles.panel}
          data-open={active !== undefined}
          role="region"
          aria-label={shown?.label}
          aria-hidden={active === undefined}
          inert={active === undefined}
          style={{ height }}
        >
          <div ref={innerRef}>
            {shown?.panel !== undefined && (
              <Panel key={shown.label} panel={shown.panel} Link={Link} onNavigate={closeAll} />
            )}
          </div>
        </div>

        <div id="nav-drawer" className={styles.drawer} data-open={drawer}>
          {menus.map((menu) =>
            menu.panel !== undefined ? (
              <div key={menu.label} className={styles.drawerGroup}>
                <button
                  type="button"
                  className={styles.drawerLink}
                  aria-expanded={drawerSection === menu.label}
                  onClick={() => {
                    setDrawerSection((value) => (value === menu.label ? null : menu.label));
                  }}
                >
                  {menu.label}
                  <CaretDownIcon size={16} className={styles.caret} />
                </button>
                {drawerSection === menu.label && (
                  <div className={styles.drawerItems}>
                    {menu.panel.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={styles.item}
                        onClick={closeAll}
                      >
                        {item.icon}
                        <span className={styles.itemText}>
                          <span className={styles.itemTitle}>{item.title}</span>
                          <span className={styles.itemCaption}>{item.caption}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Link
                key={menu.label}
                href={menu.href}
                className={styles.drawerLink}
                onClick={closeAll}
              >
                {menu.label}
              </Link>
            ),
          )}
          <ButtonLink href={cta.href} as={Link} showIcon fullWidth onClick={closeAll}>
            {cta.label}
          </ButtonLink>
        </div>
      </nav>
    </div>
  );
}
