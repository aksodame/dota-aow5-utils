import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { decodeBuild, encodeBuild, makeIdTable } from './buildCodec.ts';
import { SLOT_COUNT, buildReducer, createEmptyState, slotAcceptsAt } from './buildState.ts';
import { buildSummaries, rebuildAbilityTable, rebuildIdTable, rebuildMapTable } from '../data/loadData.ts';
import type { IndexRow, ItemsIndex, Meta } from '../types/items.ts';
import { ABILITY_SLOTS, SPELLS_PER_SECTION, type HeroesData, type LocaleAbilities } from '../types/heroes.ts';
import type { LocaleMaps, MapsData } from '../types/maps.ts';

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

test('a build made of real items, spells and a real map round-trips through the app-side tables', () => {
  const { ids: rebuilt } = rebuildIdTable(index.rows, meta.idTableLength);
  const table = makeIdTable(rebuilt, meta.idTableHash);
  const items = buildSummaries(index.rows, names);

  const heroData = read<HeroesData>('public/data/heroes.json');
  const mapData = read<MapsData>('public/data/maps.json');
  const tables = {
    abilityIds: rebuildAbilityTable(heroData.abilities, heroData.abilityTableLength),
    heroIds: heroData.heroes.map((h) => h.id),
    mapIds: rebuildMapTable(mapData.maps, mapData.mapTableLength),
  };

  // Fill every slot with an item that slot would actually accept, so this
  // mirrors a real build rather than an arbitrary one.
  let state = createEmptyState();
  for (let n = 0; n < SLOT_COUNT; n++) {
    const accepts = slotAcceptsAt(n);
    const eligible = items.filter((i) => (i.kinds & accepts) !== 0);
    assert.ok(eligible.length > 0, `no item is eligible for slot ${n}`);
    const item = eligible[(n * 13) % eligible.length]!;
    state = buildReducer(state, { type: 'setSlot', slot: n, value: { k: 'id', id: item.id } });
  }

  // A real hero, every key it can actually bind, and a real map.
  const hero = heroData.heroes[0]!;
  state = buildReducer(state, { type: 'setHero', hero: hero.id });
  ABILITY_SLOTS.forEach((key, n) => {
    const candidate = hero.bySlot[key]?.[0];
    if (candidate) state = buildReducer(state, { type: 'setSpell', spell: n, value: { k: 'id', id: candidate } });
  });
  const map = mapData.maps.find((m) => m.type === 'forest')!;
  state = buildReducer(state, { type: 'toggleMap', map: map.id });
  state = buildReducer(state, { type: 'setTitle', title: 'Core' });

  const encoded = encodeBuild(state, table, tables);
  const decoded = decodeBuild(encoded, table, tables);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;

  assert.deepEqual(decoded.state, state);
  assert.equal(decoded.warnings.length, 0, 'a build of real playable data must decode without warnings');

  // Every decoded slot must resolve to a nameable item, which is what the
  // build page actually renders.
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const slot of decoded.state.slots) {
    assert.ok(slot && slot.k === 'id', 'expected a resolved item');
    if (slot?.k === 'id') assert.ok(byId.get(slot.id)?.name, `no name for ${slot.id}`);
  }
  assert.deepEqual(decoded.state.maps, [map.id]);
  assert.equal(decoded.state.spells.length, SPELLS_PER_SECTION);
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

// --- maps -------------------------------------------------------------------

const maps = read<MapsData>('public/data/maps.json');

test('meta agrees with the emitted map data', () => {
  assert.equal(maps.maps.length, meta.mapCount);
  assert.equal(maps.mapTableLength, meta.mapTableLength);
  assert.equal(maps.mapTableHash, meta.mapTableHash);
});

test('the app-side map table resolves every map by index, and reserves position 0', () => {
  const ids = rebuildMapTable(maps.maps, maps.mapTableLength);
  assert.equal(ids.length, maps.mapTableLength + 1, 'one longer than the table, because indices are 1-based');
  assert.equal(ids[0], '', 'position 0 is reserved for "no map chosen"');
  for (const map of maps.maps) {
    assert.ok(map.idx >= 1, `${map.id} claims the reserved index 0`);
    assert.equal(ids[map.idx], map.id, `${map.id} does not sit at index ${map.idx}`);
  }
});

test('every map has a name and a label in every shipped language', () => {
  for (const lang of meta.languages) {
    const text = read<LocaleMaps>(`public/data/locale.${lang}.maps.json`).maps;
    const missing = maps.maps.filter((m) => !text[m.id]?.name || !text[m.id]?.label).map((m) => m.id);
    assert.deepEqual(missing, [], `${lang} is missing text for ${missing.length} map(s)`);
  }
});

test('every map states a tier a guide could be filed under', () => {
  for (const map of maps.maps) {
    assert.ok(Number.isInteger(map.tier) && map.tier >= 1, `${map.id} has tier ${map.tier}`);
    // The displayed tier may exceed the KV level, but only for DLC rooms.
    if (map.tier !== map.roomLevel) assert.ok(map.isDlc, `${map.id} drifts from its KV level but is not DLC`);
  }
});
