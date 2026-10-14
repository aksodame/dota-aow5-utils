import { Fragment, type ReactNode } from 'react';
import { Link, wikiPath } from '@/router';
import { ItemRef } from './Refs';
import styles from './WikiText.module.css';

/**
 * The wiki's own markup, as written by its author.
 *
 * A deliberately small grammar, the one the original wiki used, so its FAQ
 * and notes carry over unedited:
 *
 * - `**bold**`
 * - `` `code` ``
 * - `[[item:<id>|label]]` — the item, as the site draws items everywhere; the
 *   label is ignored in favour of the game's own name in the reader's language,
 *   so a translated page can never name an item differently from its own page.
 * - `[[monster:<id>|label]]` — a link to the monster.
 * - `[[talent:<tree>/<node>|label]]` — a link to that node in its tree.
 *
 * Anything that does not parse is drawn as the text it is.
 */
export function WikiText({ text }: { text: string }) {
  return <>{render(text)}</>;
}

const TOKEN = /\*\*(.+?)\*\*|`([^`]+)`|\[\[(item|monster|talent):([^|\]]+)\|([^\]]*)\]\]/g;

function render(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;

  for (const match of text.matchAll(TOKEN)) {
    const at = match.index ?? 0;
    if (at > last) out.push(<Fragment key={key++}>{text.slice(last, at)}</Fragment>);

    const [whole, bold, code, kind, ref, label] = match;
    if (bold !== undefined) {
      out.push(<strong key={key++}>{render(bold)}</strong>);
    } else if (code !== undefined) {
      out.push(
        <code key={key++} className={styles.code}>
          {code}
        </code>,
      );
    } else if (kind === 'item' && ref !== undefined) {
      out.push(
        <span key={key++} className={styles.item}>
          <ItemRef id={ref} size="sm" />
        </span>,
      );
    } else if (kind === 'monster' && ref !== undefined) {
      out.push(
        <Link key={key++} to={{ href: wikiPath('monsters', ref) }} className={styles.link}>
          {label}
        </Link>,
      );
    } else if (kind === 'talent' && ref !== undefined) {
      const [tree = '', node = ''] = ref.split('/');
      out.push(
        <Link key={key++} to={{ href: wikiPath('progression', tree, node) }} className={styles.link}>
          {label}
        </Link>,
      );
    } else {
      out.push(<Fragment key={key++}>{whole}</Fragment>);
    }
    last = at + whole.length;
  }

  if (last < text.length) out.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  return out;
}
