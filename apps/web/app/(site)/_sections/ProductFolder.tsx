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
  /** Three photos that peek out of the folder and fan out on hover. */
  readonly photos: readonly [string, string, string];
  readonly href: string;
}

const PHOTO_CLASSES = [styles.p1, styles.p2, styles.p3] as const;

/** Folder card from the design source: three photos behind a glass front. */
export function ProductFolder({ title, caption, dot, icon, photos, href }: ProductFolderProps) {
  return (
    <Link href={href} className={styles.folder}>
      <div className={styles.body} aria-hidden="true">
        <div className={styles.back} />
        {photos.map((src, index) => (
          <div key={src} className={cx(styles.photo, PHOTO_CLASSES[index])}>
            <Image src={src} alt="" width={224} height={276} sizes="112px" />
          </div>
        ))}
        <div className={styles.front}>
          <span className={styles.stamp}>
            <span className={styles.dot} style={{ background: dot }} />
          </span>
          <span className={styles.sticker}>{icon}</span>
          <span className={styles.line} style={{ bottom: 30 }} />
          <span className={styles.line} style={{ bottom: 22 }} />
        </div>
      </div>
      <span className="t-h4">{title}</span>
      <span className={cx('t-body-sm', styles.caption)}>{caption}</span>
    </Link>
  );
}
