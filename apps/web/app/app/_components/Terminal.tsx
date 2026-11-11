import { cx } from '@mosaec/ui';

import { CopyButton } from './CopyButton';
import styles from './Terminal.module.css';

import type { ReactNode } from 'react';

export type Token = readonly [kind: 'key' | 'fn' | 'str' | 'num' | 'punct' | 'plain', text: string];

/** One code line as typed tokens, so the colours match the source's code window. */
export type CodeLine = readonly Token[];

/**
 * The source's developer window: a file tab, numbered code, and a darker shell strip with a
 * command and its answers.
 */
export function Terminal({
  file,
  lines,
  copy,
  command,
  output,
}: {
  readonly file: string;
  readonly lines: readonly CodeLine[];
  readonly copy: string;
  readonly command?: string;
  readonly output?: readonly ReactNode[];
}) {
  return (
    <section className={styles.window} aria-label={file}>
      <header className={styles.head}>
        <span className={styles.tab}>{file}</span>
        <CopyButton text={copy} />
      </header>
      <ol className={styles.code}>
        {lines.map((line, index) => (
          <li key={index} className={styles.line}>
            <span className={styles.lineNo} aria-hidden="true">
              {index + 1}
            </span>
            <code>
              {line.map(([kind, text], i) => (
                <span key={i} className={cx(styles[kind])}>
                  {text}
                </span>
              ))}
            </code>
          </li>
        ))}
      </ol>
      {command !== undefined && (
        <div className={styles.shell}>
          <div className={styles.cmdRow}>
            <code className={styles.cmd}>$ {command}</code>
            <CopyButton text={command} />
          </div>
          {output?.map((line, index) => (
            <code key={index} className={styles.out}>
              {line}
            </code>
          ))}
        </div>
      )}
    </section>
  );
}
