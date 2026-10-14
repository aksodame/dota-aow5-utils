import { useEffect, useRef } from 'react';
import { Badge, Tab, Tabs } from '@/ui';
import { useApp } from '@/data/AppData';
import { intercept } from '@/components/TopBar';
import { WIKI_SECTIONS, wikiPath, type WikiSection } from '@/router';
import styles from './WikiNav.module.css';

/**
 * The second row of the top bar: the wiki's sections.
 *
 * Drawn only inside the wiki, under the bar rather than in it — eleven more
 * tabs in the first row would bury the five that are the rest of the site, and
 * the Wikipedia tab above already says where you are. It does not scroll with
 * the page for the same reason the bar does not: it is how you leave.
 *
 * Smaller than the row above and lit in the accent rather than inverted, so
 * the two never read as one list that wrapped.
 */
export function WikiNav({ section }: { section: WikiSection }) {
  const { strings } = useApp();
  const t = strings.wikiNav;
  const row = useRef<HTMLDivElement>(null);

  /*
   * On a phone the row scrolls sideways, and a section past the fold would be
   * lit where nobody can see it. Bring the lit one into view — within the row
   * only: `scrollIntoView` would also scroll the page.
   */
  useEffect(() => {
    const nav = row.current?.querySelector('nav');
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav == null || active == null) return;
    const left = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
    nav.scrollTo({ left: Math.max(0, left), behavior: 'instant' });
  }, [section]);

  return (
    <div className={styles.row} ref={row}>
      <Tabs className={styles.nav} aria-label={t.label}>
        {WIKI_SECTIONS.map((key) => (
          <Tab
            key={key}
            href={wikiPath(key)}
            active={key === section}
            onClick={intercept}
            className={styles.tab}
          >
            {t.sections[key]}
            {UNFINISHED.has(key) && (
              <Badge small title={t.wipTitle} className={styles.wip}>
                {t.wip}
              </Badge>
            )}
          </Tab>
        ))}
      </Tabs>
    </div>
  );
}

/**
 * The sections the wiki's author marked as still being written.
 *
 * Kept as a mark rather than hidden: what is there is right, it is what is
 * missing that makes them unfinished.
 */
const UNFINISHED: ReadonlySet<WikiSection> = new Set(['vendors', 'calc']);
