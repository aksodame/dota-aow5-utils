import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MONSTER_TYPE_GROUPS,
  locationFactsInput,
  locationPageFacts,
  monsterFactsInput,
  monsterPageFacts,
  type DifficultyKey,
  type LocationsFile,
  type MonstersFile,
  type MonstersLocale,
  type MonsterTypeGroup,
} from 'aow5-shared/wiki';
import { Button, Icon, Select } from '@/ui';
import { navigateTo, useSearch, wikiPath } from '@/router';
import { useApp } from '@/data/AppData';
import { useWikiStrings } from '../i18n';
import { MONSTERS } from '../i18n/monsters';
import {
  Check,
  Chip,
  FilterGroup,
  WikiEmpty,
  WikiError,
  WikiList,
  WikiLoading,
  WikiMissing,
  WikiRow,
  WikiShell,
  WikiSidebar,
  collate,
  useWikiData,
  useWikiPageMeta,
} from '../kit';
import type { SectionProps } from '../WikiPage';
import { LocationView } from './monsters/LocationView';
import { MapBox } from './monsters/MapBox';
import { MonsterCard } from './monsters/MonsterCard';
import {
  baseMonsters,
  buildModel,
  buildPools,
  itemSources,
  matchesItems,
  nameOf,
  sortMonsters,
  type Model,
  type Pools,
  type SortKey,
} from './monsters/model';
import { ItemCell, TypeBadge, waveText, type Ctx } from './monsters/parts';
import styles from './MonstersPage.module.css';

/**
 * Monsters and their drops — the partner wiki's largest tab.
 *
 * Three columns: the units the filters let through; the items they drop (pick
 * some to filter the units by them) above the room's map; and the open unit's
 * card, or a room's whole loot table.
 *
 * Addresses: `/wiki/monsters/<unitId>` and `/wiki/monsters/loc/<room>`. The
 * difficulty is `?diff=easy|normal|hard`, as the original kept it, so a link
 * carries the numbers it was read at. Every other filter is the reader's
 * working state and lives in the component — the original kept it out of the
 * URL too.
 */

const DEFAULT_DIFF: DifficultyKey = 'hard';
const DIFFS: readonly DifficultyKey[] = ['easy', 'normal', 'hard'];

export default function MonstersPage({ path }: SectionProps) {
  const { lang, core } = useApp();
  const t = useWikiStrings(MONSTERS);
  const search = useSearch();

  const { data, error } = useWikiData<[MonstersFile, MonstersLocale, LocationsFile]>([
    'monsters.json',
    'locale.{lang}.monsters.json',
    'locations.json',
  ]);
  const model = useMemo(
    () => (data === null || core === null ? null : buildModel(data[0], data[1], data[2], core, lang)),
    [data, core, lang],
  );

  const diffParam = new URLSearchParams(search).get('diff');
  const diff: DifficultyKey = DIFFS.includes(diffParam as DifficultyKey) ? (diffParam as DifficultyKey) : DEFAULT_DIFF;
  const difficulty = model?.difficulties.find((d) => d.key === diff);

  // --- the reader's working state
  const [q, setQ] = useState('');
  const [loc, setLoc] = useState('');
  const [type, setType] = useState<MonsterTypeGroup | ''>('');
  const [sort, setSort] = useState<SortKey>('level');
  const [picked, setPicked] = useState<string[]>([]);
  const [mode, setMode] = useState<'and' | 'or'>('and');
  const [itemQ, setItemQ] = useState('');
  const [noRecipes, setNoRecipes] = useState(false);
  const [guaranteed, setGuaranteed] = useState(false);
  const [zoneAll, setZoneAll] = useState(false);
  const [mapPick, setMapPick] = useState({ key: '', index: 0 });
  // The last unit opened, for the location view's way back.
  const lastMonster = useRef<string | null>(null);

  // A recipe is a blueprint: the index's type says so for every item that
  // `items.full.json` marks `isRecipe`, without loading the full table.
  const isRecipe = useCallback((id: string) => core?.byId.get(id)?.type === 'blueprint', [core]);

  // --- the address
  const isLoc = path[0] === 'loc';
  const roomCode = isLoc ? path[1] : undefined;
  const room = roomCode === undefined ? undefined : model?.rooms.get(roomCode);
  const roomListed = room !== undefined && model !== null && model.roomOptions.includes(room);
  const monsterId = !isLoc ? path[0] : undefined;
  const monster = monsterId === undefined ? undefined : model?.byId.get(monsterId);
  const missing =
    model !== null &&
    path.length > 0 &&
    (isLoc ? path.length !== 2 || !roomListed : path.length !== 1 || monster === undefined);
  if (monster !== undefined) lastMonster.current = monster.id;

  const facts = useMemo(() => {
    if (model === null) return null;
    if (monster !== undefined) {
      return monsterPageFacts(
        monsterFactsInput(monster, model.names, (code) => model.rooms.get(code)),
        lang,
      );
    }
    if (room !== undefined && roomListed) {
      return locationPageFacts(locationFactsInput(model.monsters, room.code, model.names, room), lang);
    }
    return null;
  }, [model, monster, room, roomListed, lang]);
  useWikiPageMeta('monsters', path, facts, missing);

  const href = useCallback(
    (...segments: string[]) => wikiPath('monsters', ...segments) + (diff === DEFAULT_DIFF ? '' : `?diff=${diff}`),
    [diff],
  );
  const setDiff = (key: DifficultyKey) => {
    const params = new URLSearchParams(window.location.search);
    params.set('diff', key);
    navigateTo(`${window.location.pathname}?${params.toString()}`, { replace: true });
  };

  const togglePick = useCallback(
    (id: string) => setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])),
    [],
  );

  // --- the filters' arithmetic, memoised by exactly what it reads
  const pools = useMemo(
    () => (model === null ? null : buildPools(model, diff, noRecipes, guaranteed, isRecipe)),
    [model, diff, noRecipes, guaranteed, isRecipe],
  );
  const base = useMemo(
    () => (model === null || pools === null ? [] : baseMonsters(model, pools, { q, loc, type, guaranteed })),
    [model, pools, q, loc, type, guaranteed],
  );
  const rows = useMemo(() => {
    if (model === null || pools === null) return [];
    const matched = base.filter((m) => matchesItems(pools.active.get(m.id) ?? [], picked, mode));
    return sortMonsters(model, pools, matched, sort, collate(lang));
  }, [model, pools, base, picked, mode, sort, lang]);

  if (error !== null) {
    return (
      <WikiShell columns="single">
        <WikiError message={error} />
      </WikiShell>
    );
  }
  if (model === null || pools === null || core === null) {
    return (
      <WikiShell columns="single">
        <WikiLoading />
      </WikiShell>
    );
  }

  const ctx: Ctx = { model, t, lang, picked, togglePick, href };
  const diffLabel = model.difficultyNames[diff] ?? diff;
  const zoneRoom = monster === undefined ? undefined : loc !== '' && monster.locations.includes(loc) ? loc : monster.locations[0];
  const mapKey = `${monster?.id ?? ''}|${roomCode ?? ''}|${loc}`;
  const mapIndex = mapPick.key === mapKey ? mapPick.index : 0;

  const filtersDirty =
    q !== '' || loc !== '' || type !== '' || sort !== 'level' || picked.length > 0 || itemQ !== '' || noRecipes || guaranteed;
  const reset = () => {
    // The difficulty and the AND/OR mode are preferences rather than filters,
    // so they survive a reset, as in the original.
    setQ('');
    setLoc('');
    setType('');
    setSort('level');
    setPicked([]);
    setItemQ('');
    setNoRecipes(false);
    setGuaranteed(false);
  };

  const onLoc = (code: string) => {
    setLoc(code);
    // The original closed the location view when the filter moved off it.
    if (isLoc) navigateTo(href());
  };

  return (
    <WikiShell columns="three">
      <WikiSidebar
        className={styles.sidebar}
        title={t.title}
        search={{ value: q, onChange: setQ, placeholder: t.searchMonster }}
        filters={
          <>
            <FilterGroup label={t.difficulty}>
              {model.difficulties.map((d) => (
                <Chip key={d.key} on={d.key === diff} onClick={() => setDiff(d.key)}>
                  {model.difficultyNames[d.key] ?? d.key}
                </Chip>
              ))}
            </FilterGroup>
            <div className={styles.locRow}>
              <Select value={loc} onChange={(e) => onLoc(e.target.value)} aria-label={t.location} title={t.location}>
                <option value="">{t.allLocations}</option>
                {model.roomOptions.map((r) => (
                  <option key={r.code} value={r.code}>
                    {t.locationOption(r.level, r.name, r.dlc)}
                  </option>
                ))}
              </Select>
              <Button
                variant="ghost"
                size="sm"
                disabled={loc === ''}
                title={t.allLootTitle}
                onClick={() => loc !== '' && navigateTo(href('loc', loc))}
              >
                {t.allLoot}
              </Button>
            </div>
            <FilterGroup label={t.type}>
              <Chip on={type === ''} onClick={() => setType('')}>
                {t.typeAll}
              </Chip>
              {MONSTER_TYPE_GROUPS.map((g) => (
                <Chip key={g} on={type === g} onClick={() => setType(type === g ? '' : g)}>
                  {t.typeFilter[g]}
                </Chip>
              ))}
            </FilterGroup>
            <label className={styles.sortRow}>
              <span>{t.sort}</span>
              <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                {(Object.keys(t.sorts) as SortKey[]).map((key) => (
                  <option key={key} value={key}>
                    {t.sorts[key]}
                  </option>
                ))}
              </Select>
            </label>
          </>
        }
        count={rows.length > 0 ? t.count(rows.length) : t.nothingFound}
        onReset={reset}
        resetDisabled={!filtersDirty}
      >
        <MonsterList ctx={ctx} pools={pools} rows={rows} selected={isLoc ? undefined : monster?.id} emptyAnd={picked.length > 0 && mode === 'and'} />
      </WikiSidebar>

      <div className={styles.middle}>
        <ItemsColumn
          ctx={ctx}
          pools={pools}
          base={base}
          q={itemQ}
          setQ={setItemQ}
          mode={mode}
          setMode={setMode}
          guaranteed={guaranteed}
          setGuaranteed={setGuaranteed}
          noRecipes={noRecipes}
          setNoRecipes={setNoRecipes}
          clearPicks={() => setPicked([])}
        />
        <MapBox
          ctx={ctx}
          monster={isLoc ? undefined : monster}
          room={roomListed ? room?.code : undefined}
          filterRoom={loc}
          index={mapIndex}
          onNext={() => setMapPick({ key: mapKey, index: mapIndex + 1 })}
        />
      </div>

      <div className={styles.detail}>
        {missing ? (
          <WikiMissing />
        ) : room !== undefined && roomListed ? (
          <LocationView
            ctx={ctx}
            room={room}
            pools={pools}
            difficulty={difficulty}
            noRecipes={noRecipes}
            isRecipe={isRecipe}
            backHref={lastMonster.current === null ? href() : href(lastMonster.current)}
          />
        ) : monster !== undefined ? (
          <MonsterCard
            ctx={ctx}
            m={monster}
            pools={pools}
            diff={diff}
            difficulty={difficulty}
            diffLabel={diffLabel}
            noRecipes={noRecipes}
            isRecipe={isRecipe}
            zoneAll={zoneAll}
            setZoneAll={setZoneAll}
            zoneRoom={zoneRoom}
          />
        ) : (
          <WikiEmpty />
        )}
      </div>
    </WikiShell>
  );
}

/** The left list. Keeps the open unit in view when it was opened from elsewhere — a link, a chip, a loot row. */
function MonsterList({
  ctx,
  pools,
  rows,
  selected,
  emptyAnd,
}: {
  ctx: Ctx;
  pools: Pools;
  rows: ReturnType<typeof sortMonsters>;
  selected: string | undefined;
  emptyAnd: boolean;
}) {
  const { model, t, lang } = ctx;
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (rows.length === 0) return <p className={styles.emptyList}>{emptyAnd ? t.emptyAnd : t.emptyTry}</p>;

  return (
    <div ref={box}>
      <WikiList>
        {rows.map((m) => {
          const bits = [m.id];
          if (m.level !== undefined) bits.push(t.rowLevel(m.level));
          const rooms = m.locations
            .map((code) => model.rooms.get(code))
            .filter((r) => r !== undefined)
            .map((r) => `${r.name} (${t.levelTag(r.level).toLowerCase()})`)
            .join(', ');
          if (rooms !== '') bits.push(rooms);
          const n = pools.ordinary.get(m.id)?.length ?? 0;
          if (n > 0) bits.push(t.rowItems(n));
          const hunts = model.hunters.get(m.id);
          return (
            <WikiRow
              key={m.id}
              href={ctx.href(m.id)}
              active={m.id === selected}
              title={nameOf(model, m.id)}
              meta={bits.join(' · ')}
              badge={
                <span className={styles.rowBadges}>
                  {hunts !== undefined && (
                    <span
                      className={styles.hunterMark}
                      title={
                        hunts.map(({ code, hunter }) => t.hunterLine(model.rooms.get(code)?.name ?? code, waveText(t, hunter, lang))).join('\n') +
                        `\n\n${t.hunterFooter}`
                      }
                      aria-label={t.hunter}
                    >
                      🎯
                    </span>
                  )}
                  <TypeBadge m={m} lang={lang} />
                </span>
              }
            />
          );
        })}
      </WikiList>
    </div>
  );
}

/** The middle column: the drop of the current selection, or every item that drops anywhere when searched. */
function ItemsColumn({
  ctx,
  pools,
  base,
  q,
  setQ,
  mode,
  setMode,
  guaranteed,
  setGuaranteed,
  noRecipes,
  setNoRecipes,
  clearPicks,
}: {
  ctx: Ctx;
  pools: Pools;
  base: Model['monsters'];
  q: string;
  setQ: (value: string) => void;
  mode: 'and' | 'or';
  setMode: (mode: 'and' | 'or') => void;
  guaranteed: boolean;
  setGuaranteed: (on: boolean) => void;
  noRecipes: boolean;
  setNoRecipes: (on: boolean) => void;
  clearPicks: () => void;
}) {
  const { model, t, lang, picked } = ctx;
  const { core } = useApp();

  // Both maps are a full walk of the pools, so each is kept until what it
  // reads changes: the whole table for a search, the selection otherwise.
  const all = useMemo(() => itemSources(model.monsters, pools), [model, pools]);
  const selection = useMemo(() => itemSources(base, pools), [base, pools]);

  const entries = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const source = needle === '' ? selection : all;
    const pickedSet = new Set(picked);
    const compare = collate(lang);
    const list = [...source.entries()]
      .map(([id, count]) => ({ id, count, item: core?.byId.get(id) }))
      .filter(({ id, item }) => needle === '' || id.toLowerCase().includes(needle) || (item?.name.toLowerCase().includes(needle) ?? false));
    // Picked first, then by item level as the catalogue orders them (no level
    // — runes, recipes — last), then rarity, then name.
    const level = (e: (typeof list)[number]) => (e.item === undefined || !(e.item.level > 0) ? Number.MAX_SAFE_INTEGER : e.item.level);
    return list.sort(
      (a, b) =>
        Number(pickedSet.has(b.id)) - Number(pickedSet.has(a.id)) ||
        level(a) - level(b) ||
        (b.item?.quality ?? 0) - (a.item?.quality ?? 0) ||
        compare(a.item?.name ?? a.id, b.item?.name ?? b.id),
    );
  }, [q, selection, all, picked, core, lang]);

  const searching = q.trim() !== '';
  const hint = searching ? t.foundAll(entries.length) : guaranteed ? t.guaranteedCount(entries.length) : t.selectionCount(entries.length);

  return (
    <WikiSidebar
      className={styles.itemsPanel}
      title={t.items}
      search={{ value: q, onChange: setQ, placeholder: t.searchItem }}
      filters={
        <>
          <div className={styles.modeRow}>
            <div className={styles.seg} role="group">
              <Chip on={mode === 'and'} onClick={() => setMode('and')} title={t.andTitle}>
                {t.and}
              </Chip>
              <Chip on={mode === 'or'} onClick={() => setMode('or')} title={t.orTitle}>
                {t.or}
              </Chip>
              <Chip on={guaranteed} onClick={() => setGuaranteed(!guaranteed)} title={t.guaranteedTitle}>
                {t.guaranteed}
              </Chip>
            </div>
            <Check checked={noRecipes} onChange={setNoRecipes} title={t.noRecipesTitle}>
              {t.noRecipes}
            </Check>
          </div>
          {picked.length > 0 && (
            <div className={styles.picks}>
              {picked.map((id) => (
                <span key={id} className={styles.pick}>
                  {core?.byId.get(id)?.name ?? id}
                  <button type="button" className={styles.pickX} onClick={() => ctx.togglePick(id)} title={t.removeFromFilter} aria-label={t.removeFromFilter}>
                    <Icon.Close size={12} />
                  </button>
                </span>
              ))}
              <button type="button" className={styles.pickClear} onClick={clearPicks}>
                {t.clearPicks}
              </button>
            </div>
          )}
        </>
      }
      count={picked.length > 0 ? t.inFilter(picked.length, hint) : hint}
    >
      {entries.length === 0 ? (
        <p className={styles.emptyList}>{searching ? t.noSuchItem : t.noDrop}</p>
      ) : (
        <ul className={styles.itemList}>
          {entries.map(({ id, count, item }) => (
            <li key={id} className={styles.itemRow}>
              <ItemRow id={id} count={count} level={item !== undefined && item.level > 0 ? item.level : undefined} ctx={ctx} />
            </li>
          ))}
        </ul>
      )}
    </WikiSidebar>
  );
}

function ItemRow({ id, count, level, ctx }: { id: string; count: number; level: number | undefined; ctx: Ctx }) {
  const { t } = ctx;
  return (
    <ItemCell id={id} ctx={ctx} sub={level === undefined ? id : `${id} · ${t.itemLevel(level)}`} value={t.sources(count)} />
  );
}
