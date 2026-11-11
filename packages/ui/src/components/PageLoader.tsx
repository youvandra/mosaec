import { Mark } from './Mark';
import styles from './PageLoader.module.css';

/**
 * The design source's loader: the mark turns in and a thin track fills, then the curtain lifts.
 * Pure CSS, shown only while the root carries `motion-ok` (visible tab, motion allowed), and it
 * always lifts on its own, so content never waits on it.
 */
export function PageLoader() {
  return (
    <div className={styles.curtain} aria-hidden="true">
      <span className={styles.mark}>
        <Mark />
      </span>
      <span className={styles.track}>
        <span className={styles.progress} />
      </span>
    </div>
  );
}
