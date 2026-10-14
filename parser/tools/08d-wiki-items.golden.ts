import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { DIRS } from './lib/paths.ts';
import { info, ok, step, warn } from './lib/log.ts';
import type { PoolsFile } from '../../packages/aow5-shared/src/wiki/pools.ts';
import type { ItemsExtraFile, ItemsExtraLocale } from '../../packages/aow5-shared/src/wiki/items-extra.ts';
import type { CraftFile } from '../../packages/aow5-shared/src/wiki/craft.ts';
import type { ItemFull } from '../../packages/aow5-shared/src/types/items.ts';
import { sourceFileOf } from '../../packages/aow5-shared/src/wiki/items-extra.ts';

/**
 * Golden check for step 08d against the partner wiki's snapshot (v1.507, s2,
 * built 2026-10-13): `data/items.js`, `pools.js`, `craft.js`, `stones.js`.
 *
 * Not a gate — the pak has moved on since the snapshot, and the partner
 * hand-curated some fields — so every difference is printed with a count and
 * samples, for a human to classify. Run after 08d:
 *
 *   node parser/tools/08d-wiki-items.golden.ts [path/to/aow-wiki-site]
 */

const SITE = process.argv[2] ?? path.resolve(import.meta.dirname, '../../../aow-wiki-site'); // a clone beside this repo
step('08d golden · partner snapshot vs our output');

function partner<T>(file: string, key: string): T {
  const w: { AOW: Record<string, unknown> } = { AOW: {} };
  vm.runInNewContext(fs.readFileSync(path.join(SITE, 'data', `${file}.js`), 'utf8'), { window: w });
  return w.AOW[key] as T;
}

const WIKI = path.join(DIRS.publicData, 'wiki');
const read = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8')) as T;
const pools = read<PoolsFile>(path.join(WIKI, 'pools.json'));
const extra = read<ItemsExtraFile>(path.join(WIKI, 'items-extra.json'));
const craft = read<CraftFile>(path.join(WIKI, 'craft.json'));
const ru = read<ItemsExtraLocale>(path.join(WIKI, 'locale.ru.items-extra.json'));
const ruPools = read<{ names: Record<string, string> }>(path.join(WIKI, 'locale.ru.pools.json'));
const full = read<Record<string, ItemFull>>(path.join(DIRS.publicData, 'items.full.json'));

/** Collects mismatches under a label and prints them as one line plus samples. */
const tallies = new Map<string, string[]>();
const diff = (label: string, sample: string): void => {
  const list = tallies.get(label) ?? [];
  list.push(sample);
  tallies.set(label, list);
};
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The S2 view of an items.full record: the base values with the seasonal patch applied. */
function s2(id: string): { level?: number; cost?: number; quality?: number; needs: [string, number][]; values: Record<string, unknown>; cooldown?: number } {
  const f = full[id];
  const patch = extra.seasonal[id]?.s2 ?? {};
  return {
    level: patch.level ?? f?.level,
    cost: patch.cost ?? f?.cost,
    quality: patch.quality ?? f?.quality,
    needs: patch.needs ?? (f?.needs ?? []).map((n) => [n.id, n.count] as [string, number]),
    values: patch.values ?? f?.values ?? {},
    cooldown: patch.cooldown ?? f?.ability?.cooldown,
  };
}

// === pools ===================================================================

interface PPool {
  id: string;
  level: number;
  entries: { id: string; weight: number }[];
  raw?: Record<string, string>;
}
const pPools = partner<Record<string, PPool>>('pools', 'pools');
for (const [id, p] of Object.entries(pPools)) {
  const ours = pools.pools[id];
  if (ours === undefined) {
    diff('pool missing from ours', id);
    continue;
  }
  if (ours.level !== p.level) diff('pool level', `${id}: ${p.level} -> ${ours.level}`);
  // The partner left some pools unparsed (`raw`, empty `entries`); compare those too.
  const theirs: [string, number][] = p.entries.length > 0
    ? p.entries.map((e) => [e.id, e.weight])
    : Object.values(p.raw ?? {}).map((s) => [s.slice(0, s.lastIndexOf(':')), Number(s.slice(s.lastIndexOf(':') + 1))]);
  if (!same(theirs, ours.entries)) {
    const a = new Map(theirs);
    const b = new Map(ours.entries);
    const changed = [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k));
    diff(p.entries.length > 0 ? 'pool entries' : 'pool entries (partner raw only)', `${id}: ${changed.length} rows, e.g. ${changed.slice(0, 3).map((k) => `${k} ${a.get(k)}->${b.get(k)}`).join(', ')}`);
  }
}
for (const id of Object.keys(pools.pools)) if (pPools[id] === undefined) diff('pool only in ours', id);

// === items ===================================================================

interface PItem {
  id: string;
  src: string;
  type: string | null;
  quality: number;
  cost: number | null;
  level: number | null;
  sellable: boolean;
  sellableAncient: boolean;
  exchangeInventory: number;
  precious: boolean;
  isSoul: boolean;
  inGame: boolean;
  isRecipe: boolean;
  crafts: string | null;
  cd: number | null;
  useMax: number | null;
  subclass: string | null;
  charges: number | null;
  timeCost: number | null;
  neutral: boolean;
  ruleset: string | null;
  needs: { id: string; weight: number }[];
  stats: { key: string; value: number }[];
  name: string;
  poolId?: string;
  poolName?: string;
  itemChance?: number;
  gold?: { min: number; max: number };
  chest?: { chestId: string; towerId: string; tower: string; level: number; difficulty: string | null; temporary?: boolean; count: number; base: number; poolId: string };
  soulSkill?: { source: string; title: string; bossUnit: string; window: number; segments: number; aim: string; cast: number; pointRange: number; cooldownBase: number; cooldownCdrPct: number; cooldownMaxUpgrade: number; cooldownMin: number };
  talent?: { node: string; tree: string };
  gem?: { profession: string | null; kind: string; target: string | null; data: { key: string; value: number }[] };
}
const pItems = partner<Record<string, PItem>>('items', 'items');

const SEASON_OF: Record<string, number> = { s1: 1, s2: 2, s3: 3 };
for (const [id, p] of Object.entries(pItems)) {
  if (p.src === 'ak_items_wearable') {
    const w = extra.wearables[id];
    if (w === undefined) diff('wearable missing', id);
    else {
      if (w.quality !== p.quality) diff('wearable quality', `${id}: ${p.quality} -> ${w.quality}`);
      if (ru.wearables[id] !== p.name) diff('wearable ru name', `${id}: «${p.name}» -> «${ru.wearables[id]}»`);
    }
    continue;
  }
  const f = full[id];
  if (f === undefined) {
    diff('item missing from items.full', id);
    continue;
  }
  const e = extra.items[id] ?? {};
  const v = s2(id);

  const src = sourceFileOf(extra, id);
  if (src !== p.src) diff('src', `${id}: ${p.src} -> ${src}`);
  if ((e.sellableAncient === true) !== p.sellableAncient) diff('sellableAncient', `${id}: ${p.sellableAncient}`);
  if ((e.exchangeInventory ?? 0) !== p.exchangeInventory) diff('exchangeInventory', `${id}: ${p.exchangeInventory} -> ${e.exchangeInventory ?? 0}`);
  if ((f.subclass === 'precious') !== p.precious) diff('precious (subclass)', `${id}`);
  if ((f.subclass ?? null) !== p.subclass) diff('subclass', `${id}: ${p.subclass} -> ${f.subclass}`);
  if ((e.useMax ?? null) !== p.useMax) diff('useMax', `${id}: ${p.useMax} -> ${e.useMax}`);
  if ((f.timeCost ?? null) !== p.timeCost) diff('timeCost', `${id}: ${p.timeCost} -> ${f.timeCost}`);
  if ((f.isSoul === true) !== p.isSoul) diff('isSoul', id);
  if ((f.isNeutral === true) !== p.neutral) diff('neutral', id);
  if ((f.flags.inGame === 1) !== p.inGame) diff('inGame', id);
  if ((f.isRecipe === true) !== p.isRecipe) diff('isRecipe', id);
  if ((f.produces ?? null) !== p.crafts) diff('crafts/produces', `${id}: ${p.crafts} -> ${f.produces}`);
  if ((v.cooldown ?? null) !== p.cd) diff('cd (s2)', `${id}: ${p.cd} -> ${v.cooldown}`);
  if ((f.initialCharges ?? null) !== p.charges) diff('charges', `${id}: ${p.charges} -> ${f.initialCharges}`);
  if (p.level !== null && v.level !== p.level) diff('level (s2)', `${id}: ${p.level} -> ${v.level}`);
  if (p.cost !== null && v.cost !== p.cost) diff('cost (s2)', `${id}: ${p.cost} -> ${v.cost}`);
  if (v.quality !== p.quality) diff('quality (s2)', `${id}: ${p.quality} -> ${v.quality}`);
  if (p.type !== null && f.type !== p.type) diff('type', `${id}: ${p.type} -> ${f.type}`);
  const theirRuleset = p.ruleset === null ? undefined : p.ruleset.split(/[\s,|]+/).map((r) => SEASON_OF[r]).sort();
  if (!same(theirRuleset, f.seasons)) diff('ruleset/seasons', `${id}: ${p.ruleset} -> ${JSON.stringify(f.seasons)}`);
  const theirNeeds = p.needs.map((n) => [n.id, n.weight]);
  if (!same(theirNeeds, v.needs)) diff('needs (s2)', `${id}: ${JSON.stringify(theirNeeds)} -> ${JSON.stringify(v.needs)}`);
  const theirStats = Object.fromEntries(p.stats.map((s) => [s.key, s.value]));
  if (!same(Object.keys(theirStats).sort(), Object.keys(v.values).sort())) {
    diff('stat keys (s2)', `${id}: ${Object.keys(theirStats).filter((k) => !(k in v.values)).join(',')} | ${Object.keys(v.values).filter((k) => !(k in theirStats)).join(',')}`);
  } else if (!same(Object.keys(theirStats).sort().map((k) => theirStats[k]), Object.keys(v.values).sort().map((k) => v.values[k]))) {
    diff('stat values (s2)', id);
  }

  // containers
  const c = e.container;
  if ((p.poolId !== undefined && p.chest === undefined) || c !== undefined) {
    if (c === undefined) diff('container missing', `${id} -> ${p.poolId}`);
    else {
      if (c.pool !== p.poolId) diff('container pool', `${id}: ${p.poolId} -> ${c.pool}`);
      if ((p.itemChance ?? 100) !== c.chance) diff('container chance', `${id}: ${p.itemChance} -> ${c.chance}`);
      const gold = p.gold ? [p.gold.min, p.gold.max] : undefined;
      if (!same(gold, c.gold)) diff('container gold', `${id}: ${JSON.stringify(gold)} -> ${JSON.stringify(c.gold)}`);
      if (p.poolName !== undefined && ruPools.names[c.pool] !== p.poolName) diff('pool ru name', `${c.pool}: «${p.poolName}» -> «${ruPools.names[c.pool]}»`);
    }
  }

  // magic-tower chests
  if (p.chest !== undefined) {
    const ref = e.chest;
    const chest = ref ? extra.chests[ref.chest] : undefined;
    if (ref === undefined || chest === undefined) diff('chest missing', id);
    else {
      if (ref.chest !== p.chest.chestId) diff('chest id', `${id}: ${p.chest.chestId} -> ${ref.chest}`);
      // The partner calls the forest tower `forest` (from the chest id); the table says `dark_forest`.
      if (chest.tower !== p.chest.towerId) diff('chest tower id', `${id}: ${p.chest.towerId} -> ${chest.tower}`);
      if (chest.level !== p.chest.level) diff('chest level', id);
      if (chest.pool !== p.chest.poolId) diff('chest pool', id);
      if (chest.count !== p.chest.base) diff('chest base count', `${id}: ${p.chest.base} -> ${chest.count}`);
      const variant = p.chest.temporary ? 'temporary' : p.chest.difficulty;
      if (ref.variant !== variant) diff('chest variant', `${id}: ${variant} -> ${ref.variant}`);
      if (ru.towers[chest.tower] !== p.chest.tower) diff('tower ru name', `${chest.tower}: «${p.chest.tower}» -> «${ru.towers[chest.tower]}»`);
    }
  }

  // life souls
  if (p.soulSkill !== undefined) {
    const soul = e.soul;
    const skill = soul ? extra.soulSkills[soul.source] : undefined;
    if (soul === undefined || skill === undefined) diff('soul missing', id);
    else {
      const s = p.soulSkill;
      const pairs: [string, unknown, unknown][] = [
        ['source', s.source, soul.source],
        ['bossUnit', s.bossUnit, skill.bossUnit],
        ['window', s.window, skill.window],
        ['segments', s.segments, skill.segments],
        ['aim', s.aim, skill.aim],
        ['cast', s.cast, skill.cast],
        ['pointRange', s.pointRange, skill.pointRange],
        ['cooldownBase', s.cooldownBase, soul.cooldown],
        ['cooldownCdrPct', s.cooldownCdrPct, soul.cdrPct],
        ['cooldownMaxUpgrade', s.cooldownMaxUpgrade, soul.maxUpgrade],
        ['cooldownMin', s.cooldownMin, Math.round(soul.cooldown * (1 - soul.cdrPct / 100) ** soul.maxUpgrade)],
      ];
      for (const [k, a, b] of pairs) if (a !== b) diff(`soul ${k}`, `${id}: ${String(a)} -> ${String(b)}`);
      const name = ru.soulSkills[soul.source]?.name;
      if (name !== s.title) diff('soul skill ru name', `${soul.source}: «${s.title}» -> «${name}»`);
    }
  }

  // talent
  const unlock = craft.items[id];
  const talent = unlock?.talents?.[0];
  if (!same(p.talent ?? null, talent ? { node: talent.node, tree: talent.tree } : null)) {
    diff('talent', `${id}: ${JSON.stringify(p.talent)} -> ${JSON.stringify(unlock?.talents)}`);
  }

  // glyphs
  if (p.gem !== undefined) {
    if ((p.gem.target ?? undefined) !== e.gemTarget) diff('gem target', `${id}: ${p.gem.target} -> ${e.gemTarget}`);
    const theirData = Object.fromEntries(p.gem.data.map((d) => [d.key, d.value]));
    const ourData = extra.seasonal[id]?.s2?.gemData ?? e.gemData ?? {};
    if (!same(Object.entries(theirData).sort(), Object.entries(ourData).sort())) diff('gem data (s2)', `${id}: ${JSON.stringify(theirData)} -> ${JSON.stringify(ourData)}`);
    if ((p.gem.profession ?? undefined) !== f.professions?.allowed?.join(',')) diff('gem profession', `${id}: ${p.gem.profession} -> ${f.professions?.allowed}`);
    if (p.gem.kind !== f.gem?.kind) diff('gem kind', `${id}: ${p.gem.kind} -> ${f.gem?.kind}`);
  }
}
for (const id of Object.keys(full)) {
  if (pItems[id] === undefined) diff('item only in ours', id);
}

// === craft ===================================================================

interface PCraft {
  essenceOf: Record<string, { id: string; count: number }>;
  items: { id: string; recipe: string | null; talent?: { node: string; tree: string }; noFormula: boolean }[];
  prices: { id: string; cost: number }[];
}
const pCraft = partner<PCraft>('craft', 'craft');
const pCraftIds = new Set(pCraft.items.map((c) => c.id));
for (const c of pCraft.items) {
  const ours = craft.items[c.id];
  if (ours === undefined) {
    diff('craft item missing', c.id);
    continue;
  }
  const recipe = ours.recipes?.[0] ?? null;
  if (recipe !== c.recipe) diff('craft recipe', `${c.id}: ${c.recipe} -> ${JSON.stringify(ours.recipes)}`);
  const noFormula = (ours.recipes?.length ?? 0) === 0 && (ours.talents?.length ?? 0) === 0;
  if (noFormula !== c.noFormula) diff('craft noFormula', `${c.id}: ${c.noFormula} -> ${noFormula}`);
}
for (const [id, entry] of Object.entries(craft.items)) {
  if (pCraftIds.has(id)) continue;
  const needs = s2(id).needs.length;
  diff(needs > 0 ? 'craft only in ours (has Needs)' : 'craft only in ours (recipe/talent but no Needs)', id);
  void entry;
}
for (const [id, e] of Object.entries(pCraft.essenceOf)) {
  const d = full[id]?.dismantle;
  const first = d?.outputs[0];
  if (first === undefined) diff('essenceOf: we have no dismantle', id);
  else if (first.id !== e.id || first.count !== e.count) diff('essenceOf vs dismantle', `${id}: ${e.id}×${e.count} -> ${first.id}×${first.count} (${d!.rule})`);
}
for (const p of pCraft.prices) if (full[p.id]?.cost !== p.cost) diff('essence price', `${p.id}: ${p.cost} -> ${full[p.id]?.cost}`);

// === stones ==================================================================

interface PStone { id: string; oldItem: string; newItem: string; quality: number; cost: number; drops: { boss: number; wave: number; weight: number }[] }
const pStones = partner<Record<string, PStone>>('stones', 'stones');
for (const s of Object.values(pStones)) {
  const f = full[s.id];
  if (f === undefined) {
    diff('stone missing', s.id);
    continue;
  }
  if (f.upgradesFrom !== s.oldItem) diff('stone oldItem', `${s.id}: ${s.oldItem} -> ${f.upgradesFrom}`);
  if (f.produces !== s.newItem) diff('stone newItem', `${s.id}: ${s.newItem} -> ${f.produces}`);
  if (f.quality !== s.quality || f.cost !== s.cost) diff('stone quality/cost', s.id);
  const theirs = s.drops.map((d) => [d.boss, d.weight]);
  const ours = (f.sources ?? []).filter((x) => x.kind === 'boss_reward').map((x) => [x.level, x.weight]);
  if (!same(theirs, ours)) diff('stone boss drops', `${s.id}: ${JSON.stringify(theirs)} -> ${JSON.stringify(ours)}`);
  const waves = s.drops.filter((d) => d.wave !== d.boss * 3);
  if (waves.length > 0) diff('stone wave != boss×3', s.id);
}

// === report ==================================================================

if (tallies.size === 0) ok('no differences');
for (const [label, list] of [...tallies].sort((a, b) => b[1].length - a[1].length)) {
  warn(`${label}: ${list.length}`);
  for (const sample of list.slice(0, 4)) info(`      ${sample}`);
}
