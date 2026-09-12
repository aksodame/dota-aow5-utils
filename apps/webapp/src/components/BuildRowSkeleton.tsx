import { memo } from 'react';
import { BUILD_PREVIEW_ITEMS } from '@/lib/preview';
import styles from './BuildRow.module.css';

/**
 * A browse row that has not arrived yet.
 *
 * It borrows `.row`'s geometry rather than approximating it, so every
 * placeholder sits where the real thing will — a skeleton whose shape differs
 * from its content makes the list jump as each page lands, which is worse than
 * the spinner this replaces.
 *
 * `aria-hidden`, and the list it sits in is marked busy: a screen reader should
 * hear "loading" once, not six empty rows.
 *
 * Memoised for the same reason the real row is: it takes no props, so it never
 * needs to render twice, and a scrolling list is full of them.
 */
export const BuildRowSkeleton = memo(function BuildRowSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden>
      <span className={`${styles.bone} ${styles.bonePortrait}`} />

      <div className={styles.main}>
        <span className={`${styles.bone} ${styles.boneTitle}`} />
        <span className={`${styles.bone} ${styles.boneMeta}`} />
      </div>

      <div className={styles.preview}>
        <span className={`${styles.bone} ${styles.bonePreviewSpell}`} />
        <div className={styles.previewItems}>
          {Array.from({ length: BUILD_PREVIEW_ITEMS }, (_, i) => (
            <span key={i} className={`${styles.bone} ${styles.bonePreviewItem}`} />
          ))}
        </div>
      </div>

      <div className={styles.likes}>
        <span className={`${styles.bone} ${styles.boneLikes}`} />
      </div>
    </div>
  );
});
