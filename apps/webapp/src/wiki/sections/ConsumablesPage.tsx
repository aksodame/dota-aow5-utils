import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ItemSummary } from 'aow5-shared/data';
import type { ItemFull, LocaleDetail } from 'aow5-shared/types';
import {
  chestDraws,
  chestVariantDraws,
  chestVariants,
  consumableCategory,
  consumableFactsInput,
  consumableName,
  consumablePageFacts,
  consumablePool,
  consumableUseMax,
  gachaByItem,
  inConsumables,
  loadWikiFile,
  mallByItem,
  poolInSeason,
  poolShares,
  seasonalPatch,
  towerChestOf,
  CHEST_VARIANT_NAMES,
  type ChestRef,
  type ConsumableCategory,
  type ContainerInfo,
  type ItemsExtraFile,
  type ItemsExtraLocale,
  type PoolsFile,
  type PoolsLocale,
  type SourcesFile,
  type SourcesLocale,
  type TowerChest,
} from 'aow5-shared/wiki';
import { Panel, Select, cx } from '@/ui';
import { Link, wikiPath } from '@/router';
import { useApp } from '@/data/AppData';
import { useItemDetailsStore } from '@/data/ItemDetailsProvider';
import { ItemTile, qualityVar } from '@/components/Tile';
import { RichText } from '@/components/RichText';
import { splitDescription } from '@/lib/richDesc';
import type { Lang } from '@/i18n/strings';
import { useWikiStrings } from '../i18n';
import { CONSUMABLES, type ConsumablesStrings } from '../i18n/consumables';
import {
  AuctionField,
  Chip,
  DataFooter,
  DataTable,
  DetailHeader,
  FactGrid,
  FilterGroup,
  ItemGrid,
  ItemRef,
  Note,
  Tag,
  WikiDetail,
  WikiEmpty,
  WikiError,
  WikiList,
  WikiLoading,
  WikiMissing,
  WikiRow,
  WikiShell,
  WikiSidebar,
  collate,
  num,
  pct,
  pctOf,
  useWikiData,
  useWikiPageMeta,
} from '../kit';
import type { SectionProps } from '../WikiPage';
import styles from './ConsumablesPage.module.css';

/**
 * Consumables: potions, elixirs, drinks, and the containers that open into a
 * drop pool — crates, rune pouches, treasure chests, the magic towers' chests.
 *
 * A list and a detail, at `/wiki/consumables/<itemId>`. Which items belong is
 * `inConsumables` in `aow5-shared/wiki`, so the server's card and this list
 * cannot disagree. Every number is the S2 one: the season's patch is laid over
 * `items.full.json` before anything reads it.
 *
 * The list includes the hidden-but-in-game items the partner wiki listed — the
 * unsealed tower chests, the Greed Cave crates — which the builder's item index
 * leaves out; their records come from `items.full.json`, and their names from
 * the pool they open (see `consumableName`).
 */
export default function ConsumablesPage({ path }: SectionProps) {
  const { lang, core } = useApp();
  const t = useWikiStrings(CONSUMABLES);
  const store = useItemDetailsStore();

  useEffect(() => {
    store?.request();
  }, [store]);

  const { data, error } = useWikiData<[ItemsExtraFile, ItemsExtraLocale, PoolsFile, PoolsLocale]>([
    'items-extra.json',
    'locale.{lang}.items-extra.json',
    'pools.json',
    'locale.{lang}.pools.json',
  ]);
  const sources = useOptionalSources(lang);

  const full = store?.full ?? null;
  const detail = store?.detail ?? null;

  const rows = useMemo(
    () => (data === null || full === null || core === null ? null : buildRows(data, full, core.byId)),
    [data, full, core, lang],
  );

  const [q, setQ] = useState('');
  const [cat, setCat] = useState<ConsumableCategory | ''>('');
  const [subclass, setSubclass] = useState('');

  const selectedId = path[0];
  const selected = selectedId === undefined || rows === null ? undefined : rows.byId.get(selectedId);
  const missing = rows !== null && (path.length > 1 || (selectedId !== undefined && selected === undefined));

  const facts = useMemo(() => {
    if (selected === undefined || data === null) return null;
    const [extra, extraLocale, pools, poolsLocale] = data;
    return consumablePageFacts(
      consumableFactsInput(
        extra,
        pools,
        { id: selected.id, name: selected.name, level: selected.full.level, cost: selected.full.cost },
        { pools: poolsLocale.names, towers: extraLocale.towers },
      ),
      lang,
    );
  }, [selected, data, lang]);
  useWikiPageMeta('consumables', path, facts, missing);

  const filtered = useMemo(() => {
    if (rows === null) return [];
    const needle = q.trim().toLowerCase();
    const byName = collate(lang);
    return rows.list
      .filter(
        (row) =>
          (cat === '' || row.category === cat) &&
          (subclass === '' || row.subclass === subclass) &&
          (needle === '' || row.search.includes(needle)),
      )
      .sort((a, b) => b.cost - a.cost || byName(a.name, b.name));
  }, [rows, q, cat, subclass, lang]);

  if (error !== null) {
    return (
      <WikiShell columns="single">
        <WikiError message={error} />
      </WikiShell>
    );
  }
  if (rows === null || data === null) {
    return (
      <WikiShell columns="single">
        {store?.error ? <WikiError message={store.error} /> : <WikiLoading />}
      </WikiShell>
    );
  }

  const counts: Record<ConsumableCategory | '', number> = { '': rows.list.length, limited: 0, container: 0, plain: 0 };
  for (const row of rows.list) counts[row.category] += 1;
  const cats: (ConsumableCategory | '')[] = ['', 'limited', 'container', 'plain'];
  const catLabel = (c: ConsumableCategory | '') => (c === '' ? t.categories.all : t.categories[c]);

  const reset = () => {
    setQ('');
    setCat('');
    setSubclass('');
  };

  return (
    <WikiShell columns="list">
      <WikiSidebar
        title={t.title}
        search={{ value: q, onChange: setQ, placeholder: t.searchPlaceholder }}
        filters={
          <>
            <FilterGroup label={t.category}>
              {cats.map((c) => (
                <Chip key={c} on={cat === c} onClick={() => setCat(c)}>
                  {catLabel(c)} ({counts[c]})
                </Chip>
              ))}
            </FilterGroup>
            <label className={styles.subtype}>
              <span className={styles.subtypeLabel}>{t.subtype}</span>
              <Select value={subclass} onChange={(event) => setSubclass(event.target.value)}>
                <option value="">{t.categories.all}</option>
                {rows.subclasses.map(([key, count]) => (
                  <option key={key} value={key}>
                    {t.subclasses[key] ?? key} ({count})
                  </option>
                ))}
              </Select>
            </label>
          </>
        }
        count={
          <span title={t.sortNote}>{filtered.length > 0 ? t.count(filtered.length) : t.nothingFound}</span>
        }
        onReset={reset}
        resetDisabled={q === '' && cat === '' && subclass === ''}
      >
        {filtered.length === 0 ? (
          <p className={styles.emptyList}>{t.tryFilters}</p>
        ) : (
          <WikiList>
            {filtered.map((row) => (
              <WikiRow
                key={row.id}
                href={wikiPath('consumables', row.id)}
                active={row.id === selectedId}
                icon={<ItemTile item={row.summary} />}
                title={row.name}
                meta={
                  <>
                    <code className={styles.rowCode}>{row.id}</code>
                    <span>{rowMeta(row, t, lang)}</span>
                  </>
                }
              />
            ))}
          </WikiList>
        )}
      </WikiSidebar>

      <WikiDetail>
        {missing ? (
          <WikiMissing />
        ) : selected === undefined ? (
          <WikiEmpty>{t.pickOne}</WikiEmpty>
        ) : (
          <Detail
            row={selected}
            rows={rows}
            data={data}
            detail={detail?.[selected.id]}
            sources={sources}
          />
        )}
      </WikiDetail>
    </WikiShell>
  );
}

// ------------------------------------------------------------------ the rows

interface Row {
  id: string;
  name: string;
  /** The tile's record; synthesised for the hidden items the index leaves out. */
  summary: ItemSummary;
  /** The item record with the S2 patch applied. */
  full: ItemFull;
  category: ConsumableCategory;
  subclass: string | undefined;
  level: number;
  cost: number;
  quality: number;
  useMax: number | undefined;
  pool: string | undefined;
  container: ContainerInfo | undefined;
  chest: { ref: ChestRef; chest: TowerChest } | undefined;
  search: string;
}

interface Rows {
  list: Row[];
  byId: Map<string, Row>;
  /** Subtypes with the count of non-containers in each, as the partner's select shows them. */
  subclasses: [string, number][];
  /** Blueprint by the item it makes (the partner's `RECIPE_OF`). */
  recipeOf: Map<string, string>;
}

type Data = [ItemsExtraFile, ItemsExtraLocale, PoolsFile, PoolsLocale];

function buildRows(data: Data, full: Record<string, ItemFull>, byId: Map<string, ItemSummary>): Rows {
  const [extra, , , poolsLocale] = data;
  const list: Row[] = [];
  const recipeOf = new Map<string, string>();

  for (const base of Object.values(full)) {
    if (base === null || typeof base !== 'object' || typeof base.id !== 'string') continue;
    if (base.isRecipe === true && base.produces !== undefined) recipeOf.set(base.produces, base.id);
    const summary = byId.get(base.id);
    // In the game: the builder's index, or the hidden items the partner also listed.
    const inGame = summary !== undefined || (base as ItemFull & { flags?: { inGame?: number } }).flags?.inGame === 1;
    if (!inGame || !inConsumables(extra, { id: base.id, type: base.type })) continue;

    const patch = seasonalPatch(extra, base.id);
    const item: ItemFull =
      patch === undefined
        ? base
        : {
            ...base,
            level: patch.level ?? base.level,
            quality: patch.quality ?? base.quality,
            cost: patch.cost ?? base.cost,
            ...(patch.timeCost !== undefined ? { timeCost: patch.timeCost } : {}),
            ...(patch.values !== undefined ? { values: patch.values } : {}),
            ...(patch.needs !== undefined ? { needs: patch.needs.map(([id, count]) => ({ id, count })) as ItemFull['needs'] } : {}),
          };
    const name = consumableName(extra, base.id, summary?.name, poolsLocale.names);
    const tile: ItemSummary = {
      idx: base.idx,
      id: base.id,
      type: base.type,
      quality: item.quality,
      level: item.level,
      cost: item.cost,
      icon: summary?.icon ?? base.icon,
      kinds: summary?.kinds ?? 0,
      name,
      search: `${name} ${base.id}`.toLowerCase(),
    };
    list.push({
      id: base.id,
      name,
      summary: tile,
      full: item,
      category: consumableCategory(extra, base.id),
      subclass: base.subclass,
      level: item.level,
      cost: item.cost,
      quality: item.quality,
      useMax: consumableUseMax(extra, base.id),
      pool: consumablePool(extra, base.id),
      container: extra.items[base.id]?.container,
      chest: towerChestOf(extra, base.id),
      search: tile.search,
    });
  }

  const subclasses = new Map<string, number>();
  for (const row of list) {
    if (row.subclass === undefined || row.subclass === '') continue;
    subclasses.set(row.subclass, (subclasses.get(row.subclass) ?? 0) + (row.category === 'container' ? 0 : 1));
  }

  return {
    list,
    byId: new Map(list.map((row) => [row.id, row])),
    subclasses: [...subclasses].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    recipeOf,
  };
}

function rowMeta(row: Row, t: ConsumablesStrings, lang: Lang): string {
  const bits: string[] = [];
  if (row.chest !== undefined) {
    const draws = chestVariantDraws(row.chest.chest, row.chest.ref.variant);
    bits.push(draws === undefined ? t.rowCarriedOut : t.rowFromPool(draws));
  } else {
    bits.push(t.rowLevel(row.level));
    if (row.cost > 0) bits.push(t.rowCost(num(row.cost, lang)));
    if (row.useMax !== undefined) bits.push(t.rowUses(row.useMax));
    if (row.pool !== undefined) bits.push(t.rowPool(row.pool));
  }
  const gold = row.container?.gold;
  if (gold !== undefined) bits.push(t.rowGold(num(gold[0], lang), num(gold[1], lang)));
  return bits.join(' · ');
}

// ---------------------------------------------------------- other sources

interface Sources {
  file: SourcesFile;
  locale: SourcesLocale;
}

/**
 * The Support Shop and the treasure chests, when their tables have been
 * emitted. Optional rather than part of `useWikiData`: without them the page
 * is still whole, it just has no "other sources" block — the partner drew none
 * for an item with no such source either.
 */
function useOptionalSources(lang: Lang): Sources | null {
  const [state, setState] = useState<{ lang: Lang; value: Sources | null } | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([loadWikiFile<SourcesFile>('sources.json'), loadWikiFile<SourcesLocale>(`locale.${lang}.sources.json`)]).then(
      ([file, locale]) => {
        if (live) setState({ lang, value: { file, locale } });
      },
      () => {
        if (live) setState({ lang, value: null });
      },
    );
    return () => {
      live = false;
    };
  }, [lang]);
  return state?.value ?? null;
}

// ----------------------------------------------------------------- detail

function Detail({
  row,
  rows,
  data,
  detail,
  sources,
}: {
  row: Row;
  rows: Rows;
  data: Data;
  detail: LocaleDetail | undefined;
  sources: Sources | null;
}) {
  const { lang } = useApp();
  const t = useWikiStrings(CONSUMABLES);
  const [extra, extraLocale, pools, poolsLocale] = data;
  const variants = CHEST_VARIANT_NAMES[lang];
  const item = row.full;
  const chest = row.chest;
  const towerName = chest === undefined ? '' : (extraLocale.towers[chest.chest.tower] ?? chest.chest.tower);
  const gold = row.container?.gold;
  const chance = row.container?.chance;
  const seasons = item.seasons !== undefined && item.seasons.length > 0 ? item.seasons.map((s) => `S${s}`).join(', ') : null;

  /** A link to another consumable, or the item's page for anything else. */
  const ref = (id: string, count?: number | string, extraText?: ReactNode) => (
    <AnyRef key={id} id={id} rows={rows} extra={extra} extraLocale={extraLocale} count={count} extraText={extraText} />
  );

  // ---- the tower chest
  let chestBlock: ReactNode = null;
  if (chest !== undefined) {
    const { ref: cref, chest: c } = chest;
    const draws = chestDraws(c);
    const temporary = cref.variant === 'temporary';
    const siblings = chestVariants(extra, c.id).filter((id) => id !== row.id && rows.byId.has(id));
    const siblingLabel = (id: string) => {
      const sref = extra.items[id]?.chest;
      if (sref === undefined) return id;
      const n = chestVariantDraws(c, sref.variant);
      return n === undefined ? variants[sref.variant] : `${variants[sref.variant]} · ${n}`;
    };
    const factRows: [ReactNode, ReactNode][] = [
      [t.tower, t.towerValue(towerName, c.level)],
      [t.runDifficulty, temporary ? t.anyDifficulty : variants[cref.variant]],
      [t.drawsFromPool, temporary ? `${draws.easy} / ${draws.normal} / ${draws.hard}` : String(chestVariantDraws(c, cref.variant))],
    ];
    if (siblings.length > 0) factRows.push([t.otherVariants, siblings.map(siblingLabel).join(', ')]);
    factRows.push([t.whereOpened, t.atBase]);
    chestBlock = (
      <Panel title={temporary ? t.unsealedTitle : t.chestTitle}>
        <FactGrid rows={factRows} />
        {siblings.length > 0 && (
          <div className={styles.tagRow}>
            {siblings.map((id) => (
              <Tag key={id} href={wikiPath('consumables', id)} title={rows.byId.get(id)?.name}>
                {siblingLabel(id)}
              </Tag>
            ))}
          </div>
        )}
        <Note>{temporary ? t.unsealedNote(draws) : t.chestNote(chestVariantDraws(c, cref.variant) ?? c.count, c.pool)}</Note>
      </Panel>
    );
  }

  // ---- gold and the item chance
  let givesBlock: ReactNode = null;
  if (gold !== undefined && row.container !== undefined) {
    const factRows: [ReactNode, ReactNode][] = [[t.goldPerOpenRow, `${num(gold[0], lang)}–${num(gold[1], lang)}`]];
    if (chance !== undefined) factRows.push([t.itemFromPool, chance >= 100 ? t.always : pctOf(chance, lang, 0)]);
    if (row.container.draws > 1) factRows.push([t.drawsPerOpen, String(row.container.draws)]);
    givesBlock = (
      <Panel title={t.gives}>
        <FactGrid rows={factRows} />
        <Note>{t.goldNote(num(row.cost, lang))}</Note>
      </Panel>
    );
  }

  // ---- what it does. Shown for the tower chests too: the partner hid theirs
  // because the build had only the Chinese text, and ours is translated.
  const sections = splitDescription(detail?.desc);

  // ---- numbers, largest first as the partner sorted them
  const stats = Object.entries(item.values)
    .map(([key, value]) => ({ key, value, label: detail?.values?.[key] }))
    .sort((a, b) => (typeof b.value === 'number' ? b.value : 0) - (typeof a.value === 'number' ? a.value : 0));

  // ---- other sources
  const mall = useMemo(
    () => (sources === null ? null : mallByItem(sources.file, (pack) => sources.locale.packs[pack.id] ?? pack.id)),
    [sources],
  );
  const gacha = useMemo(() => (sources === null ? null : gachaByItem(sources.file, pools)), [sources, pools]);
  const mallHere = mall?.[row.id] ?? [];
  const gachaHere = gacha?.[row.id] ?? [];
  const byPack = new Map<string, typeof mallHere>();
  for (const m of mallHere) byPack.set(m.pack, [...(byPack.get(m.pack) ?? []), m]);

  // ---- recipe
  const recipeId = rows.recipeOf.get(row.id);

  // ---- the pool
  const pool = row.pool === undefined ? undefined : pools.pools[row.pool];
  const shares = pool === undefined ? [] : poolShares(poolInSeason(pool));
  const poolLabel = row.pool === undefined ? '' : poolsLocale.names[row.pool] ? `${poolsLocale.names[row.pool]} (${row.pool})` : row.pool;

  const rules = seasons === null ? extra.ruleset : `${extra.ruleset} · ${t.footerOnly(seasons)}`;

  return (
    <>
      <DetailHeader
        icon={
          <span className={styles.headIcon}>
            <ItemTile item={row.summary} />
          </span>
        }
        title={row.name}
        code={row.id}
        tags={
          <>
            {item.quality > 0 && (
              <span className={styles.rarity} style={{ backgroundColor: qualityVar(item.quality) }}>
                {item.quality} · {extraLocale.qualities[String(item.quality)] ?? ''}
              </span>
            )}
            {row.subclass !== undefined && <Tag>{t.subclasses[row.subclass] ?? row.subclass}</Tag>}
            {chest === undefined && <Tag>{t.levelTag(item.level)}</Tag>}
            {item.cost > 0 && <Tag tone="warn">{t.rowCost(num(item.cost, lang))}</Tag>}
            {row.useMax !== undefined && <Tag tone="accent">{t.usesTag(row.useMax)}</Tag>}
            {item.timeCost !== undefined && item.timeCost > 0 && <Tag>{t.timeTag(item.timeCost)}</Tag>}
            {seasons !== null && <Tag tone="accent">{t.onlyIn(seasons)}</Tag>}
            {chest !== undefined && <Tag>{t.towerTag(towerName)}</Tag>}
            {chest !== undefined && (
              <Tag>{chest.ref.variant === 'temporary' ? t.unsealed : variants[chest.ref.variant]}</Tag>
            )}
            {gold !== undefined && <Tag tone="warn">{t.goldPerOpen(num(gold[0], lang), num(gold[1], lang))}</Tag>}
          </>
        }
        actions={<AuctionField id={row.id} />}
      />

      {chestBlock}
      {givesBlock}

      {sections.length > 0 && (
        <Panel title={t.whatItDoes}>
          <div className={styles.desc}>
            {sections.map((section, index) => (
              <div key={index} className={section.heading !== null ? styles.descBox : undefined}>
                {section.heading !== null && (
                  <p className={styles.descHeading}>
                    <RichText nodes={section.heading} />
                  </p>
                )}
                {section.body.length > 0 && (
                  <div className={styles.descBody}>
                    <RichText nodes={section.body} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {stats.length > 0 && (
        <Panel title={t.numbers}>
          <ul className={styles.stats}>
            {stats.map((stat) => (
              <li key={stat.key}>
                <span className={styles.statName}>
                  <span>{stat.label ?? stat.key}</span>
                  {stat.label !== undefined && <code className={styles.statKey}>{stat.key}</code>}
                </span>
                <span className={styles.statValue}>{typeof stat.value === 'number' ? num(stat.value, lang) : stat.value}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {(gachaHere.length > 0 || byPack.size > 0) && sources !== null && (
        <Panel title={t.otherSources}>
          <div className={styles.tagRow}>
            {gachaHere.map((g) => {
              const name = sources.locale.chests[g.chest] ?? g.chest;
              return (
                <Tag key={`g${g.chest}`} tone="accent" title={t.gachaTitle(name, g.pools.join(', '))}>
                  {t.gachaTag(name)}
                </Tag>
              );
            })}
            {[...byPack].map(([pack, list]) => (
              <Tag
                key={`m${pack}`}
                tone="warn"
                title={[t.mallTitle(pack), ...list.map((m) => t.mallLine(m.count, num(m.price, lang), m.packed))].join('\n')}
              >
                {t.mallTag(pack)}
              </Tag>
            ))}
          </div>
        </Panel>
      )}

      {item.needs.length > 0 && (
        <Panel title={t.recipe}>
          {recipeId !== undefined ? (
            <div className={styles.craftRow}>
              {ref(recipeId)}
              <span className={styles.craftArrow} aria-hidden="true">
                →
              </span>
              {ref(row.id)}
            </div>
          ) : (
            <Note>{t.noRecipe}</Note>
          )}
          <h3 className={styles.subhead}>{t.needs}</h3>
          <ItemGrid>{item.needs.map((need) => ref(need.id, need.count))}</ItemGrid>
        </Panel>
      )}

      {row.pool !== undefined && pool !== undefined && (
        <Panel title={t.opensPool(poolLabel)}>
          {shares.length === 0 ? (
            <Note>{t.poolEmpty}</Note>
          ) : (
            <>
              <DataTable
                head={[t.colItem, t.colWeight, t.colShare]}
                numeric={[1, 2]}
                compact
                rows={shares.map((entry) => [ref(entry.id), num(entry.weight, lang), pct(entry.share, lang)])}
              />
              <Note>
                {chance !== undefined && chance < 100 ? t.shareNoteGated(pctOf(chance, lang, 0)) : t.shareNote}
              </Note>
            </>
          )}
        </Panel>
      )}

      <DataFooter ruleset={rules} built={extra.generatedAt.slice(0, 10)} />
    </>
  );
}

/**
 * An item anywhere in the detail. A consumable opens here, as the partner's
 * `openItem` did; anything else goes to its item page; a cosmetic from a
 * treasure pool has no page and is drawn as its name.
 */
function AnyRef({
  id,
  rows,
  extra,
  extraLocale,
  count,
  extraText,
}: {
  id: string;
  rows: Rows;
  extra: ItemsExtraFile;
  extraLocale: ItemsExtraLocale;
  count?: number | string | undefined;
  extraText?: ReactNode;
}) {
  const t = useWikiStrings(CONSUMABLES);
  const row = rows.byId.get(id);
  if (row !== undefined) {
    return (
      <Link to={{ href: wikiPath('consumables', id) }} className={styles.ref} title={row.name}>
        <span className={styles.refArt}>
          <ItemTile item={row.summary} />
        </span>
        <span className={styles.refText}>
          <span className={styles.refName}>
            {row.name}
            {count !== undefined && <span className={styles.refCount}> ×{count}</span>}
          </span>
          <code className={styles.refCode}>{id}</code>
        </span>
      </Link>
    );
  }
  const wearable = extra.wearables[id];
  if (wearable !== undefined) {
    return (
      <span className={cx(styles.ref, styles.refPlain)}>
        <span className={styles.refText}>
          <span className={styles.refName}>{extraLocale.wearables[id] ?? id}</span>
          <code className={styles.refCode}>
            {id} · {t.wearable}
          </code>
        </span>
      </span>
    );
  }
  return (
    <ItemRef
      id={id}
      {...(count !== undefined ? { count } : {})}
      extra={extraText ?? <code className={styles.refCode}>{id}</code>}
    />
  );
}
