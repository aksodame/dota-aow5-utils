import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { heroIconUrl } from 'aow5-shared/data';
import {
  CURRENT_RULESET,
  PROGRESSION_HERO_TAB,
  inSeason,
  isShownRoom,
  locFarm,
  professionName,
  progressionPageFacts,
  resolveProgressionPath,
  resourcePlan,
  shownTrees,
  statLabel,
  totalCost,
  treeTitle,
  type Cost,
  type HeroesWikiLocale,
  type LocationFarm,
  type LocationsFile,
  type MonstersFile,
  type Profession,
  type ProgressionFile,
  type ProgressionLocale,
  type ProgressionNames,
  type ProgressionView,
  type TalentNode,
  type TalentTree,
} from 'aow5-shared/wiki';
import { Badge, Button, Panel, Select, Tooltip, cx } from '@/ui';
import { navigateTo, useSearch, wikiPath } from '@/router';
import { useApp } from '@/data/AppData';
import { useWikiStrings } from '../i18n';
import { COMMON } from '../i18n/common';
import { PROGRESSION } from '../i18n/progression';
import {
  Check,
  DataFooter,
  DataTable,
  DetailHeader,
  ItemGrid,
  ItemRef,
  Note,
  Tag,
  WikiDetail,
  WikiError,
  WikiLoading,
  WikiMissing,
  WikiShell,
  WikiSubTabs,
  collate,
  day,
  duration,
  num,
  useWikiData,
  useWikiPageMeta,
} from '../kit';
import type { SectionProps } from '../WikiPage';
import styles from './ProgressionPage.module.css';

/**
 * Progression: the game's talent window, one sub-tab per tree in the game's
 * order plus the profession tab, where a hero is picked and his tree and
 * profession tiers are shown.
 *
 * Addresses: `/wiki/progression/<tree>`, `/wiki/progression/heroes/<hero>`,
 * and either with `/<node>` after it for a deep-linked node, which is lit and
 * scrolled to. `?farm=<room>` picks the farming location, kept in the URL the
 * way the partner wiki kept it, so a "how many clears" link can be shared.
 *
 * Clicking a node marks it as learned: it greys out and leaves the resource
 * sums below the tree. The marks are the reader's own — a static wiki has no
 * account to keep them in — so they live in `localStorage`, as does the list
 * of professions the reader does not level.
 */
export default function ProgressionPage({ path }: SectionProps) {
  const { lang, core } = useApp();
  const t = useWikiStrings(PROGRESSION);

  const { data, error } = useWikiData<[ProgressionFile, ProgressionLocale, HeroesWikiLocale]>([
    'progression.json',
    'locale.{lang}.progression.json',
    'locale.{lang}.heroes-wiki.json',
  ]);
  // The monsters are only for the location filter, so they arrive on their
  // own and never hold the tree back.
  const monsters = useWikiData<[MonstersFile]>(['monsters.json']).data?.[0] ?? null;

  const search = useSearch();
  const farmParam = new URLSearchParams(search).get('farm') ?? '';

  // Rooms a monster lives in, by displayed level and then name: the only
  // rooms a clear count means anything for. Hidden rooms (`HIDDEN_ROOMS` in
  // the shared monsters module) are not offered — a farm count there is not a
  // thing a reader can act on.
  const rooms = useMemo(() => {
    if (monsters === null || core === null) return [];
    const inhabited = new Set(monsters.monsters.flatMap((m) => m.locations));
    const byName = collate(lang);
    return core.maps.maps
      .filter((room) => inhabited.has(room.id) && isShownRoom(room.id))
      .sort((a, b) => a.tier - b.tier || byName(a.name, b.name));
  }, [monsters, core, lang]);
  // Trusted before the monsters arrive when the builder knows the room, so the
  // spawn table can start loading at once.
  const room = (monsters === null ? core?.maps.byId.has(farmParam) : rooms.some((r) => r.id === farmParam)) ? farmParam : '';

  const locations = useWikiData<[LocationsFile]>(room === '' ? [] : ['locations.json']).data?.[0] ?? null;
  const farm = useMemo<LocationFarm | null>(() => {
    if (room === '' || monsters === null || locations === null) return null;
    // The difficulty the monsters section opens on, as the partner wiki did.
    const hard = monsters.difficulties.find((d) => d.key === 'hard');
    return locFarm(monsters.monsters, locations, room, hard);
  }, [room, monsters, locations]);

  const learnedRaw = useStoredList(LEARNED_KEY);
  const heroesOffRaw = useStoredList(HEROES_OFF_KEY);

  const file = data?.[0] ?? null;
  const view = file === null ? undefined : resolveProgressionPath(file, path);
  const missing = view === null;

  const names = useMemo<ProgressionNames | null>(
    () =>
      data === null
        ? null
        : { locale: data[1], heroes: data[2].heroes, item: (id: string) => core?.byId.get(id)?.name },
    [data, core],
  );

  const facts = useMemo(
    () => (file === null || names === null || view == null || path.length === 0 ? null : progressionPageFacts(file, view, names, lang)),
    // `view` is derived from `file` and `path`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [file, names, path.join('/'), lang],
  );
  useWikiPageMeta('progression', path, facts, missing);

  // Marks from an older build whose node ids are gone are dropped here, as the
  // partner wiki dropped them on load.
  const allIds = useMemo(
    () => new Set(file === null ? [] : Object.values(file.trees).flatMap((tree) => tree.nodes.map((n) => n.id))),
    [file],
  );
  const learned = useMemo(() => new Set(learnedRaw.filter((id) => allIds.has(id))), [learnedRaw, allIds]);
  const heroesOff = useMemo(
    () => new Set(heroesOffRaw.filter((id) => file?.professions.some((p) => p.profession === id))),
    [heroesOffRaw, file],
  );

  const toggleNode = useCallback(
    (id: string) => {
      const next = new Set(learned);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeStoredList(LEARNED_KEY, [...next]);
    },
    [learned],
  );

  if (error !== null) {
    return (
      <WikiShell columns="single">
        <WikiError message={error} />
      </WikiShell>
    );
  }
  if (file === null || names === null || data === null || view === undefined) {
    return (
      <WikiShell columns="single">
        <WikiLoading />
      </WikiShell>
    );
  }

  /** A link inside the section, carrying the chosen location along. */
  const href = (...segments: string[]) => wikiPath('progression', ...segments) + (room === '' ? '' : `?farm=${room}`);

  const setRoom = (next: string) => {
    const params = new URLSearchParams(window.location.search);
    if (next === '') params.delete('farm');
    else params.set('farm', next);
    const query = params.toString();
    navigateTo(`${window.location.pathname}${query === '' ? '' : `?${query}`}`, { replace: true });
  };

  const tabs = [
    ...file.tabs.map((id) => ({ key: id, label: treeTitle(file, id, names), href: href(id) })),
    { key: PROGRESSION_HERO_TAB, label: data[1].heroTab, href: href(PROGRESSION_HERO_TAB) },
  ];
  const activeTab = view === null ? '' : view.tab;
  const activeHero = view !== null && view.kind === 'hero' ? view.hero : null;

  return (
    <WikiShell columns="wide">
      <WikiDetail className={styles.root}>
        <Panel className={styles.top}>
          <WikiSubTabs items={tabs} active={activeTab} label={t.tabsLabel} />
          {activeHero !== null && (
            <WikiSubTabs
              label={t.heroesLabel}
              active={activeHero.profession}
              items={file.professions.map((p) => ({
                key: p.profession,
                label: professionName(p, names),
                href: href(PROGRESSION_HERO_TAB, p.profession),
                ...(p.seasons.includes(file.season) ? {} : { badge: p.seasons.join('/').toUpperCase() }),
              }))}
            />
          )}
          <div className={styles.bar}>
            <p className={styles.hint}>{t.barHint}</p>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t.farmLabel}</span>
              <Select className={styles.select} value={room} onChange={(event) => setRoom(event.target.value)}>
                <option value="">{t.allLocations}</option>
                {/* Until the monsters arrive, the linked room is the only one known. */}
                {room !== '' && rooms.length === 0 && <option value={room}>{core?.maps.byId.get(room)?.name ?? room}</option>}
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {t.roomOption(r.tier, r.name)}
                  </option>
                ))}
              </Select>
            </label>
            <Button variant="ghost" size="sm" disabled={learned.size === 0} onClick={() => writeStoredList(LEARNED_KEY, [])}>
              {t.resetMarks}
            </Button>
          </div>
        </Panel>

        {missing ? (
          <WikiMissing />
        ) : (
          <TabBody
            file={file}
            names={names}
            view={view}
            learned={learned}
            heroesOff={heroesOff}
            onToggle={toggleNode}
            farm={farm}
            roomName={room === '' ? null : (core?.maps.byId.get(room)?.name ?? room)}
            farmPending={room !== '' && farm === null}
          />
        )}
      </WikiDetail>
    </WikiShell>
  );
}

// ---------------------------------------------------------------------------
// What the reader has marked, kept in the browser.

const LEARNED_KEY = 'aow5.wiki.progression.off';
const HEROES_OFF_KEY = 'aow5.wiki.progression.heroes-off';

const EMPTY: readonly string[] = [];
const lists = new Map<string, readonly string[]>();
const listeners = new Set<() => void>();

function readList(key: string): readonly string[] {
  let found = lists.get(key);
  if (found === undefined) {
    found = EMPTY;
    try {
      const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]');
      if (Array.isArray(parsed)) found = parsed.filter((x): x is string => typeof x === 'string');
    } catch {
      // Blocked storage or junk: start with nothing marked.
    }
    lists.set(key, found);
  }
  return found;
}

/** Sorted, so the stored value reads sensibly in devtools, as the partner kept it. */
function writeStoredList(key: string, ids: string[]): void {
  const next = [...new Set(ids)].sort();
  lists.set(key, next);
  try {
    if (next.length === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Kept for this visit only.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab marking nodes is the same reader.
  const onStorage = (event: StorageEvent) => {
    if (event.key === LEARNED_KEY || event.key === HEROES_OFF_KEY) {
      lists.delete(event.key);
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function useStoredList(key: string): readonly string[] {
  return useSyncExternalStore(
    subscribe,
    () => readList(key),
    () => EMPTY,
  );
}

// ---------------------------------------------------------------------------
// One tab's body: the header, the tree, the tiers, the resources.

interface BodyProps {
  file: ProgressionFile;
  names: ProgressionNames;
  view: ProgressionView;
  learned: ReadonlySet<string>;
  heroesOff: ReadonlySet<string>;
  onToggle: (id: string) => void;
  farm: LocationFarm | null;
  roomName: string | null;
  farmPending: boolean;
}

function TabBody({ file, names, view, learned, heroesOff, onToggle, farm, roomName, farmPending }: BodyProps) {
  const { lang, core } = useApp();
  const t = useWikiStrings(PROGRESSION);
  const common = useWikiStrings(COMMON);
  const tree = view.tree;
  const hero = view.kind === 'hero' ? view.hero : null;
  const heroText = hero === null ? undefined : names.heroes[hero.hero];
  const heroInSeason = hero === null || hero.seasons.includes(file.season);

  const treeCost = tree === undefined ? totalCost([]) : totalCost(tree.nodes, learned);
  const learnedHere = tree === undefined ? 0 : tree.nodes.length - treeCost.nodes;

  // The all-trees line: every tree the game shows in the wiki's season, less
  // the professions the reader says they do not level.
  const all = useMemo(() => {
    const seasonal = shownTrees(file).filter((tr) => {
      const owner = file.professions.find((p) => p.tree === tr.id);
      return inSeason(tr, file.season) && (owner === undefined || owner.seasons.includes(file.season));
    });
    const skip = new Set(file.professions.filter((p) => heroesOff.has(p.profession)).map((p) => p.tree));
    const counted = seasonal.filter((tr) => !skip.has(tr.id));
    return {
      cost: totalCost(
        counted.flatMap((tr) => tr.nodes),
        learned,
      ),
      totalNodes: counted.reduce((n, tr) => n + tr.nodes.length, 0),
      counted: counted.length,
      seasonal: seasonal.length,
      skip,
      skippedHeroes: file.professions.filter((p) => heroesOff.has(p.profession) && seasonal.some((tr) => tr.id === p.tree)),
    };
  }, [file, heroesOff, learned]);

  const title =
    hero !== null ? professionName(hero, names) : tree !== undefined ? treeTitle(file, tree.id, names) : t.noData;
  const portrait = hero === null ? undefined : core?.heroes.byHero.get(hero.hero as never);
  const sub =
    tree === undefined
      ? undefined
      : [
          tree.id,
          t.nodes(num(tree.nodes.length, lang)),
          ...(heroText?.role !== undefined ? [heroText.role] : []),
          ...(learnedHere > 0 ? [t.learned(num(learnedHere, lang))] : []),
        ].join(' · ');

  const units = common.units;
  const time = (seconds: number) => duration(seconds, lang, units);

  return (
    <>
      <DetailHeader
        icon={portrait !== undefined ? <img className={styles.portrait} src={heroIconUrl(portrait.icon)} alt="" /> : undefined}
        title={title}
        {...(sub !== undefined ? { code: sub } : {})}
        tags={
          hero !== null ? (
            <>
              {/* The profession id is the heroes section's short id too. */}
              <Tag href={wikiPath('heroes', hero.profession)}>{t.heroPage}</Tag>
              {tree !== undefined && <Tag>{treeTitle(file, tree.id, names)}</Tag>}
              {heroText?.archetype !== undefined && <Tag>{heroText.archetype}</Tag>}
              {!heroInSeason && <Tag tone="warn">{common.onlyIn(hero.seasons.join('/').toUpperCase())}</Tag>}
            </>
          ) : undefined
        }
        actions={
          hero !== null ? (
            heroInSeason ? (
              <Check
                checked={!heroesOff.has(hero.profession)}
                title={t.calcCheckTitle}
                onChange={(on) => {
                  const next = new Set(heroesOff);
                  if (on) next.delete(hero.profession);
                  else next.add(hero.profession);
                  writeStoredList(HEROES_OFF_KEY, [...next]);
                }}
              >
                {t.calcCheck}
              </Check>
            ) : (
              <span className={styles.offSeason}>{t.notInSeason(file.season.toUpperCase())}</span>
            )
          ) : undefined
        }
      />

      {heroText?.desc !== undefined && <Note>{heroText.desc}</Note>}

      {tree === undefined ? (
        <Note>{t.noTree}</Note>
      ) : (
        <>
          <TreeView
            tree={tree}
            names={names}
            learned={learned}
            focus={view.node?.id ?? null}
            onToggle={onToggle}
            label={t.treeLabel(treeTitle(file, tree.id, names))}
          />
          <Note>{t.treeNote}</Note>
          {view.node !== undefined && (
            <Panel title={t.linked} className={styles.linked}>
              <NodeCard node={view.node} tree={tree} names={names} learned={learned.has(view.node.id)} />
            </Panel>
          )}
        </>
      )}

      {hero !== null && hero.tiers.length > 0 && <Tiers hero={hero} file={file} names={names} />}

      <ResourceBlock
        title={tree === undefined ? t.branchTitleBare : t.branchTitle(treeTitle(file, tree.id, names))}
        sub={
          tree === undefined
            ? null
            : `${t.inCalc(num(treeCost.nodes, lang), num(tree.nodes.length, lang))} · ${t.timeLine(time(treeCost.time))}`
        }
        cost={treeCost}
        farm={farm}
        pending={farmPending}
      />
      <ResourceBlock
        title={t.allTitle}
        sub={[
          t.inCalc(num(all.cost.nodes, lang), num(all.totalNodes, lang)),
          ...(all.skip.size > 0 ? [t.treesInCalc(num(all.counted, lang), num(all.seasonal, lang))] : []),
          t.timeLine(time(all.cost.time)),
        ].join(' · ')}
        cost={all.cost}
        farm={farm}
        pending={farmPending}
      />
      {all.skippedHeroes.length > 0 && (
        <Note>{t.skippedProfessions(all.skippedHeroes.map((p) => professionName(p, names)).join(', '))}</Note>
      )}
      {tree !== undefined && all.skip.has(tree.id) && <Note>{t.branchOff}</Note>}
      <Note>
        {roomName !== null ? t.locNote(roomName) : t.noLocNote}
        {t.costSource}
      </Note>
      <DataFooter ruleset={CURRENT_RULESET.toUpperCase()} built={day(file.generatedAt, lang)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// The tree

/** The partner wiki's grid, in its own pixels: node size, cell pitch, padding. */
const NODE = 54;
const PITCH = 78;
const PAD = 18;

const at = (cell: number) => PAD + cell * PITCH;

/**
 * The tree on its grid.
 *
 * Positions are in the partner's pixels multiplied by `--u` (one pixel on a
 * desktop, less on a phone), so a phone gets the same picture smaller rather
 * than a different layout. The links are one SVG in the same units under the
 * nodes; an edge to a node outside this tree (`T105`, which `tree20` hangs
 * from) has nowhere to go and is not drawn. The box scrolls sideways on its
 * own, so a 36-column tree never widens the page.
 */
function TreeView({
  tree,
  names,
  learned,
  focus,
  onToggle,
  label,
}: {
  tree: TalentTree;
  names: ProgressionNames;
  learned: ReadonlySet<string>;
  focus: string | null;
  onToggle: (id: string) => void;
  label: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const width = PAD * 2 + (tree.cols - 1) * PITCH + NODE;
  const height = PAD * 2 + (tree.rows - 1) * PITCH + NODE;

  const edges = useMemo(() => {
    const byId = new Map(tree.nodes.map((n) => [n.id, n]));
    const main: string[] = [];
    const extra: string[] = [];
    for (const n of tree.nodes) {
      n.needs.forEach((needId, index) => {
        const p = byId.get(needId);
        if (p === undefined) return;
        const x1 = at(p.col) + NODE;
        const y1 = at(p.row) + NODE / 2;
        const x2 = at(n.col);
        const y2 = at(n.row) + NODE / 2;
        const mid = Math.round((x1 + x2) / 2);
        const d = y1 === y2 ? `M${x1} ${y1}H${x2}` : `M${x1} ${y1}H${mid}V${y2}H${x2}`;
        (index === 0 ? main : extra).push(d);
      });
    }
    return { main: main.join(''), extra: extra.join('') };
  }, [tree]);

  // Brought into view once per arrival on a node by link — not on every
  // render, or marking another node would yank the tree back to this one.
  useEffect(() => {
    const box = scroller.current;
    if (focus === null || box === null) return;
    const node = box.querySelector<HTMLElement>(`[data-node="${focus}"]`);
    if (node === null) return;
    const left = node.offsetLeft + node.offsetWidth / 2 - box.clientWidth / 2;
    const top = node.offsetTop + node.offsetHeight / 2 - box.clientHeight / 2;
    box.scrollTo({ left: Math.max(0, left), top: Math.max(0, top), behavior: 'smooth' });
  }, [focus, tree.id]);

  return (
    <Panel flush className={styles.treePanel}>
      <div ref={scroller} className={styles.scroller} role="group" aria-label={label} tabIndex={-1}>
        <div className={styles.canvas} style={{ width: u(width), height: u(height) }}>
          <svg className={styles.edges} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
            <path className={styles.edgeExtra} d={edges.extra} />
            <path className={styles.edgeMain} d={edges.main} />
          </svg>
          {tree.nodes.map((n) => (
            <NodeButton
              key={n.id}
              node={n}
              tree={tree}
              names={names}
              learned={learned}
              focused={n.id === focus}
              onToggle={onToggle}
            />
          ))}
        </div>
      </div>
    </Panel>
  );
}

/** A length in the partner's pixels, scaled by the box's `--u`. */
const u = (px: number) => `calc(var(--u) * ${px})`;

function NodeButton({
  node,
  tree,
  names,
  learned,
  focused,
  onToggle,
}: {
  node: TalentNode;
  tree: TalentTree;
  names: ProgressionNames;
  learned: ReadonlySet<string>;
  focused: boolean;
  onToggle: (id: string) => void;
}) {
  const t = useWikiStrings(PROGRESSION);
  const off = learned.has(node.id);
  const name = names.locale.nodes[node.id]?.name ?? node.id;
  return (
    <Tooltip
      content={
        <>
          <NodeCard node={node} tree={tree} names={names} learned={off} />
          <span className={styles.tipHint}>{off ? t.clickOff : t.clickOn}</span>
        </>
      }
    >
      <button
        type="button"
        data-node={node.id}
        className={cx(
          styles.node,
          node.level === 2 && styles.lvl2,
          node.level >= 3 && styles.lvl3,
          off && styles.nodeOff,
          focused && styles.nodeFocus,
        )}
        style={{ left: u(at(node.col)), top: u(at(node.row)) }}
        aria-pressed={off}
        aria-label={`${name} (${node.id})`}
        onClick={() => onToggle(node.id)}
      >
        <img className={styles.nodeIcon} src={talentIcon(node.icon)} alt="" loading="lazy" decoding="async" />
        {node.root === true && (
          <span className={styles.star} aria-hidden="true">
            ★
          </span>
        )}
      </button>
    </Tooltip>
  );
}

const talentIcon = (file: string) => `${import.meta.env.BASE_URL}icons/talents/${file}`;

/**
 * Everything the partner's node tooltip said, laid out: name and id, level,
 * stats, account unlocks, blueprints, abilities, price, time and what it needs.
 */
function NodeCard({ node, tree, names, learned }: { node: TalentNode; tree: TalentTree; names: ProgressionNames; learned: boolean }) {
  const { lang, core } = useApp();
  const t = useWikiStrings(PROGRESSION);
  const text = names.locale.nodes[node.id];
  const label = (key: string) => names.locale.stats[key] ?? names.locale.panel[key];

  const stats = node.stats.map(([key, value]) => {
    const raw = label(key);
    const { text: name, percent } = raw === undefined ? { text: key, percent: false } : statLabel(raw);
    return `${name}: ${value >= 0 ? '+' : ''}${num(value, lang)}${percent ? '%' : ''}`;
  });
  // A key the game has no label for (`npc_3`, `shop_level`) is said in words by
  // the node's own description, so that is shown instead.
  const unlocks = (node.unlocks ?? []).map(([key, value]) => {
    const raw = label(key);
    return raw === undefined ? null : `${statLabel(raw).text}${value !== 1 ? ` +${num(value, lang)}` : ''}`;
  });
  const showDesc = text?.desc !== undefined && (unlocks.includes(null) || (stats.length === 0 && unlocks.length === 0));
  const inTree = new Map(tree.nodes.map((n) => [n.id, n]));

  return (
    <span className={styles.card}>
      <span className={styles.cardHead}>
        <img className={styles.cardIcon} src={talentIcon(node.icon)} alt="" />
        <span className={styles.cardTitle}>
          <strong>{text?.name ?? node.id}</strong>
          <code className={styles.cardId}>{node.id}</code>
        </span>
        {learned && <Badge small>{t.learnedBadge}</Badge>}
      </span>
      <span className={styles.cardLine}>{t.nodeLevel(node.level)}</span>
      {stats.map((line, i) => (
        <span key={`s${i}`} className={styles.cardStat}>
          {line}
        </span>
      ))}
      {unlocks.map((line, i) =>
        line === null ? null : (
          <span key={`u${i}`} className={styles.cardStat}>
            {line}
          </span>
        ),
      )}
      {showDesc && <span className={styles.cardDesc}>{text?.desc}</span>}
      {(node.formulas ?? []).map((id) => (
        <span key={id} className={styles.cardLine}>
          {t.blueprint}: {core?.byId.get(id)?.name ?? id}
        </span>
      ))}
      {(node.skills ?? []).map((id) => (
        <span key={id} className={styles.cardLine}>
          {t.skill}: {core?.heroes.spells.get(id as never)?.name ?? id}
        </span>
      ))}
      {(node.gold > 0 || node.items.length > 0) && (
        <span className={styles.cardLine}>
          {t.cost}:{' '}
          {[
            ...(node.gold > 0 ? [`${t.goldWord} ${num(node.gold, lang)}`] : []),
            ...node.items.map(([id, count]) => `${core?.byId.get(id)?.name ?? id} ×${num(count, lang)}`),
          ].join(', ')}
        </span>
      )}
      {node.time > 0 && <span className={styles.cardLine}>{t.researchTime(num(node.time, lang))}</span>}
      {node.needs.length > 0 && (
        <span className={styles.cardLine}>
          {t.needs}:{' '}
          {node.needs
            .map((id) => {
              const need = names.locale.nodes[id]?.name;
              return need === undefined || !inTree.has(id) ? id : `${need} (${id})`;
            })
            .join(', ')}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Profession tiers

function Tiers({ hero, file, names }: { hero: Profession; file: ProgressionFile; names: ProgressionNames }) {
  const { lang } = useApp();
  const t = useWikiStrings(PROGRESSION);
  const common = useWikiStrings(COMMON);
  const growth = (g: Profession['tiers'][number]['growth']) =>
    (['str', 'agi', 'int'] as const)
      .filter((key) => g[key] !== 0)
      .map((key) => `${t.attrs[key]} ${num(g[key], lang)}`)
      .join(', ');

  return (
    <Panel title={t.tiersTitle(hero.tiers.length)}>
      <DataTable
        compact
        head={[t.tierCol, t.nameCol, t.heroLevelCol, t.unlockCol, t.growthCol, t.rewardCol]}
        numeric={[2]}
        rows={hero.tiers.map((tier) => {
          const name = names.locale.tiers[`${hero.hero}_tier_${tier.tier}`]?.name;
          const seasonal = tier.seasons !== undefined && !inSeason(tier, file.season);
          return [
            <span key="tier" className={styles.tierCell}>
              {t.tier(tier.tier)}
              {seasonal && <Badge small>{common.onlyIn((tier.seasons ?? []).join('/').toUpperCase())}</Badge>}
            </span>,
            name ?? '—',
            num(tier.heroLevel, lang),
            tier.items.length === 0 ? (
              '—'
            ) : (
              <span key="items" className={styles.tierItems}>
                {tier.items.map(([id, count]) => (
                  <ItemRef key={id} id={id} count={num(count, lang)} size="sm" />
                ))}
              </span>
            ),
            growth(tier.growth) || '—',
            tier.wearables.length > 0 ? t.cosmetics(tier.wearables.length) : '—',
          ];
        })}
      />
      <Note>{t.tiersNote}</Note>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Resources

function ResourceBlock({
  title,
  sub,
  cost,
  farm,
  pending,
}: {
  title: string;
  sub: string | null;
  cost: Cost;
  farm: LocationFarm | null;
  /** A room is chosen but its spawn table is still on the way. */
  pending: boolean;
}) {
  const { lang } = useApp();
  const t = useWikiStrings(PROGRESSION);
  const plan = useMemo(() => resourcePlan(cost, farm), [cost, farm]);
  const clears = (n: number | null): ReactNode =>
    n === null ? null : <span className={styles.clears}>{t.clears(n, num(n, lang))}</span>;

  return (
    <Panel title={title} action={sub === null ? undefined : <span className={styles.sub}>{sub}</span>}>
      <div className={styles.res}>
        <div className={styles.gold}>
          <span className={styles.goldLabel}>{t.gold}</span>
          <span className={styles.goldValue}>{num(plan.gold.need, lang)}</span>
          {farm !== null &&
            (plan.gold.perClear > 0 ? (
              <>
                <span className={styles.per}>{t.perClear(num(plan.gold.perClear, lang, 0))}</span>
                {clears(plan.gold.clears)}
              </>
            ) : (
              <span className={styles.per}>{t.noGoldHere}</span>
            ))}
        </div>
        {pending ? (
          <WikiLoading />
        ) : plan.items.length === 0 ? (
          <Note>{farm !== null ? t.noneDropHere : t.noneNeeded}</Note>
        ) : (
          <ItemGrid dense>
            {plan.items.map((r) => (
              <ItemRef
                key={r.id}
                id={r.id}
                count={num(r.count, lang)}
                extra={
                  <>
                    <code className={styles.code}>{r.id}</code>
                    {farm !== null && r.perClear > 0 && (
                      <>
                        {' · '}
                        {t.perClearItem(num(r.perClear, lang))} · {clears(r.clears)}
                      </>
                    )}
                  </>
                }
              />
            ))}
          </ItemGrid>
        )}
        {plan.skipped > 0 && <Note>{t.skipped(plan.skipped)}</Note>}
      </div>
    </Panel>
  );
}
