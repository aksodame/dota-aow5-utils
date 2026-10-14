import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PRIMARY_RULESET,
  faqAllBlocks,
  faqPage,
  faqPageFacts,
  faqSearchText,
  isConsumable,
  poolInSeason,
  poolShares,
  poolTotal,
  type FaqBlock,
  type FaqDoc,
  type ItemsExtraFile,
  type ItemsExtraLocale,
  type PoolsFile,
  type PoolsLocale,
} from 'aow5-shared/wiki';
import { useApp } from '@/data/AppData';
import { wikiPath } from '@/router';
import { Panel, Select } from '@/ui';
import { useContent } from '../content';
import { useWikiStrings } from '../i18n';
import { COMMON } from '../i18n/common';
import { FAQ } from '../i18n/faq';
import {
  DataFooter,
  DataTable,
  DetailHeader,
  ItemGrid,
  ItemRef,
  Note,
  Tag,
  WikiDetail,
  WikiError,
  WikiList,
  WikiLoading,
  WikiMissing,
  WikiRow,
  WikiShell,
  WikiSidebar,
  WikiSubTabs,
  WikiText,
  day,
  num,
  pct,
  useWikiData,
  useWikiPageMeta,
} from '../kit';
import type { SectionProps } from '../WikiPage';
import styles from './FaqPage.module.css';

/**
 * The FAQ: how the game works under the hood, as the wiki's author explained
 * it — chances, timers, formulas.
 *
 * A list of topics on the left with a search through everything in them, the
 * topic on the right. A topic that collects several short ones shows them as
 * tabs. Every topic and every tab is an address (`/wiki/faq/drop/luck`), so a
 * single answer can be linked to.
 *
 * The prose is content, not data — `content/faq.<lang>.json` — and this page
 * only lays out the blocks it is written in. The one block that reads game
 * data is the pool browser, which draws the drop pools from the same tables
 * the rest of the wiki uses rather than from a copy frozen into the text.
 */
export default function FaqPage({ path }: SectionProps) {
  const t = useWikiStrings(FAQ);
  const common = useWikiStrings(COMMON);
  const { core, lang } = useApp();
  const { data, error } = useContent<FaqDoc>('faq');
  const [query, setQuery] = useState('');
  // The pool picked in the pool browser. Here rather than in the browser so
  // that leaving the tab and coming back finds the same pool, as it did.
  const [pool, setPool] = useState<string | null>(null);

  const page = data === null ? undefined : faqPage(data, path);
  const facts = data !== null && path.length > 0 ? (faqPageFacts(data, path) ?? null) : null;
  useWikiPageMeta('faq', path, facts, data !== null && path.length > 0 && page === undefined);

  // Each topic's words, once per document rather than once per keystroke.
  const searchable = useMemo(
    () =>
      (data?.sections ?? []).map((section) => {
        const blocks = faqAllBlocks(section);
        return {
          section,
          text: faqSearchText(section),
          blocks: blocks.length,
          tables: blocks.filter((block) => block.type === 'table').length,
        };
      }),
    [data],
  );
  const needle = query.trim().toLowerCase();
  const shown = useMemo(
    () => (needle === '' ? searchable : searchable.filter((row) => row.text.includes(needle))),
    [searchable, needle],
  );

  // A new query starts the list from the top; picking a topic keeps it where
  // it is, which React does by itself since the list is not rebuilt.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroller = listRef.current?.parentElement;
    if (scroller) scroller.scrollTop = 0;
  }, [needle]);

  // A topic opened from the list, on a phone, is below the list: bring its
  // heading into view. Not on first paint — the reader came for the page.
  const headRef = useRef<HTMLSpanElement>(null);
  const shownKey = page === undefined ? '' : `${page.section.key}/${page.sub?.key ?? ''}`;
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (shownKey === '') return;
    const before = lastKey.current;
    lastKey.current = shownKey;
    if (before === null || before === shownKey) return;
    const head = headRef.current;
    if (head === null) return;
    const top = head.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.6) head.scrollIntoView({ block: 'start' });
  }, [shownKey]);

  const activeKey = page?.section.key;

  return (
    <WikiShell columns="list">
      <WikiSidebar
        title={t.title}
        search={{ value: query, onChange: setQuery, placeholder: t.searchPlaceholder }}
        count={data !== null && needle !== '' ? common.found(shown.length, searchable.length) : undefined}
      >
        <div ref={listRef}>
          {data !== null && shown.length === 0 && <p className={styles.nothing}>{common.nothing}</p>}
          <WikiList>
            {shown.map(({ section, blocks, tables }) => {
              const active = section.key === activeKey;
              return (
                <WikiRow
                  key={section.key}
                  // The open topic links to the tab it is on, so clicking it
                  // again does not throw the reader back to its first tab.
                  href={active && path[0] === section.key ? wikiPath('faq', ...path) : wikiPath('faq', section.key)}
                  active={active}
                  title={section.title}
                  meta={tables > 0 ? `${t.blocks(blocks)} · ${t.tables(tables)}` : t.blocks(blocks)}
                />
              );
            })}
          </WikiList>
        </div>
      </WikiSidebar>

      <WikiDetail>
        {error !== null && <WikiError message={error} />}
        {data === null && error === null && <WikiLoading />}
        {data !== null && page === undefined && <WikiMissing />}
        {page !== undefined && (
          <>
            <DetailHeader
              title={<span ref={headRef}>{page.section.title}</span>}
              code={['faq', page.section.key, ...(page.sub !== null && path.length > 1 ? [page.sub.key] : [])].join('/')}
            />
            {page.section.subs !== undefined && page.section.subs.length > 0 && (
              <WikiSubTabs
                label={t.subtabs}
                active={page.sub?.key ?? ''}
                items={page.section.subs.map((sub) => ({
                  key: sub.key,
                  label: sub.title,
                  href: wikiPath('faq', page.section.key, sub.key),
                }))}
              />
            )}
            <Panel>
              <div className={styles.body}>
                {page.blocks.map((block, index) => (
                  <Block key={`${shownKey}:${index}`} block={block} pool={pool} onPool={setPool} />
                ))}
              </div>
            </Panel>
            <Note>{t.patchNote}</Note>
            {core !== null && <DataFooter ruleset={PRIMARY_RULESET.toUpperCase()} built={day(core.meta.generatedAt, lang)} />}
          </>
        )}
      </WikiDetail>
    </WikiShell>
  );
}

/* --- blocks ------------------------------------------------------------------- */

function Block({ block, pool, onPool }: { block: FaqBlock; pool: string | null; onPool: (id: string) => void }) {
  switch (block.type) {
    case 'text':
      return (
        <p className={styles.text}>
          <WikiText text={block.text} />
        </p>
      );
    case 'note':
      return (
        <Note>
          <WikiText text={block.text} />
        </Note>
      );
    case 'list':
      return (
        <ul className={styles.list}>
          {block.items.map((item, index) => (
            <li key={index}>
              <WikiText text={item} />
            </li>
          ))}
        </ul>
      );
    case 'table':
      return <Table head={block.head} rows={block.rows} />;
    case 'columns':
      return (
        <div className={styles.columns}>
          {block.cols.map((col, index) => (
            <div key={index} className={styles.column}>
              <Table head={col.head} rows={col.rows} compact />
            </div>
          ))}
        </div>
      );
    case 'kv':
      return (
        <dl className={styles.kv}>
          {block.items.map(({ k, v }, index) => (
            <div key={index} className={styles.kvRow}>
              <dt>
                <Tag tone="accent">{k}</Tag>
              </dt>
              <dd>
                <WikiText text={v} />
              </dd>
            </div>
          ))}
        </dl>
      );
    case 'pools':
      return <PoolBrowser pools={block.pools} picked={pool} onPick={onPool} />;
    default:
      return null;
  }
}

/** A column whose every cell is a number, a percentage or a range reads right-aligned. */
const NUMERIC = /^[-+−–~≈×x]?\s*[\d\s.,]+\s*(%|[×x]|s|с|秒)?(\s*[-–—/]\s*[\d\s.,]+\s*%?)?$/;

function Table({ head, rows, compact = false }: { head: string[]; rows: string[][]; compact?: boolean }) {
  const numeric = useMemo(
    () =>
      head
        .map((_, column) => column)
        .filter((column) => column > 0 && rows.length > 0 && rows.every((row) => NUMERIC.test((row[column] ?? '').trim()))),
    [head, rows],
  );
  return (
    <DataTable
      compact={compact}
      numeric={numeric}
      head={head.map((cell, index) => (
        <WikiText key={index} text={cell} />
      ))}
      rows={rows.map((row) => row.map((cell, index) => <WikiText key={index} text={String(cell ?? '')} />))}
    />
  );
}

/* --- the pool browser ----------------------------------------------------------- */

/**
 * Pick a pool, see everything in it with its share of one draw.
 *
 * The S2 copy of each pool — the season the rest of the wiki describes. An
 * item opens on the Consumables page when it is one, as every other item link
 * in the wiki does.
 */
function PoolBrowser({
  pools,
  picked,
  onPick,
}: {
  pools: Array<{ id: string; use: string }>;
  picked: string | null;
  onPick: (id: string) => void;
}) {
  const t = useWikiStrings(FAQ);
  const { core, lang } = useApp();
  const { data, error } = useWikiData<[PoolsFile, PoolsLocale, ItemsExtraFile, ItemsExtraLocale]>([
    'pools.json',
    'locale.{lang}.pools.json',
    'items-extra.json',
    'locale.{lang}.items-extra.json',
  ]);

  const current = pools.find((p) => p.id === picked) ?? pools[0];
  const [file, locale, extra, extraLocale] = data ?? [];
  const body = current === undefined || file === undefined ? undefined : file.pools[current.id];
  const view = body === undefined ? undefined : poolInSeason(body, PRIMARY_RULESET);
  const shares = useMemo(() => (view === undefined ? [] : poolShares(view)), [view]);

  if (error !== null) return <WikiError message={error} />;
  if (data === null || file === undefined || current === undefined) return <WikiLoading />;

  const total = view === undefined ? 0 : poolTotal(view);
  const gameName = locale?.names[current.id];

  return (
    <div className={styles.pools}>
      <div className={styles.poolPick}>
        <Select
          className={styles.poolSelect}
          aria-label={t.pools.pick}
          value={current.id}
          onChange={(event) => onPick(event.target.value)}
        >
          {pools.map((p) => {
            const own = file.pools[p.id];
            const seen = own === undefined ? undefined : poolInSeason(own, PRIMARY_RULESET);
            return (
              <option key={p.id} value={p.id}>
                {t.pools.option(p.id, seen?.level ?? 0, t.pools.items(seen?.entries.length ?? 0))}
              </option>
            );
          })}
        </Select>
        {current.use !== '' && <Tag tone="accent">{current.use}</Tag>}
        {gameName !== undefined && <span className={styles.poolName}>{gameName}</span>}
      </div>

      {view === undefined ? (
        <Note>{t.pools.unknown}</Note>
      ) : (
        <>
          <p className={styles.poolStat}>{t.pools.stat(num(view.entries.length, lang), num(total, lang))}</p>
          <ItemGrid>
            {shares.map((entry, index) => {
              const item = core?.byId.get(entry.id);
              const chance = pct(entry.share, lang);
              const consumable = extra !== undefined && isConsumable(extra, entry.id, item?.type);
              return (
                <div
                  key={`${entry.id}:${index}`}
                  className={styles.poolItem}
                  title={`${item?.name ?? entry.id} (${entry.id})\n${t.pools.weight(num(entry.weight, lang), num(total, lang), chance)}`}
                >
                  {item !== undefined ? (
                    <ItemRef
                      id={entry.id}
                      size="sm"
                      extra={<code>{entry.id}</code>}
                      {...(consumable ? { href: wikiPath('consumables', entry.id) } : {})}
                    />
                  ) : (
                    // A cosmetic, or an id the item table does not define:
                    // named where the game names it, never a dead link.
                    <span className={styles.poolPlain}>
                      <span className={styles.poolPlainName}>{extraLocale?.wearables[entry.id] ?? entry.id}</span>
                      <code>{entry.id}</code>
                    </span>
                  )}
                  <span className={styles.poolChance}>{chance}</span>
                </div>
              );
            })}
          </ItemGrid>
        </>
      )}
    </div>
  );
}
