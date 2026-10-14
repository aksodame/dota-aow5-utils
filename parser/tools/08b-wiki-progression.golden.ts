import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { DIRS } from './lib/paths.ts';
import { sortKeys } from './lib/writeJson.ts';
import { step, info, ok, warn } from './lib/log.ts';
import type { AbilityLocale } from '../../packages/aow5-shared/src/types/heroes.ts';
import {
  abilityText,
  heroStatsAtLevel,
  type HeroStatsFile,
  type HeroesWikiFile,
  type HeroesWikiLocale,
  type ProgressionFile,
  type ProgressionLocale,
} from '../../packages/aow5-shared/src/wiki/progression.ts';

/**
 * Golden check for step 08b: the partner wiki's snapshot (v1.507, Russian,
 * ruleset s2) against what 08b emitted, fact by fact.
 *
 * It does not fail the build — the snapshot is a third party's frozen copy and
 * the pak moves on — it prints every disagreement grouped by kind, so each one
 * can be put down to a pak change, a bug here, or the partner's curation.
 *
 *   node parser/tools/08b-wiki-progression.golden.ts [path/to/aow-wiki-site]
 */

const SITE = process.argv[2] ?? path.resolve(import.meta.dirname, '../../../aow-wiki-site'); // a clone beside this repo
const WIKI = path.join(DIRS.publicData, 'wiki');
const load = <T>(f: string): T => JSON.parse(fs.readFileSync(path.join(WIKI, f), 'utf8')) as T;
function partner(file: string): Record<string, any> {
  const window: { AOW?: Record<string, any> } = {};
  vm.runInNewContext(fs.readFileSync(path.join(SITE, 'data', file), 'utf8'), { window });
  return window.AOW!;
}

const prog = load<ProgressionFile>('progression.json');
const progRu = load<ProgressionLocale>('locale.ru.progression.json');
const heroes = load<HeroesWikiFile>('heroes-wiki.json');
const heroesRu = load<HeroesWikiLocale>('locale.ru.heroes-wiki.json');
const stats = load<HeroStatsFile>('herostats.json');
const builderRu = (JSON.parse(fs.readFileSync(path.join(DIRS.publicData, 'locale.ru.abilities.json'), 'utf8')) as {
  abilities: Record<string, AbilityLocale>;
}).abilities;

const P = partner('progression.js').progression;
const H = partner('heroes.js').heroes;
const S = partner('heroStats.js').heroStats;

/** kind → examples; the count is the length. */
const diffs = new Map<string, string[]>();
let compared = 0;
function eq(kind: string, where: string, ours: unknown, theirs: unknown): void {
  compared++;
  const a = JSON.stringify(sortKeys(ours ?? null)); // absent and null mean the same here
  const b = JSON.stringify(sortKeys(theirs ?? null));
  if (a === b) return;
  const list = diffs.get(kind) ?? [];
  list.push(`${where}: ours ${a?.slice(0, 120)} / partner ${b?.slice(0, 120)}`);
  diffs.set(kind, list);
}
/** Text compared modulo markup and line breaks: we emit plain text with `<br>` as a newline; the partner kept raw tags and spaces. */
const flat = (s: unknown): unknown => (typeof s === 'string' ? s.replace(/<[^>]+>/g, '').replace(/\s+/g, '').trim() : s);
const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
const num = (kind: string, where: string, ours: number, theirs: number): void =>
  near(ours, theirs) ? void compared++ : eq(kind, where, ours, theirs);

// --- progression ------------------------------------------------------------

step('golden · progression');
eq('tabs (set)', 'tabs', [...prog.tabs].sort(), P.tabs.map((t: any) => t.key).sort());
eq('tabs (order)', 'tabs', prog.tabs, P.tabs.map((t: any) => t.key));
eq('heroTab label', 'heroTab', progRu.heroTab, P.heroTab);
eq('tree ids', 'trees', Object.keys(prog.trees).sort(), Object.keys(P.trees).sort());
for (const [id, pt] of Object.entries<any>(P.trees)) {
  const t = prog.trees[id];
  if (!t) continue;
  eq('tree size', id, [t.nodes.length, t.cols, t.rows], [pt.nodes.length, pt.cols, pt.rows]);
  eq('tree hero', id, t.hero?.replace('npc_dota_hero_', ''), pt.hero?.id);
  if (pt.name !== id) eq('tree name (ru)', id, progRu.trees[id], pt.name);
  const byId = new Map(t.nodes.map((n) => [n.id, n]));
  for (const pn of pt.nodes) {
    const n = byId.get(pn.id);
    if (!n) {
      eq('node missing', `${id}/${pn.id}`, undefined, pn.id);
      continue;
    }
    const w = `${id}/${n.id}`;
    eq('node layout', w, [n.level, n.col, n.row, n.root === true], [pn.level, pn.col, pn.row, pn.isRoot]);
    eq('node needs', w, n.needs, pn.needs);
    eq('node cost', w, [n.gold, n.time, n.items], [pn.gold, pn.time, pn.items.map((i: any) => [i.id, i.count])]);
    eq('node stats', w, n.stats, pn.stats.map((s: any) => [s.key, s.value]));
    eq('stat label (ru, talent window)', w, n.stats.map(([k]) => progRu.stats[k]), pn.stats.map((s: any) => s.label));
    eq('stat label (ru, panel)', w, n.stats.map(([k]) => progRu.panel[k] ?? progRu.stats[k]), pn.stats.map((s: any) => s.label));
    eq('node unlocks', w, (n.unlocks ?? []).map(([k]) => k), pn.unlocks.map((u: any) => u.key));
    eq('node formulas/skills', w, [n.formulas ?? [], n.skills ?? []], [pn.formulas, pn.skills]);
    eq('node profession', w, n.profession ?? null, pn.profession);
    eq('node icon', w, n.icon, pn.iconFile?.replace(/^assets\/talents\//, ''));
    eq('node name (ru)', w, progRu.nodes[n.id]?.name, pn.name);
    eq('node desc (ru)', w, flat(progRu.nodes[n.id]?.desc), flat(pn.desc));
  }
}
for (const ph of P.heroes) {
  const p = prog.professions.find((x) => x.profession === ph.id);
  if (!p) {
    eq('profession missing', ph.id, undefined, ph.id);
    continue;
  }
  eq('profession tree', ph.id, p.tree, ph.tree);
  for (const pt of ph.tiers) {
    const t = p.tiers.find((x) => x.tier === pt.tier);
    const w = `${ph.id}#${pt.tier}`;
    if (!t) {
      eq('tier missing', w, undefined, pt.tier);
      continue;
    }
    eq('tier level/price', w, [t.heroLevel, t.items[0]], [pt.heroLevel, pt.item ? [pt.item.id, pt.item.count] : undefined]);
    eq('tier growth', w, ['str', 'agi', 'int'].map((k) => t.growth[k as 'str']), ['str', 'agi', 'int'].map((k) => pt.growth.find((g: any) => g.key === k)?.value ?? 0));
    eq('tier wearables', w, t.wearables, pt.wearables);
    eq('tier name (ru)', w, progRu.tiers[`${p.hero}_tier_${t.tier}`]?.name, pt.name);
  }
}

// --- heroes -----------------------------------------------------------------

step('golden · heroes');
eq('hero ids', 'heroes', heroes.heroes.map((h) => h.profession), H.heroes.map((h: any) => h.id));
for (const ph of H.heroes) {
  const h = heroes.heroes.find((x) => x.profession === ph.id);
  if (!h) continue;
  const t = heroesRu.heroes[h.id] ?? {};
  eq('hero name (ru)', ph.id, t.name, ph.name);
  eq('hero class (ru)', ph.id, t.role, ph.cls);
  eq('hero archetype (ru)', ph.id, t.archetype?.split(' · ').slice(1).join(' · '), ph.archetype);
  eq('hero desc (ru)', ph.id, t.desc, ph.desc);
  eq('hero abilities (set)', ph.id, h.abilities.map((a) => a.id).sort(), ph.abilities.map((a: any) => a.id).sort());
  for (const pa of ph.abilities) {
    const a = h.abilities.find((x) => x.id === pa.id);
    if (!a) continue;
    const w = `${ph.id}/${a.id}`;
    eq('ability slot', w, a.slot, pa.slot);
    eq('ability cd/mana', w, [a.cd ?? null, a.mana ?? null], [pa.cd, pa.mana]);
    eq('ability tags', w, a.tags, pa.tags);
    eq('ability differs', w, a.bySeason?.['s3'] !== undefined, pa.differs);
    eq('ability stub', w, a.stub === true, pa.stub);
    eq('ability unlock', w, a.unlock ? [a.unlock.tree, a.unlock.node] : null, pa.unlock ? [pa.unlock.tree, pa.unlock.node] : null);
    eq('ability runes', w, a.runes.map((r) => [r.base, r.rulesets?.join(',') ?? null, r.tiers.map((x) => x[0])]),
      pa.runes.map((r: any) => [r.base, r.ruleset, r.tiers.map((x: any) => x.id)]));
    const loc = abilityText(a.id, heroesRu, builderRu);
    eq('ability name (ru)', w, loc?.name, pa.name);
    eq('ability desc (ru)', w, flat(loc?.descPlain), flat(pa.desc));
  }
}

// --- hero stats -------------------------------------------------------------

step('golden · hero stats');
const PARTNER_ATTR: Record<string, string> = {
  hpPerStr: 'strength_health', regenPerStr: 'strength_health_regen', armorPerAgi: 'agility_armor',
  agiAsDecay: 'agility_attack_speed_decay', agiAsCap: 'agility_attack_speed_cap', manaPerInt: 'intelligence_mana',
  manaRegenPerInt: 'intelligence_mana_regen', intMrDecay: 'intelligence_magic_resistance_decay',
  intMrCap: 'intelligence_magic_resistance_cap', dmgPerPrimary: 'primary_attr_attack_damage',
  dmgPerUniversal: 'universal_attr_attack_damage',
};
for (const [k, v] of Object.entries<number>(S.attrBonus)) num('attrBonus', k, (stats.attrBonus as any)[PARTNER_ATTR[k]!], v);
eq('level', 'level', stats.level, S.level);
eq('common trees (set)', 'commonTrees', [...stats.commonTrees].sort(), S.commonTrees.map((t: any) => t.id).sort());
for (const [short, ph] of Object.entries<any>(S.heroes)) {
  const h = stats.heroes[short];
  if (!h) {
    eq('hero stats missing', short, undefined, short);
    continue;
  }
  eq('primary', short, h.primary, ph.primary);
  eq('kv', short, h.kv, ph.kv);
  eq('base/growth', short, [h.base, h.growth], [ph.base, ph.growth]);
  eq('tier growth', short, h.tiers.map((t) => [t.heroLevel, t.growth]), ph.tiers.map((t: any) => [t.heroLevel, t.growth]));
  eq('vanilla talents', short, h.vanillaTalents, ph.vanillaTalents);
  for (const t of ph.trees) {
    const ours = stats.treeStats[t.id] ?? {};
    for (const k of new Set([...Object.keys(ours), ...Object.keys(t.stats)]))
      num('tree stat totals', `${short}/${t.id}.${k}`, ours[k] ?? 0, t.stats[k] ?? 0);
    eq('tree node count', `${short}/${t.id}`, stats.treeNodes[t.id], t.nodes);
  }
  const lv = heroStatsAtLevel(stats, short, { trees: ph.trees.map((t: any) => t.id) })!;
  for (const a of ['str', 'agi', 'int'] as const) {
    num('level30 attrs', `${short}.${a}`, lv.attrs[a], ph.level30.attrs[a]);
    num('level30 pct', `${short}.${a}`, lv.pct[a], ph.level30.pct[a]);
  }
  for (const [k, d] of Object.entries<any>(ph.level30.derived)) {
    num('level30 derived', `${short}.${k}.flat`, (lv.derived as any)[k].flat, d.flat);
    num('level30 derived', `${short}.${k}.mult`, (lv.derived as any)[k].mult, d.mult);
  }
  for (const [k, v] of Object.entries<number>(ph.level30.totals)) num('level30 totals', `${short}.${k}`, (lv.totals as any)[k], v);
  for (const u of ph.level30.unused) num('level30 rest', `${short}.${u.key}`, lv.rest[u.key] ?? 0, u.value);
}

// --- report -----------------------------------------------------------------

step('golden · summary');
info(`${compared} facts compared`);
if (diffs.size === 0) ok('no differences');
for (const [kind, list] of [...diffs.entries()].sort((a, b) => b[1].length - a[1].length)) {
  warn(`${kind}: ${list.length}`);
  for (const ex of list.slice(0, Number(process.env.GOLDEN_EXAMPLES ?? 4))) info(`  ${ex}`);
}
