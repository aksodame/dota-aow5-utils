import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { ItemFull } from '../types/items.ts';
import type { CraftFile } from './craft.ts';
import { applySeasonalPatch, type ItemsExtraFile } from './items-extra.ts';
import {
  craftUnlockOf,
  endlessAppearances,
  itemDropIndex,
  rewardChestTiers,
  soulMultiplierRules,
  vendorOffersOf,
} from './item-page.ts';
import type { Monster, MonstersFile } from './monsters.ts';
import type { PoolsFile } from './pools.ts';
import type { VendorsFile } from './vendors.ts';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const read = <T>(rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', rel), 'utf8')) as T;
const items = read<Record<string, ItemFull>>('items.full.json');
const vendors = read<VendorsFile>('wiki/vendors.json');
const pools = read<PoolsFile>('wiki/pools.json');
const craft = read<CraftFile>('wiki/craft.json');
const extra = read<ItemsExtraFile>('wiki/items-extra.json');

function monster(id: string, patch: Partial<Monster>): Monster {
  return {
    id,
    source: 'ak_monster',
    type: 'monster_normal',
    locations: [],
    consideredHero: false,
    dropRatePct: 100,
    dropMin: 1,
    dropMax: 1,
    pool: [],
    poolHard: [],
    poolFirst: [],
    ...patch,
  };
}

const file: MonstersFile = {
  schema: 1,
  generatedAt: '',
  ruleset: 's2',
  groups: {},
  difficulties: [
    { key: 'normal', dropCountBonusPct: 0, difficultyBonusPct: 0 },
    { key: 'hard', dropCountBonusPct: 0, difficultyBonusPct: 0 },
  ],
  monsters: [
    monster('a', {
      pool: [
        ['item_x', 1],
        ['item_r', 2],
        ['item_y', 1],
      ],
      poolHard: [['item_x', 2]],
      poolFirst: [
        ['item_r', 1],
        ['item_x', 3],
      ],
    }),
    monster('b', { dropRatePct: 50, pool: [['item_x', 1]] }),
  ],
};

test('drop index: recipes out of the ordinary pool, in on their own; hard merges', () => {
  const index = itemDropIndex(file, (id) => id === 'item_r');
  // Hard: x weighs 1 + 2 = 3 of a non-recipe total of 4.
  assert.deepEqual(index.drops.get('item_x'), [
    { monster: 'a', chance: 0.75 },
    { monster: 'b', chance: 0.5 },
  ]);
  // The recipe counts against the whole pool: 2 of 6.
  const recipe = index.recipes.get('item_r');
  assert.equal(recipe?.length, 1);
  assert.ok(Math.abs(recipe![0]!.chance - 2 / 6) < 1e-12);
  assert.equal(index.drops.has('item_r'), false);
  assert.deepEqual(index.first.get('item_x'), [{ monster: 'a', chance: 0.75 }]);
  // Memoised per file and difficulty.
  assert.equal(itemDropIndex(file, () => false), index);
  assert.notEqual(itemDropIndex(file, (id) => id === 'item_r', 'normal'), index);
});

test('drop index: a season reads that season\'s pools', () => {
  /*
   * A monster's pool can be season-specific — the S3 bosses drop runes no base
   * table names — and the item card's sources must be the same season as its
   * numbers. Asked for s3, the index reads `bySeason.s3`; asked for nothing,
   * it keeps the file's own (base) pools.
   */
  const seasonal: MonstersFile = {
    ...file,
    monsters: [
      monster('a', {
        pool: [['item_base', 1]],
        bySeason: { s3: { pool: [['item_s3', 1]] } },
      }),
    ],
  };

  const s3 = itemDropIndex(seasonal, () => false, 'hard', 's3');
  assert.deepEqual(s3.drops.get('item_s3'), [{ monster: 'a', chance: 1 }]);
  assert.equal(s3.drops.has('item_base'), false);

  const base = itemDropIndex(seasonal, () => false);
  assert.deepEqual(base.drops.get('item_base'), [{ monster: 'a', chance: 1 }]);
  assert.equal(base.drops.has('item_s3'), false);

  // The memo is keyed by season as well as difficulty.
  assert.notEqual(itemDropIndex(seasonal, () => false, 'normal', 's3'), s3);
});

test('vendor offers: shop level for equipment, drop rule otherwise, exchange stock and points', () => {
  const sword = items['item_0101']!;
  const regular = vendorOffersOf(vendors, sword);
  assert.deepEqual(regular[0], { vendor: 'regular', shopLevel: 1, gold: { min: 150, max: 350 } });

  const mat = items['item_0587']!;
  const ancient = vendorOffersOf(vendors, mat).find((o) => o.vendor === 'ancient');
  assert.deepEqual(ancient, { vendor: 'ancient', unlockDrops: 4, coins: { min: 240, max: 560 } });

  const [id, stock] = vendors.guild.exchange.offers[0]!;
  const guild = vendorOffersOf(vendors, items[id]!).find((o) => o.vendor === 'guild');
  assert.equal(guild?.stock, stock);
  assert.equal(typeof guild?.points, 'number');

  assert.deepEqual(vendorOffersOf(vendors, { id: 'item_nothing', type: 'equip', cost: 1, quality: 1 }), []);
});

test('endless appearances: wave is three times the stage, de-duplicated', () => {
  const got = endlessAppearances([
    { kind: 'boss_reward', level: 2 },
    { kind: 'boss_reward', level: 1 },
    { kind: 'boss_reward', level: 2 },
    { kind: 'merchant_base', level: 4 },
  ]);
  assert.deepEqual(got.bosses, [
    { stage: 1, wave: 3 },
    { stage: 2, wave: 6 },
  ]);
  assert.deepEqual(got.merchants, [{ stage: 4, wave: 12 }]);
  assert.deepEqual(endlessAppearances(undefined), { bosses: [], merchants: [] });
});

test('reward chest tiers read the partner pools', () => {
  const [first] = pools.pools['P803']!.entries;
  const tiers = rewardChestTiers(pools, first![0]);
  assert.ok(tiers.some((t) => t.tier === 1 && t.pool === 'P803' && t.share > 0));
  assert.deepEqual(rewardChestTiers(pools, 'item_nothing'), []);
});

test('craft unlock: own talent, or a recipe borrows its product’s', () => {
  assert.deepEqual(craftUnlockOf(craft, { id: 'item_M008', needs: [] }).talents, [{ node: 'T201', tree: 'tree3' }]);
  const recipe = Object.values(items).find(
    (i) => i?.isRecipe === true && i.produces !== undefined && (craft.items[i.produces]?.talents?.length ?? 0) > 0,
  );
  if (recipe !== undefined) {
    const got = craftUnlockOf(craft, recipe);
    assert.equal(got.via, recipe.produces);
    assert.ok(got.talents.length > 0);
  }
});

// A blueprint whose product the pack leaves without components describes
// nothing — and neither does its own card — so the product's card does not
// offer it. The partner wiki listed it anyway, which is what a reader asked
// about on 16.10.2026 (Священная Реликвия). Give the item components in the
// data and its recipe comes back, which is the first half of the test.
test('an item with nothing to make it from gets no recipe link', () => {
  const craftable = Object.entries(craft.items).find(([id, e]) => (e.recipes?.length ?? 0) > 0 && (items[id]?.needs.length ?? 0) > 0);
  assert.ok(craftable, 'the pack should have an item with both a recipe and components');
  const [id, entry] = craftable!;
  assert.deepEqual(craftUnlockOf(craft, items[id]!).recipes, entry.recipes);

  const empty = Object.entries(craft.items).find(
    ([id, e]) => (e.recipes?.length ?? 0) > 0 && (items[id]?.needs.length ?? 1) === 0,
  );
  assert.ok(empty, 'the pack should have items with a recipe and no components');
  assert.deepEqual(craftUnlockOf(craft, items[empty![0]]!).recipes, []);
});

test('seasonal patch replaces only what it names', () => {
  const base = items['item_0599']!;
  const s2 = applySeasonalPatch(base, extra.seasonal['item_0599']?.s2);
  assert.equal(s2.level, 6);
  assert.deepEqual(s2.needs[0], { id: 'item_0700', count: 1 });
  assert.equal(s2.cost, base.cost);
  assert.equal(applySeasonalPatch(base, undefined), base);
  const soul = applySeasonalPatch(items['item_H0001']!, { cooldown: 425 });
  assert.equal(soul.ability?.cooldown, 425);
});

test('soul multiplier follows quality', () => {
  const rules = soulMultiplierRules(Object.values(items).filter((i) => i && typeof i === 'object'));
  assert.ok(rules.length >= 1);
  assert.ok(rules.some(([q, m]) => q === 5 && m === 6));
  for (let i = 1; i < rules.length; i++) assert.ok(rules[i]![0] > rules[i - 1]![0]);
});
