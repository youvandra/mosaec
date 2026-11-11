import { Fragment } from 'react';

import { cx } from './cx';
import styles from './WordReveal.module.css';

import type { CSSProperties, ElementType, ReactNode } from 'react';

export interface WordRevealProps {
  readonly as?: ElementType;
  /** Lines of text; a string, or a node for inline pieces such as an accent span. */
  readonly lines: readonly (string | { readonly text: string; readonly className: string })[];
  readonly trigger?: 'view' | 'load';
  readonly className?: string | undefined;
  readonly start?: number;
  readonly after?: ReactNode;
}

interface Piece {
  readonly text: string;
  readonly className: string | undefined;
}

/** Heading whose words rise out of a blur one after another. */
export function WordReveal({
  as: Tag = 'h2',
  lines,
  trigger = 'view',
  className,
  start = 0.2,
  after,
}: WordRevealProps) {
  const pieces: Piece[][] = lines.map((line) =>
    typeof line === 'string'
      ? line.split(' ').map((text) => ({ text, className: undefined }))
      : line.text.split(' ').map((text) => ({ text, className: line.className })),
  );
  let index = 0;
  const style = { '--start': `${start.toString()}s` } as CSSProperties;
  return (
    <Tag className={className} style={style} data-reveal={trigger === 'load' ? 'shown' : 'view'}>
      {pieces.map((words, lineIndex) => (
        <Fragment key={lineIndex}>
          {lineIndex > 0 && <br />}
          {words.map((piece, wordIndex) => {
            const wordStyle = { '--i': index++ } as CSSProperties;
            return (
              <Fragment key={wordIndex}>
                {wordIndex > 0 && ' '}
                <span className={cx(styles.word, piece.className ?? '')} style={wordStyle}>
                  {piece.text}
                </span>
              </Fragment>
            );
          })}
        </Fragment>
      ))}
      {after}
    </Tag>
  );
}
