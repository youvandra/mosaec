import { LobedMark } from './LobedMark';
import styles from './PageLoader.module.css';

/**
 * The design source's loader: the mark's lobes rise one by one and a thin track fills, then the curtain lifts.
 * Pure CSS, shown only while the root carries `motion-ok` (visible tab, motion allowed), and it
 * always lifts on its own, so content never waits on it.
 */
export function PageLoader() {
  return (
    <div className={styles.curtain} aria-hidden="true">
      <span className={styles.mark}>
        <LobedMark />
      </span>
      <span className={styles.track}>
        <span className={styles.progress} />
      </span>
    </div>
  );
}
