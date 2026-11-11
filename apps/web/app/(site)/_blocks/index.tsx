import { CheckIcon } from '@phosphor-icons/react/dist/ssr';

import { AppIcon, FaqItem, Reveal, Section, StatusPill, Tag, WordReveal, cx } from '@mosaec/ui';

import styles from './blocks.module.css';

import type { AppIconColor } from '@mosaec/ui';
import type { CSSProperties, ReactNode } from 'react';

/** Section eyebrow: a numbered blue badge with a shape and a label. */
export function Eyebrow({
  badge,
  shape,
  label,
}: {
  readonly badge: string;
  readonly shape: ReactNode;
  readonly label: string;
}) {
  return (
    <Reveal>
      <Tag badge={badge} shape={shape}>
        {label}
      </Tag>
    </Reveal>
  );
}

type Lines = readonly (string | { readonly text: string; readonly className: string })[];

/** Eyebrow, heading and lead in one of three layouts. */
export function SectionIntro({
  eyebrow,
  title,
  lead,
  layout = 'stack',
  as = 'h2',
}: {
  readonly eyebrow?: ReactNode;
  readonly title: Lines;
  readonly lead?: ReactNode;
  readonly layout?: 'stack' | 'center' | 'split';
  readonly as?: 'h1' | 'h2';
}) {
  const heading = (
    <WordReveal as={as} className={as === 'h1' ? 't-display' : 't-h1'} lines={title} />
  );
  if (layout === 'split') {
    return (
      <div className={styles.headerSplit}>
        <div className={styles.headerStack}>
          {eyebrow}
          {heading}
        </div>
        {lead !== undefined && (
          <Reveal as="p" className="t-body-lg" delay={0.2}>
            {lead}
          </Reveal>
        )}
      </div>
    );
  }
  return (
    <div
      className={cx(
        styles.headerStack,
        layout === 'center' && styles.headerCenter,
        styles.headerGap,
      )}
    >
      {eyebrow}
      {heading}
      {lead !== undefined && (
        <Reveal as="p" className="t-body-lg" delay={0.2}>
          {lead}
        </Reveal>
      )}
    </div>
  );
}

/** Copy beside a grey stage that holds a live visual. */
export function Split({
  id,
  label,
  copy,
  visual,
  reverse = false,
  dark = false,
}: {
  readonly id?: string;
  readonly label: string;
  readonly copy: ReactNode;
  readonly visual: ReactNode;
  readonly reverse?: boolean;
  readonly dark?: boolean;
}) {
  return (
    <Section id={id} label={label}>
      <div className={cx(styles.split, reverse && styles.splitReverse)}>
        <div className={styles.copy}>{copy}</div>
        <Reveal className={cx(styles.stage, dark && styles.stageDark)}>{visual}</Reveal>
      </div>
    </Section>
  );
}

export function Checks({ items }: { readonly items: readonly string[] }) {
  return (
    <Reveal as="ul" className={styles.checks} delay={0.25}>
      {items.map((item) => (
        <li key={item}>
          <span className={styles.tick}>
            <CheckIcon weight="bold" size={12} />
          </span>
          {item}
        </li>
      ))}
    </Reveal>
  );
}

export function Stats({
  items,
}: {
  readonly items: readonly { readonly value: string; readonly label: string }[];
}) {
  return (
    <Reveal className={styles.stats} delay={0.25}>
      {items.map((item) => (
        <div key={item.label} className={styles.stat}>
          <span className="t-h2">{item.value}</span>
          <span className="t-body-sm">{item.label}</span>
        </div>
      ))}
    </Reveal>
  );
}

export interface JourneyStep {
  readonly stamp: string;
  readonly title: string;
  readonly body: string;
  readonly icon: ReactNode;
  readonly color: AppIconColor;
}

/** Steps on a line, each with a time stamp (Payouts > Journey). */
export function Journey({ steps }: { readonly steps: readonly JourneyStep[] }) {
  return (
    <div className={styles.timeline} style={{ '--steps': steps.length } as CSSProperties}>
      {steps.map((step, index) => (
        <Reveal key={step.title} className={styles.tlStep} delay={0.1 + index * 0.1}>
          <span className={styles.tlHead}>
            <AppIcon color={step.color} size={32}>
              {step.icon}
            </AppIcon>
            <span className="t-mono">{step.stamp}</span>
          </span>
          <span className="t-h4">{step.title}</span>
          <p className="t-body-sm">{step.body}</p>
        </Reveal>
      ))}
    </div>
  );
}

export interface CompareRow {
  readonly name: string;
  readonly note: string;
  readonly value: string;
  /** 0 to 1. */
  readonly ratio: number;
  readonly best?: boolean;
  readonly badge?: string;
}

/** Horizontal bars that grow in on scroll (Payouts > Fees). */
export function CompareBars({
  rows,
  footnote,
}: {
  readonly rows: readonly CompareRow[];
  readonly footnote?: string;
}) {
  return (
    <Reveal className={styles.bars}>
      {rows.map((row) => (
        <div key={row.name} className={cx(styles.bar, row.best === true && styles.barBest)}>
          <div>
            <div className="t-label" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {row.name}
              {row.badge !== undefined && (
                <StatusPill tone="accent" dot={false}>
                  {row.badge}
                </StatusPill>
              )}
            </div>
            <div className="t-caption">{row.note}</div>
          </div>
          <div className={styles.barTrack}>
            <div className={styles.barFill} style={{ width: `${(row.ratio * 100).toFixed(1)}%` }} />
          </div>
          <div className={styles.barValue}>{row.value}</div>
        </div>
      ))}
      {footnote !== undefined && (
        <p className="t-caption" style={{ textAlign: 'center', marginTop: 8 }}>
          {footnote}
        </p>
      )}
    </Reveal>
  );
}

export function Bento({ children }: { readonly children: ReactNode }) {
  return <div className={styles.bento}>{children}</div>;
}

/** Bento tile: tints on hover and lifts its live visual. */
export function BentoTile({
  title,
  body,
  size,
  children,
}: {
  readonly title: string;
  readonly body: string;
  readonly size?: 'wide' | 'tall';
  readonly children: ReactNode;
}) {
  return (
    <Reveal
      className={cx(
        styles.tile,
        size === 'wide' && styles.tileWide,
        size === 'tall' && styles.tileTall,
      )}
    >
      <h3 className="t-h3">{title}</h3>
      <p className="t-body">{body}</p>
      <div className={styles.tileStage}>{children}</div>
    </Reveal>
  );
}

/** Dark editor window with numbered lines and an output footer. */
export function CodeWindow({
  file,
  lines,
  output,
}: {
  readonly file: string;
  readonly lines: readonly ReactNode[];
  readonly output?: readonly ReactNode[];
}) {
  return (
    <div className={styles.code}>
      <div className={styles.codeBar}>
        <span className={styles.codeTab}>{file}</span>
      </div>
      <pre className={styles.codeBody}>
        {lines.map((line, index) => (
          <code key={index} className={styles.codeLine}>
            {line}
          </code>
        ))}
      </pre>
      {output !== undefined && (
        <div className={styles.codeOut}>
          {output.map((line, index) => (
            <div key={index}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export const codeStyles = { ok: styles.ok };

export function BluePanel({
  icon,
  title,
  body,
  pills,
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly body: string;
  readonly pills: readonly string[];
}) {
  return (
    <Section label={title}>
      <Reveal className={styles.bluePanel}>
        <AppIcon color="light" size={52}>
          {icon}
        </AppIcon>
        <h2 className="t-h1">{title}</h2>
        <p className="t-body-lg">{body}</p>
        <div className={styles.pills}>
          {pills.map((pill) => (
            <span key={pill} className={styles.pill}>
              <CheckIcon size={12} weight="bold" />
              {pill}
            </span>
          ))}
        </div>
      </Reveal>
    </Section>
  );
}

export interface Capability {
  readonly title: string;
  readonly body: string;
  readonly icon: ReactNode;
  readonly color: AppIconColor;
}

/** Numbered rows with a big title (Saro AI > Capabilities). */
export function CapabilityList({ items }: { readonly items: readonly Capability[] }) {
  return (
    <div className={styles.capList}>
      {items.map((item, index) => (
        <Reveal key={item.title} className={styles.cap} delay={0.05 * index}>
          <span className={styles.capNum}>{String(index + 1).padStart(2, '0')}</span>
          <span className="t-h2">{item.title}</span>
          <p className="t-body">{item.body}</p>
          <AppIcon color={item.color} size={40}>
            {item.icon}
          </AppIcon>
        </Reveal>
      ))}
    </div>
  );
}

export interface CheckerCell {
  readonly kind: 'dark' | 'light';
  readonly icon?: ReactNode;
  readonly title?: string;
  readonly body?: string;
  readonly visual?: ReactNode;
}

/** Two-by-two board of dark copy cells and light visual cells. */
export function Checkerboard({
  cells,
}: {
  readonly cells: readonly [CheckerCell, CheckerCell, CheckerCell, CheckerCell];
}) {
  return (
    <Reveal className={styles.checker}>
      {cells.map((cell, index) =>
        cell.kind === 'dark' ? (
          <div key={index} className={cx(styles.checkCell, styles.checkDark)}>
            {cell.icon}
            <h3 className="t-h3">{cell.title}</h3>
            <p className="t-body-sm">{cell.body}</p>
          </div>
        ) : (
          <div key={index} className={cx(styles.checkCell, styles.checkLight)}>
            {cell.visual}
          </div>
        ),
      )}
    </Reveal>
  );
}

/** Centred FAQ used at the end of product pages. */
export function FaqBlock({
  title,
  items,
}: {
  readonly title: string;
  readonly items: readonly { readonly q: string; readonly a: string }[];
}) {
  return (
    <Section label={title}>
      <div className={cx(styles.headerStack, styles.headerCenter)} style={{ gap: 32 }}>
        <WordReveal className="t-h1" lines={[title]} />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            width: '100%',
            textAlign: 'left',
          }}
        >
          {items.map((item, index) => (
            <FaqItem key={item.q} question={item.q} defaultOpen={index === 0}>
              {item.a}
            </FaqItem>
          ))}
        </div>
      </div>
    </Section>
  );
}
