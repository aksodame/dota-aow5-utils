import { useEffect, useRef } from 'react';
import { Icon } from '@/ui';
import { useApp } from '@/data/AppData';
import { REPO_URL, WORKSHOP_URL } from '@/lib/links';
import styles from './SiteFooter.module.css';

/**
 * The attribution, and the two links that belong with it.
 *
 * This is the point of the footer rather than small print under it: these tools
 * render somebody else's art and somebody else's data, and say so on every page
 * that shows any of it — which the build page does more than any other.
 *
 * **Pinned to the bottom of the window**, on every page. The reason a fixed bar
 * is usually a mistake is that it covers the end of whatever is being read —
 * which is exactly what this one did before. It does not now: the shell keeps
 * `--footer-h` of padding under the content, so the last row of the browse list
 * ends above the bar rather than behind it.
 *
 * That variable is measured rather than declared. The bar is two lines wide on
 * a desktop and taller as the window narrows and the attribution wraps, so a
 * hard-coded height would be a gap under short pages at one width and a covered
 * row at another.
 */
export function SiteFooter() {
  const { strings } = useApp();
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;

    const root = document.documentElement;
    const measure = () => root.style.setProperty('--footer-h', `${Math.ceil(element.offsetHeight)}px`);
    measure();

    // Language changes, a resize, a font arriving late: all of them change how
    // the attribution wraps, and all of them reach this the same way.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--footer-h');
    };
  }, []);

  return (
    <footer className={styles.footer} ref={ref}>
      <div className={styles.inner}>
        <div className={styles.row}>
          <a className={styles.link} href={WORKSHOP_URL} target="_blank" rel="noreferrer noopener">
            {strings.footer.workshop}
          </a>
          <a
            className={styles.icon}
            href={REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={strings.footer.source}
            title={strings.footer.source}
          >
            <Icon.GithubMark size={18} />
          </a>
          <span className={styles.note}>{strings.footer.builtWith}</span>
        </div>

        <p className={styles.attribution}>{strings.footer.attribution}</p>
      </div>
    </footer>
  );
}
