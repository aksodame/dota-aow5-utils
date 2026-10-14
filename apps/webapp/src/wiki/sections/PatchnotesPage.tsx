import { Badge, Panel } from '@/ui';
import { useContent, type PatchnotesDoc } from '../content';
import { useWikiStrings } from '../i18n';
import { PATCHNOTES } from '../i18n/patchnotes';
import { DetailHeader, Note, WikiDetail, WikiError, WikiLoading, WikiShell, WikiText, useWikiPageMeta } from '../kit';
import type { SectionProps } from '../WikiPage';
import styles from './PatchnotesPage.module.css';

/**
 * The patch notes: one card per version, what changed in the game and what
 * the wiki changed because of it.
 *
 * A document rather than a list-and-detail, so it is one column. It has no
 * pages below it — a version is a heading, not an address.
 */
export default function PatchnotesPage({ path }: SectionProps) {
  const t = useWikiStrings(PATCHNOTES);
  const { data, error } = useContent<PatchnotesDoc>('patchnotes');
  useWikiPageMeta('patchnotes', path, null);

  return (
    <WikiShell columns="single">
      <WikiDetail>
        <DetailHeader title={t.title} tags={<span className={styles.lead}>{t.lead}</span>} />
        <Note>{t.disclaimer}</Note>
        {error !== null && <WikiError message={error} />}
        {data === null && error === null && <WikiLoading />}
        {data?.notes.map((note) => (
          <Panel
            key={note.version}
            title={
              <span className={styles.head}>
                {note.version}
                {note.date !== '' && <Badge>{note.date}</Badge>}
              </span>
            }
          >
            <div className={styles.body}>
              {note.game.length > 0 && <Block title={t.game} items={note.game} />}
              {note.wiki.length > 0 && <Block title={t.wiki} items={note.wiki} />}
            </div>
          </Panel>
        ))}
      </WikiDetail>
    </WikiShell>
  );
}

function Block({ title, items }: { title: string; items: string[] }) {
  return (
    <section className={styles.block}>
      <h3 className={styles.blockTitle}>{title}</h3>
      <ul className={styles.list}>
        {items.map((item, index) => (
          <li key={index}>
            <WikiText text={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}
