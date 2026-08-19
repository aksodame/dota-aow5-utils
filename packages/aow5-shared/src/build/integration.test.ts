import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { decodeBuild, encodeBuild, makeIdTable } from './buildCodec.ts';
import { MAX_SECTIONS, SLOTS_PER_SECTION, createEmptyState, slotKindAt } from './buildState.ts';
import { buildSummaries, rebuildAbilityTable, rebuildIdTable } from '../data/loadData.ts';
import type { IndexRow, ItemsIndex, Meta } from '../types/items.ts';
import { ABILITY_SLOTS, type HeroesData, type LocaleAbilities } from '../types/heroes.ts';

/**
 * End-to-end check over the real emitted artifacts.
 *
 * The unit tests exercise the codec against the full id table straight off
 * disk. The app never has that: it rebuilds the table from the playable-only
 * index, which is where a subtle off-by-one or a hole handled as an id would
 * silently point links at the wrong item. This covers that seam.
 */

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const read = <T>(rel: string): T => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as T;

const meta = read<Meta>('public/data/meta.json');
const index = read<ItemsIndex>('public/data/items.index.json');
const names = read<{ names: Record<string, string> }>('public/data/locale.en.names.json').names;
const fullTable = read<{ ids: string[] }>('data/id-table.json').ids;

test('the app-side id table agrees with the committed one wherever it is populated', () => {
  const { ids: rebuilt } = rebuildIdTable(index.rows, meta.idTableLength);
  assert.equal(rebuilt.length, fullTable.length);

  let populated = 0;
  for (let i = 0; i < rebuilt.length; i++) {
    if (rebuilt[i] === '') continue;
    populated++;
    assert.equal(rebuilt[i], fullTable[i], `index ${i} disagrees with the committed table`);
  }
  assert.equal(populated, index.rows.length, 'every index row lands at its own position');
  assert.equal(
    rebuilt.length - populated,
    meta.itemCount - meta.playableCount,
    'holes correspond exactly to the non-playable items',
  );
});

test('a board built from real items round-trips through the app-side table', () => {
  const { ids: rebuilt, kinds } = rebuildIdTable(index.rows, meta.idTableLength);
  const table = makeIdTable(rebuilt, meta.idTableHash, kinds);
  const items = buildSummaries(index.rows, names);

  // Fill every slot with an item that slot would actually accept, so this
  // mirrors a real board rather than an arbitrary one.
  const state = createEmptyState(MAX_SECTIONS);
  for (let s = 0; s < MAX_SECTIONS; s++) {
    for (let n = 0; n < SLOTS_PER_SECTION; n++) {
      const kind = slotKindAt(n);
      const eligible = items.filter((i) => (i.kinds & kind) !== 0);
      assert.ok(eligible.length > 0, `no item is eligible for slot ${n}`);
      const item = eligible[(s * SLOTS_PER_SECTION + n) * 13 % eligible.length]!;
      state.sections[s]!.slots[n] = { k: 'id', id: item.id };
    }
  }
  state.sections[0]!.name = 'Core';

  const encoded = encodeBuild(state, table);
  const decoded = decodeBuild(encoded, table);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;

  assert.deepEqual(decoded.state, state);
  assert.equal(decoded.warnings.length, 0, 'a board of real playable items must decode without warnings');

  // Every decoded slot must resolve to a nameable item, which is what the
  // board actually renders.
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const section of decoded.state.sections) {
    for (const slot of section.slots) {
      assert.ok(slot && slot.k === 'id', 'expected a resolved item');
      if (slot?.k === 'id') assert.ok(byId.get(slot.id)?.name, `no name for ${slot.id}`);
    }
  }
});

test('every index row points at an icon file that exists', () => {
  const missing: string[] = [];
  for (const row of index.rows as IndexRow[]) {
    const icon = row[6];
    const p =
      icon === 'placeholder.png'
        ? path.join(ROOT, 'public/icons', icon)
        : path.join(ROOT, 'public/icons/items', icon);
    if (!fs.existsSync(p)) missing.push(`${row[1]} -> ${icon}`);
  }
  assert.deepEqual(missing, [], 'index rows referencing missing icons');
});

test('every playable item has a localized name in every shipped language', () => {
  for (const lang of meta.languages) {
    const map = read<{ names: Record<string, string> }>(`public/data/locale.${lang}.names.json`).names;
    const missing = (index.rows as IndexRow[]).filter((r) => !map[r[1]]).map((r) => r[1]);
    assert.deepEqual(missing.slice(0, 5), [], `${lang} is missing ${missing.length} name(s)`);
  }
});

// --- heroes and abilities ---------------------------------------------------

const heroes = read<HeroesData>('public/data/heroes.json');

test('meta agrees with the emitted hero data', () => {
  assert.equal(heroes.heroes.length, meta.heroCount);
  assert.equal(Object.keys(heroes.abilities).length, meta.abilityCount);
  assert.equal(heroes.abilityTableLength, meta.abilityTableLength);
  assert.equal(heroes.abilityTableHash, meta.abilityTableHash);
});

test('the app-side ability table resolves every ability by index', () => {
  const ids = rebuildAbilityTable(heroes.abilities, heroes.abilityTableLength);
  assert.equal(ids.length, heroes.abilityTableLength);
  for (const ability of Object.values(heroes.abilities)) {
    assert.equal(ids[ability.idx], ability.id, `${ability.id} does not sit at index ${ability.idx}`);
  }
});

test('every spell and portrait icon file exists', () => {
  const missing: string[] = [];
  for (const ability of Object.values(heroes.abilities)) {
    const p =
      ability.icon === 'placeholder.png'
        ? path.join(ROOT, 'public/icons', ability.icon)
        : path.join(ROOT, 'public/icons/abilities', ability.icon);
    if (!fs.existsSync(p)) missing.push(`${ability.id} -> ${ability.icon}`);
  }
  for (const hero of heroes.heroes) {
    const p =
      hero.icon === 'placeholder.png'
        ? path.join(ROOT, 'public/icons', hero.icon)
        : path.join(ROOT, 'public/icons/heroes', hero.icon);
    if (!fs.existsSync(p)) missing.push(`${hero.id} -> ${hero.icon}`);
  }
  assert.deepEqual(missing, [], 'hero data referencing missing icons');
});

test('every ability has localized text in every shipped language', () => {
  for (const lang of meta.languages) {
    const map = read<LocaleAbilities>(`public/data/locale.${lang}.abilities.json`).abilities;
    const missing = Object.keys(heroes.abilities).filter((id) => !map[id]?.name);
    assert.deepEqual(missing.slice(0, 5), [], `${lang} is missing ${missing.length} ability name(s)`);
  }
});

test('every hero has a display name in every shipped language', () => {
  for (const lang of meta.languages) {
    const missing = heroes.heroes.filter((h) => !h.names[lang]).map((h) => h.id);
    assert.deepEqual(missing, [], `${lang} is missing ${missing.length} hero name(s)`);
  }
});

test('a hero only offers abilities that bind to the key they are offered under', () => {
  const problems: string[] = [];
  for (const hero of heroes.heroes) {
    for (const slot of ABILITY_SLOTS) {
      for (const id of hero.bySlot[slot] ?? []) {
        const ability = heroes.abilities[id];
        if (!ability) problems.push(`${hero.short}.${slot}: ${id} does not exist`);
        else if (ability.slot !== slot) problems.push(`${hero.short}.${slot}: ${id} binds to ${ability.slot}`);
        // A null owner is shared with every hero, like the `f` heal.
        else if (ability.hero !== null && ability.hero !== hero.id) {
          problems.push(`${hero.short}.${slot}: ${id} belongs to ${ability.hero}`);
        }
      }
    }
  }
  assert.deepEqual(problems, []);
});
