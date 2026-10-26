import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  abilityText,
  agilityAttackSpeed,
  formulaNodes,
  heroPrimarySeason,
  heroStatsAtLevel,
  intelligenceMagicResistance,
  nodeForSeason,
  statLabel,
  sumStats,
  talentIconFile,
  totalCost,
  type HeroStatsFile,
  type HeroesWikiFile,
  type HeroesWikiLocale,
  type ProgressionFile,
  type ProgressionLocale,
  type TalentNode,
} from './progression.ts';

const PUBLIC = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'public');
const read = <T>(rel: string): T => JSON.parse(readFileSync(join(PUBLIC, rel), 'utf8')) as T;

const prog = read<ProgressionFile>('data/wiki/progression.json');
const heroes = read<HeroesWikiFile>('data/wiki/heroes-wiki.json');
const stats = read<HeroStatsFile>('data/wiki/herostats.json');

const node = (over: Partial<TalentNode>): TalentNode => ({
  id: 'T1', level: 1, col: 0, row: 0, needs: [], gold: 0, items: [], time: 0, stats: [], icon: 'x.png', ...over,
});

test('talent icon names are filesystem-safe and stable', () => {
  assert.equal(talentIconFile('tree_ (20)'), 'tree__20.png');
  assert.equal(talentIconFile('knight_psd'), 'knight_psd.png');
});

test('a leading % marks a percentage stat label', () => {
  assert.deepEqual(statLabel('%Damage Resistance'), { text: 'Damage Resistance', percent: true });
  assert.deepEqual(statLabel('Armor'), { text: 'Armor', percent: false });
});

test('the saturation curves are x / (x + decay) * cap', () => {
  const b = stats.attrBonus;
  assert.equal(agilityAttackSpeed(0, b), 0);
  assert.equal(agilityAttackSpeed(-5, b), 0);
  assert.equal(agilityAttackSpeed(500, b), b.agility_attack_speed_cap / 2);
  assert.equal(intelligenceMagicResistance(500, b), b.intelligence_magic_resistance_cap / 2);
});

test('totalCost sums gold, time and items and skips researched nodes', () => {
  const nodes = [
    node({ id: 'A', gold: 50, time: 5, items: [['item_M006', 2]] }),
    node({ id: 'B', gold: 80, time: 5, items: [['item_M006', 3], ['item_M011', 1]] }),
  ];
  const all = totalCost(nodes);
  assert.equal(all.gold, 130);
  assert.equal(all.time, 10);
  assert.deepEqual([...all.items], [['item_M006', 5], ['item_M011', 1]]);
  assert.equal(totalCost(nodes, new Set(['B'])).gold, 50);
});

test('sumStats rounds away float dust', () => {
  assert.deepEqual(sumStats([node({ stats: [['mana_regen', 0.1]] }), node({ stats: [['mana_regen', 0.2]] })]), {
    mana_regen: 0.3,
  });
});

test('a season override replaces only the fields it names', () => {
  const t600 = prog.trees['tree7']!.nodes.find((n) => n.id === 'T600')!;
  assert.ok(t600.bySeason?.['s1']?.items, 'T600 is priced differently in s1');
  const s1 = nodeForSeason(t600, 's1');
  assert.notDeepEqual(s1.items, t600.items);
  assert.deepEqual(s1.stats, t600.stats);
  assert.equal(nodeForSeason(t600, 's2'), t600);
});

test('the emitted trees are self-consistent', () => {
  const ids = new Set(Object.values(prog.trees).flatMap((t) => t.nodes.map((n) => n.id)));
  for (const t of Object.values(prog.trees)) {
    for (const n of t.nodes) {
      for (const need of n.needs) assert.ok(ids.has(need), `${n.id} needs unknown ${need}`);
      assert.ok(n.col < t.cols && n.row < t.rows, `${n.id} inside its grid`);
      assert.ok(existsSync(join(PUBLIC, 'icons', 'talents', n.icon)), `icon ${n.icon}`);
    }
  }
  for (const tab of prog.tabs) assert.ok(prog.trees[tab], tab);
  for (const p of prog.professions) assert.equal(prog.trees[p.tree]?.hero, p.hero);
  assert.ok(formulaNodes(prog).size > 0);
});

test('every hero ability icon the file names exists', () => {
  for (const h of heroes.heroes)
    for (const a of h.abilities) if (a.icon) assert.ok(existsSync(join(PUBLIC, 'icons', a.icon)), a.icon);
});

test('a hero who skips the primary season is described in his own', () => {
  const dk = heroes.heroes.find((h) => h.short === 'dragon_knight');
  assert.ok(dk);
  assert.equal(heroPrimarySeason(dk, heroes), dk.seasons[0]);
  const axe = heroes.heroes.find((h) => h.short === 'axe')!;
  assert.equal(heroPrimarySeason(axe, heroes), heroes.season);
});

test('ability text prefers the season, then the wiki, then the builder', () => {
  const wiki: HeroesWikiLocale = {
    schema: 1, lang: 'en', heroes: {},
    abilities: { a: { name: 'wiki' } },
    bySeason: { s3: { a: { name: 'wiki s3' } } },
  };
  const builder = { a: { name: 'builder' }, b: { name: 'builder b' } };
  assert.equal(abilityText('a', wiki, builder)?.name, 'wiki');
  assert.equal(abilityText('a', wiki, builder, 's3')?.name, 'wiki s3');
  assert.equal(abilityText('b', wiki, builder, 's3')?.name, 'builder b');
});

test('every stat key in the trees has a label in every language, bar the known gap', () => {
  const keys = new Set(Object.values(prog.trees).flatMap((t) => t.nodes.flatMap((n) => n.stats.map(([k]) => k))));
  for (const lang of ['en', 'ru', 'zh']) {
    const loc = read<ProgressionLocale>(`data/wiki/locale.${lang}.progression.json`);
    // talent_slot_unlock_count has no token in the pak at all.
    const missing = [...keys].filter((k) => loc.stats[k] === undefined && loc.panel[k] === undefined);
    assert.deepEqual(missing, ['talent_slot_unlock_count'], lang);
  }
});

/*
 * Axe at level 30 with his tree and the five stat-bearing tab trees, in the
 * season the wiki describes (S3). The partner's v1.507 pin was the S2 view;
 * S3's common tree adds T1500–T1512 and its profession tiers grow differently,
 * so the numbers below are the S3 ones — a change here means the model or the
 * data moved again.
 */
test('heroStatsAtLevel reproduces the level-30 panel', () => {
  const lv = heroStatsAtLevel(stats, 'axe', { trees: ['tree4', 'tree1', 'tree2', 'tree9', 'tree10', 'tree13'] })!;
  const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≈ ${b}`);
  close(lv.buckets.str, 367.1);
  assert.equal(lv.pct.str, 24);
  close(lv.attrs.str, 455.204);
  close(lv.derived.bonus_health.flat, 1374.6);
  close(lv.derived.bonus_health.mult, 1.16);
  close(lv.totals.bonus_health, 4542.81984);
  close(lv.totals.attack_speed, 320.24828206040405);
  close(lv.totals.bonus_movespeed, 276.04);
  assert.equal(lv.rest['bonus_exp_pct'], 120);
  assert.equal(heroStatsAtLevel(stats, 'nobody'), undefined);
});

test('the default full progression takes the season’s trees, not the S2-only tower', () => {
  // The build gates tree13 to S2; the wiki describes S3, so "every tree taken"
  // is the hero's own tree plus the four common ones the window shows.
  assert.ok(!stats.commonTrees.includes('tree13'));
  assert.deepEqual(stats.commonTrees, ['tree1', 'tree2', 'tree10', 'tree9']);
  const lv = heroStatsAtLevel(stats, 'axe')!;
  assert.deepEqual(lv, heroStatsAtLevel(stats, 'axe', { trees: ['tree4', 'tree1', 'tree2', 'tree9', 'tree10'] }));
  // The S3 panel without items, as the calculator's base column shows it.
  assert.ok(Math.abs(lv.totals.bonus_health - 4412.3407) < 1e-3, `${lv.totals.bonus_health}`);
  assert.ok(Math.abs(lv.totals.attack_speed - 316.550228945647) < 1e-6, `${lv.totals.attack_speed}`);
});
