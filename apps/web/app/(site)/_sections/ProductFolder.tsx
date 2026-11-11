import Image from 'next/image';
import Link from 'next/link';

import { cx } from '@mosaec/ui';

import styles from './ProductFolder.module.css';

import type { ReactNode } from 'react';

export interface ProductFolderProps {
  readonly title: string;
  readonly caption: string;
  /** Colour of the stamp dot. */
  readonly dot: string;
  readonly icon: ReactNode;
  /** Three marks that peek out of the folder. */
  readonly marks: readonly [string, string, string];
  readonly href: string;
}

const PAPER_CLASSES = [styles.p1, styles.p2, styles.p3] as const;

/** Folder card whose papers fan out on hover. */
export function ProductFolder({ title, caption, dot, icon, marks, href }: ProductFolderProps) {
  return (
    <Link href={href} className={styles.folder}>
      <div className={styles.body} aria-hidden="true">
        <div className={styles.back} />
        {marks.map((src, index) => (
          <div key={index} className={cx(styles.paper, PAPER_CLASSES[index] ?? '')}>
            <Image src={src} alt="" width={44} height={44} />
          </div>
        ))}
        <div className={styles.front}>
          <span className={styles.stamp}>
            <span className={styles.dot} style={{ background: dot }} />
          </span>
          <span className={styles.badge}>{icon}</span>
        </div>
      </div>
      <span className="t-h4">{title}</span>
      <span className={cx('t-body-sm', styles.caption)}>{caption}</span>
    </Link>
  );
}
