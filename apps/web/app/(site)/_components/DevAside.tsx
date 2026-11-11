import { CaretRightIcon } from '@phosphor-icons/react/dist/ssr';

import styles from './DevAside.module.css';

/** Featured card in the Developers menu: the shortest real use of the SDK. */
export function DevAside() {
  return (
    <a href="/developers#sdk" className={styles.card}>
      <span className="t-mono">Quick start</span>
      <span className={styles.code} aria-hidden="true">
        <span className={styles.key}>const</span> calls = mosaecCalls(
        <span className={styles.str}>&apos;testnet&apos;</span>);{'\n'}
        <span className={styles.key}>const</span> mint = calls.mint();{'\n'}
        {'// receiver v0.mosaec.testnet'}
        {'\n'}
        {'// deposit 0.051 NEAR'}
      </span>
      <span className="t-label">Build on the pawn primitive</span>
      <span className={styles.more}>
        Read the SDK <CaretRightIcon size={14} weight="bold" />
      </span>
    </a>
  );
}
