import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CURRENT_RULESET,
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

  // Tables repeated with the same header (the minigame ladders, the forge
  // ladders) share one column grid; otherwise each one sizes itself to its own
  // numbers and the columns jump from table to table.
  const repeatedHeads = useMemo(() => {
    const counts = new Map<string, number>();
    for (const block of page?.blocks ?? []) {
      if (block.type !== 'table') continue;
      const key = block.head.join('\u0000');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
  }, [page]);

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
                  <Block
                    key={`${shownKey}:${index}`}
                    block={block}
                    pool={pool}
                    onPool={setPool}
                    // The towers are listed in the table's own order; the
                    // monsters tab sorts its locations by level, so this one
                    // should read the same way. Column 3 is the level in all
                    // three languages.
                    tableSort={page.sub?.key === 'towers' ? 3 : undefined}
                    tableStack={page.section.key === 'items' && page.sub?.key === 'sets' ? 3 : undefined}
                    tableUniform={repeatedHeads.has(block.type === 'table' ? block.head.join('\u0000') : '')}
                  />
                ))}
              </div>
            </Panel>
            <Note>{t.patchNote}</Note>
            {core !== null && <DataFooter ruleset={CURRENT_RULESET.toUpperCase()} built={day(core.meta.generatedAt, lang)} />}
          </>
        )}
      </WikiDetail>
    </WikiShell>
  );
}

/* --- blocks ------------------------------------------------------------------- */

function Block({
  block,
  pool,
  onPool,
  tableSort,
  tableStack,
  tableUniform,
}: {
  block: FaqBlock;
  pool: string | null;
  onPool: (id: string) => void;
  /** A column the table's rows are sorted by — the tower levels. */
  tableSort?: number;
  /** A column of item references drawn as a vertical list — a set's members. */
  tableStack?: number;
  /** Another table on the page repeats this header, so share one column grid. */
  tableUniform?: boolean;
}) {
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
      return <Table head={block.head} rows={block.rows} sortBy={tableSort} stackBy={tableStack} uniform={tableUniform} />;
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

/** A dash stands in for "not available" and does not make a column prose. */
const numericCell = (value: string | undefined): boolean => {
  const text = (value ?? '').trim();
  return text === '' || text === '—' || text === '–' || text === '-' || NUMERIC.test(text);
};

function Table({
  head,
  rows,
  compact = false,
  sortBy,
  stackBy,
  uniform = false,
}: {
  head: string[];
  rows: string[][];
  compact?: boolean;
  /** A column to sort by — ascending, with the id as a tie-break. */
  sortBy?: number;
  /** A column of item references to draw one per line. */
  stackBy?: number;
  /** A repeated table: use one fixed column grid across the copies. */
  uniform?: boolean;
}) {
  const numeric = useMemo(() => {
    if (rows.length === 0) return [];
    const auto = head
      .map((_, column) => column)
      .filter((column) => rows.every((row) => numericCell(row[column])));
    /*
     * Right-align only when the numbers are the whole table (the forge
     * ladders), or when only the row label is prose. A table where one numeric
     * column sits right and a prose column sits left reads as two tables glued
     * together; the FAQ's key-value tables are all better off left-aligned.
     */
    if (auto.length === head.length) return auto;
    return auto.length > 0 && auto.length === head.length - 1 ? auto : [];
  }, [head, rows]);

  const view = useMemo(() => {
    if (sortBy === undefined) return rows;
    return [...rows].sort((a, b) => {
      const left = Number((a[sortBy] ?? '').trim());
      const right = Number((b[sortBy] ?? '').trim());
      if (Number.isFinite(left) && Number.isFinite(right) && left !== right) return left - right;
      return String(a[0] ?? '').localeCompare(String(b[0] ?? ''), undefined, { numeric: true });
    });
  }, [rows, sortBy]);

  return (
    <DataTable
      compact={compact}
      numeric={numeric}
      className={
        head.length === 2
          ? styles.tablePair
          : head.length >= 10
            ? styles.tableGrid
            : compact && head.length === 3
              ? styles.tableTriple
              : uniform
                ? styles.tableFixed
                : undefined
      }
      head={head.map((cell, index) => (
        <WikiText key={index} text={cell} />
      ))}
      rows={view.map((row) =>
        row.map((cell, index) =>
          index === stackBy ? (
            <SetMembers key={index} text={String(cell ?? '')} />
          ) : (
            <WikiText key={index} text={String(cell ?? '')} />
          ),
        ),
      )}
    />
  );
}

/**
 * A set's composition: the item references on their own lines, in the order of
 * the items' levels. Items the content names without an `[[item:…]]` token —
 * a set member the tables do not carry — keep their words after the list.
 */
function SetMembers({ text }: { text: string }) {
  const { core } = useApp();
  const parts = useMemo(
    () =>
      text.split(/,\s*/).map((part) => {
        const token = part.match(/^\[\[item:([^|\]]+)\|([^\]]*)\]\]$/);
        return token === null ? { id: null, label: part } : { id: token[1]!, label: token[2]! };
      }),
    [text],
  );
  const items = parts
    .filter((part): part is { id: string; label: string } => part.id !== null)
    .sort((a, b) => (core?.byId.get(a.id)?.level ?? 0) - (core?.byId.get(b.id)?.level ?? 0));
  const plain = parts.filter((part) => part.id === null);

  return (
    <span className={styles.members}>
      {items.map((part) => (
        <ItemRef key={part.id} id={part.id} size="sm" />
      ))}
      {plain.map((part, index) => (
        <span key={`plain-${index}`} className={styles.memberPlain}>
          {part.label}
        </span>
      ))}
    </span>
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
  const view = body === undefined ? undefined : poolInSeason(body, CURRENT_RULESET);
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
            const seen = own === undefined ? undefined : poolInSeason(own, CURRENT_RULESET);
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
