import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clearsFor,
  progressionPageFacts,
  progressionPathOf,
  resolveProgressionPath,
  resourcePlan,
  shownTrees,
  totalCost,
  treeTitle,
  type HeroesWikiLocale,
  type ProgressionFile,
  type ProgressionLocale,
  type TalentNode,
} from './progression.ts';

const PUBLIC = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'public');
const read = <T>(rel: string): T => JSON.parse(readFileSync(join(PUBLIC, rel), 'utf8')) as T;

const prog = read<ProgressionFile>('data/wiki/progression.json');
const locale = (lang: string) => read<ProgressionLocale>(`data/wiki/locale.${lang}.progression.json`);
const heroesText = (lang: string) => read<HeroesWikiLocale>(`data/wiki/locale.${lang}.heroes-wiki.json`).heroes;

const node = (over: Partial<TalentNode>): TalentNode => ({
  id: 'T1', level: 1, col: 0, row: 0, needs: [], gold: 0, items: [], time: 0, stats: [], icon: 'x.png', ...over,
});

test('the section draws the tabs and the profession trees, never the orphan trees', () => {
  const ids = shownTrees(prog).map((t) => t.id);
  assert.deepEqual(ids.slice(0, prog.tabs.length), prog.tabs);
  for (const p of prog.professions) assert.ok(ids.includes(p.tree), p.tree);
  assert.ok(!ids.includes('tree11'));
  assert.ok(!ids.includes('tree20'));
});

test('addresses resolve the way the partner wiki read its fragments', () => {
  const bare = resolveProgressionPath(prog, []);
  assert.equal(bare?.kind, 'tree');
  assert.equal(bare?.tab, prog.tabs[0]);

  const tab = resolveProgressionPath(prog, ['tree3']);
  assert.equal(tab?.kind === 'tree' && tab.tree.id, 'tree3');

  const node = resolveProgressionPath(prog, ['tree1', 'T000']);
  assert.equal(node?.node?.id, 'T000');

  // A profession's tree opens on the heroes tab with that hero picked.
  const axe = prog.professions.find((p) => p.profession === 'axe')!;
  const viaTree = resolveProgressionPath(prog, [axe.tree]);
  assert.equal(viaTree?.kind === 'hero' && viaTree.hero.profession, 'axe');
  const someNode = prog.trees[axe.tree]!.nodes[3]!.id;
  const viaTreeNode = resolveProgressionPath(prog, [axe.tree, someNode]);
  assert.ok(viaTreeNode?.kind === 'hero');
  assert.deepEqual(progressionPathOf(viaTreeNode), ['heroes', 'axe', someNode]);
  assert.equal(resolveProgressionPath(prog, ['heroes', 'axe', someNode])?.node?.id, someNode);

  const heroes = resolveProgressionPath(prog, ['heroes']);
  assert.ok(heroes?.kind === 'hero' && heroes.tabOnly === true);
  assert.deepEqual(progressionPathOf(heroes), ['heroes']);

  for (const bad of [['tree11'], ['tree20'], ['tree99'], ['heroes', 'pudge'], ['tree1', 'T999999'], ['tree1', someNode], ['tree1', 'T000', 'x']]) {
    assert.equal(resolveProgressionPath(prog, bad), null, bad.join('/'));
  }
});

test('clears round up, and a resource that never drops takes none', () => {
  assert.equal(clearsFor(10, 3), 4);
  assert.equal(clearsFor(9, 3), 3);
  assert.equal(clearsFor(5, 0), null);
});

test('a resource plan hides what the room does not drop and counts it', () => {
  const cost = totalCost([
    node({ id: 'A', gold: 100, items: [['item_a', 2], ['item_b', 9]] }),
    node({ id: 'B', gold: 50, items: [['item_c', 4]] }),
  ]);
  const none = resourcePlan(cost, null);
  assert.deepEqual(none.items.map((r) => r.id), ['item_b', 'item_c', 'item_a']);
  assert.equal(none.skipped, 0);
  assert.equal(none.gold.clears, null);

  const farm = { gold: 40, items: new Map([['item_a', { avg: 0.5 }], ['item_c', { avg: 3 }]]) };
  const plan = resourcePlan(cost, farm);
  assert.deepEqual(plan.items.map((r) => [r.id, r.clears]), [['item_c', 2], ['item_a', 4]]);
  assert.equal(plan.skipped, 1);
  assert.deepEqual(plan.gold, { need: 150, perClear: 40, clears: 4 });
  assert.equal(resourcePlan(cost, { gold: 0, items: new Map() }).gold.clears, null);
});

test('every shown page has a title and facts in every language', () => {
  for (const lang of ['en', 'ru', 'zh'] as const) {
    const names = { locale: locale(lang), heroes: heroesText(lang), item: (id: string) => `<${id}>` };
    for (const tree of shownTrees(prog)) {
      assert.notEqual(treeTitle(prog, tree.id, names), tree.id, `${lang} ${tree.id}`);
      const view = resolveProgressionPath(prog, [tree.id])!;
      const facts = progressionPageFacts(prog, view, names, lang);
      assert.ok(facts.name && facts.facts && facts.description, `${lang} ${tree.id}`);
      const first = tree.nodes.find((n) => n.items.length > 0)!;
      const nodeFacts = progressionPageFacts(prog, resolveProgressionPath(prog, [tree.id, first.id])!, names, lang);
      assert.ok(nodeFacts.facts.includes(`<${first.items[0]![0]}>`), `${lang} ${first.id} names its price`);
    }
    const tab = progressionPageFacts(prog, resolveProgressionPath(prog, ['heroes'])!, names, lang);
    assert.equal(tab.name, names.locale.heroTab);
  }
});
