import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { ItemFull } from '../types/items.ts';
import {
  CRAFT_MAX_NODES,
  craftEconomy,
  craftFarm,
  craftGroupOf,
  craftInSeason,
  craftItemOf,
  craftMaterials,
  craftPageFacts,
  craftPricing,
  craftTree,
  dropSourceIndex,
  isCraftable,
  isFreeCraft,
  itemDropRooms,
  stoneLinks,
  type CraftEntry,
  type CraftFile,
  type CraftItem,
  type CraftNode,
} from './craft.ts';
import type { ItemsExtraFile } from './items-extra.ts';
import type { LocationsFile, MonstersFile } from './monsters.ts';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const craft = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/wiki/craft.json'), 'utf8')) as CraftFile;
const items = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/items.full.json'), 'utf8')) as Record<string, ItemFull>;

test('unlock per season and the free-craft test', () => {
  const entry: CraftEntry = { recipes: ['item_1M106'], bySeason: { s3: {} } };
  assert.deepEqual(craftInSeason(entry).recipes, ['item_1M106']);
  assert.equal(isFreeCraft(entry), false);
  assert.equal(isFreeCraft(entry, 's3'), true);
  assert.equal(isFreeCraft({ talents: [{ node: 'T201', tree: 'tree3' }] }), false);
});

test('the board is unlocked by its talent, and a recipe item crafts what it names', () => {
  assert.deepEqual(craft.items['item_M008']?.talents, [{ node: 'T201', tree: 'tree3' }]);
  for (const [id, entry] of Object.entries(craft.items)) {
    for (const recipe of entry.recipes ?? []) {
      assert.equal(items[recipe]?.produces, id, `${recipe} should produce ${id}`);
    }
  }
});

test('stone links invert upgradesFrom and produces', () => {
  const { fromStone, upgradedBy } = stoneLinks(Object.values(items));
  assert.equal(fromStone.get('item_0425'), 'item_s_0305');
  assert.equal(upgradedBy.get('item_0305'), 'item_s_0305');
  assert.ok(fromStone.size > 150);
});

// --- the planner ---------------------------------------------------------------

const extra = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/wiki/items-extra.json'), 'utf8')) as ItemsExtraFile;
const view = new Map<string, CraftItem>();
for (const full of Object.values(items)) view.set(full.id, craftItemOf(full, extra.seasonal[full.id]?.s2));
const lookup = (id: string) => view.get(id);

/** A tiny made-up table, for the arithmetic itself. */
function table(rows: CraftItem[]) {
  const map = new Map(rows.map((row) => [row.id, row]));
  return (id: string) => map.get(id);
}
const tiny = table([
  { id: 'ore', type: 'material', level: 1, quality: 1, cost: 10, needs: [] },
  { id: 'ingot', type: 'material', level: 1, quality: 1, cost: 50, needs: [{ id: 'ore', count: 3 }] },
  { id: 'hilt', type: 'equip', level: 1, quality: 1, cost: 100, needs: [{ id: 'ingot', count: 1 }, { id: 'ore', count: 2 }] },
  {
    id: 'sword',
    type: 'equip',
    level: 2,
    quality: 5,
    cost: 1000,
    needs: [{ id: 'hilt', count: 1 }, { id: 'ingot', count: 2 }, { id: 'ghost', count: 1 }],
    dismantle: { rule: 'x', outputs: [{ id: 'item_M315', count: 2 }, { id: 'item_M507', count: 4, chance: 25 }] },
  },
]);

test('the S2 patch replaces the recipe and the level', () => {
  const patched = view.get('item_0700');
  assert.equal(patched?.level, 6);
  assert.deepEqual(patched?.needs.map((n) => n.id), ['item_0436', 'item_0434', 'item_M426', 'item_M335']);
  assert.equal(craftGroupOf('special'), 'potion');
  assert.equal(craftGroupOf('stone'), undefined);
});

test('craft cost takes the exchange price, else the craft, else the game price', () => {
  const none = craftPricing(tiny, () => null);
  // ingot = 3 ore × 10; hilt = ingot 30 + 2 ore 20 = 50; sword = 50 + 2×30 (+ the ghost, unknown)
  assert.deepEqual(none.craftOf('ingot'), { value: 30, unknown: false });
  assert.deepEqual(none.craftOf('sword'), { value: 110, unknown: true });
  assert.equal(none.unitCost('ore'), 10);
  assert.equal(none.verdict('ingot'), null);

  const priced = craftPricing(tiny, (id) => (id === 'ingot' ? 20 : id === 'sword' ? 90 : null));
  assert.equal(priced.verdict('ingot'), 'buy');
  assert.equal(priced.craftOf('sword').value, 40 + 2 * 20);
  assert.equal(priced.verdict('sword'), 'craft');
});

test('the tree keeps materials shut unless asked, and then opens them one level', () => {
  const sword = tiny('sword')!;
  const shut = craftTree(sword, tiny, false);
  assert.deepEqual(shut.branches.map((b) => b.key), ['0', '1', '2']);
  assert.equal(shut.collapsedMats, 2); // the ingot inside the hilt, and the ingot beside it
  assert.equal(shut.branches[0]?.children[0]?.key, '0.0');
  assert.equal(shut.branches[0]?.children[0]?.collapsed, true);

  const open = craftTree(sword, tiny, true);
  assert.equal(open.collapsedMats, 0);
  assert.deepEqual(open.branches[1]?.children.map((c) => [c.id, c.count]), [['ore', 3]]);

  assert.deepEqual(craftMaterials(sword, tiny, false), [
    { id: 'ingot', count: 3 },
    { id: 'ore', count: 2 },
    { id: 'hilt', count: 1 },
  ]);
  assert.deepEqual(craftMaterials(sword, tiny, true)[0], { id: 'ore', count: 11 });
});

test('real trees stay inside their limits', () => {
  let count = 0;
  const walk = (node: CraftNode, depth: number): number => {
    count += 1;
    return Math.max(depth, ...node.children.map((c) => walk(c, depth + 1)));
  };
  for (const item of view.values()) {
    if (!isCraftable(item)) continue;
    count = 0;
    const tree = craftTree(item, lookup, true);
    const depth = Math.max(0, ...tree.branches.map((b) => walk(b, 1)));
    assert.ok(depth <= 5, item.id);
    assert.ok(count <= CRAFT_MAX_NODES, item.id);
  }
});

test('sell and dismantle: half the price, and the server rule priced per essence', () => {
  const eco = craftEconomy(tiny('sword')!, tiny, (id) => (id === 'item_M315' ? 8000 : 20000));
  assert.equal(eco.compValue, 100 + 100);
  assert.equal(eco.unknown, 1);
  assert.equal(eco.sellValue, 500);
  assert.equal(eco.essenceValue, 2 * 8000 + 4 * 0.25 * 20000);
  assert.equal(eco.profSell, false); // an unknown component makes the comparison meaningless

  const real = craftEconomy(view.get('item_0305')!, lookup, () => 1);
  assert.deepEqual(real.essences.map((e) => e.id), ['item_M507']);
});

test('drop sources on hard, and where to farm a craft', () => {
  const monsters = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/wiki/monsters.json'), 'utf8')) as MonstersFile;
  const locations = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/wiki/locations.json'), 'utf8')) as LocationsFile;
  const hard = monsters.difficulties.find((d) => d.key === 'hard');
  const index = dropSourceIndex(monsters.monsters, locations, hard);
  assert.ok(index.size > 100);
  const level = (room: string) => Number(room.slice(1)) || undefined;

  const ore = [...index.keys()].find((id) => (index.get(id)?.length ?? 0) > 2)!;
  const all = itemDropRooms(index, ore, level, null);
  assert.ok(all.length > 2);
  for (let i = 1; i < all.length; i++) assert.ok(all[i - 1]!.avg >= all[i]!.avg);
  assert.ok(itemDropRooms(index, ore, level, 1).every((s) => level(s.room)! <= 1));

  const farm = craftFarm(
    { id: 'x', type: 'equip', level: 10, quality: 1, cost: 0, needs: [{ id: ore, count: 2 }, { id: 'item_0700', count: 1 }] },
    index,
    lookup,
    level,
    null,
  );
  assert.ok(farm.rooms.length > 0);
  assert.equal(farm.rooms[0]?.score, all[0]!.avg / 2);
  assert.deepEqual(farm.craftOnly, index.has('item_0700') ? [] : ['item_0700']);
});

test('page facts read the same in every language', () => {
  const input = { name: 'Sword', level: 6, qualityName: 'Legendary', components: 4, craftCost: 12400, unlock: null };
  assert.deepEqual(craftPageFacts(input, 'en').facts, 'Lv. 6 · Legendary · 4 components · craft 12,400 gold');
  assert.match(craftPageFacts({ ...input, unlock: { kind: 'talent', name: 'T' } }, 'ru').description, /талантом «T»/);
  assert.match(craftPageFacts(input, 'ru').facts, /4 составляющие/);
  assert.match(craftPageFacts(input, 'zh').facts, /^6级/);
});
