import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createEmptyState, encodeBuild, makeIdTable, type HeroTable } from 'aow5-shared/codec';
import { ABILITY_SLOTS, type HeroesData, type ItemsIndex, type LocaleAbilities, type MapsData, type Meta } from 'aow5-shared/types';
import { buildSummaries, rebuildAbilityTable, rebuildIdTable, rebuildMapTable, type CoreData } from 'aow5-shared/data';
import { buildPreview, spellsInDisplayOrder, tileOffersSouls } from './preview.ts';

/**
 * The browse row's preview, against the real emitted data.
 *
 * This is the one piece of client code that reads a payload rather than a DTO,
 * so it is where a codec change would show up as rows that render blank — and
 * a blank row looks like a styling bug rather than a decoding one, which is
 * exactly why it is worth a test.
 */

const require = createRequire(import.meta.url);
const SHARED = path.join(path.dirname(require.resolve('aow5-shared/package.json')), 'public', 'data');
const read = <T>(file: string): T => JSON.parse(fs.readFileSync(path.join(SHARED, file), 'utf8')) as T;

const meta = read<Meta>('meta.json');
const index = read<ItemsIndex>('items.index.json');
const heroesData = read<HeroesData>('heroes.json');
const mapsData = read<MapsData>('maps.json');
const names = read<{ names: Record<string, string> }>('locale.en.names.json').names;
const abilityText = read<LocaleAbilities>('locale.en.abilities.json').abilities;

/** The same shape `loadCore` builds in the browser, assembled from disk. */
function core(): CoreData {
  const items = buildSummaries(index.rows, names);
  const { ids, kinds } = rebuildIdTable(index.rows, meta.idTableLength);
  const spells = new Map(
    Object.values(heroesData.abilities).map((ability) => [
      ability.id,
      { ...ability, name: abilityText[ability.id]?.name ?? ability.id, text: abilityText[ability.id] },
    ]),
  );
  const mapSummaries = mapsData.maps.map((map) => ({ ...map, name: map.id, label: map.id }));
  return {
    meta,
    ids,
    kinds,
    items,
    byId: new Map(items.map((i) => [i.id, i])),
    heroes: {
      heroes: heroesData.heroes,
      byHero: new Map(heroesData.heroes.map((h) => [h.id, h])),
      spells,
      abilityIds: rebuildAbilityTable(heroesData.abilities, heroesData.abilityTableLength),
      heroIds: heroesData.heroes.map((h) => h.id),
    },
    maps: {
      maps: mapSummaries,
      byId: new Map(mapSummaries.map((m) => [m.id, m])),
      mapIds: rebuildMapTable(mapsData.maps, mapsData.mapTableLength),
    },
  } as CoreData;
}

const DATA = core();
const TABLES = {
  items: makeIdTable(DATA.ids, meta.idTableHash),
  heroes: {
    abilityIds: DATA.heroes.abilityIds,
    heroIds: DATA.heroes.heroIds,
    mapIds: DATA.maps.mapIds,
  } satisfies HeroTable,
};

/** A build of real equipment, with every key the first hero can bind. */
function sample() {
  const hero = heroesData.heroes[0]!;
  const state = createEmptyState();
  state.hero = hero.id;

  const equipment = DATA.items.filter((i) => (i.kinds & 2) !== 0);
  for (let slot = 3; slot <= 8; slot += 1) {
    state.slots[slot] = { k: 'id', id: equipment[slot * 7]!.id };
  }
  ABILITY_SLOTS.forEach((key, n) => {
    const candidate = hero.bySlot[key]?.[0];
    if (candidate !== undefined) state.spells[n] = { k: 'id', id: candidate };
  });
  return { hero, state, payload: encodeBuild(state, TABLES.items, TABLES.heroes) };
}

test('a real build previews with a spell and the whole gear block beside it', () => {
  const { payload } = sample();
  const preview = buildPreview(payload, DATA, TABLES);

  assert.notEqual(preview.spell, null, 'a build with seven spells must show one');
  assert.equal(preview.items.length, 6, 'the six worn slots');
  for (const item of preview.items) assert.ok(item !== null && item.name !== '', 'every worn slot resolves');
});

test('the preview is the gear block, not the first few items placed', () => {
  /*
   * The bug this replaces: reading slots from 0 meant a row led with potions
   * and could run out before reaching any equipment at all. What a row shows is
   * the worn six, whatever else the build carries.
   */
  const state = createEmptyState();
  state.hero = heroesData.heroes[0]!.id;

  const potions = DATA.items.filter((i) => (i.kinds & 1) !== 0);
  const equipment = DATA.items.filter((i) => (i.kinds & 2) !== 0);
  for (let slot = 0; slot <= 2; slot += 1) state.slots[slot] = { k: 'id', id: potions[slot]!.id };
  state.slots[3] = { k: 'id', id: equipment[10]!.id };

  const preview = buildPreview(encodeBuild(state, TABLES.items, TABLES.heroes), DATA, TABLES);
  assert.equal(preview.items.length, 6);
  assert.equal(preview.items[0]?.id, equipment[10]!.id, 'the first worn slot leads');
  assert.deepEqual(preview.items.slice(1), [null, null, null, null, null], 'the rest are holes');
  for (const item of preview.items) {
    assert.ok(item === null || !potions.some((p) => p.id === item.id), 'no potion may appear');
  }
});

test('an empty worn slot is a hole, so the six tiles line up row to row', () => {
  const state = createEmptyState();
  state.hero = heroesData.heroes[0]!.id;
  const equipment = DATA.items.filter((i) => (i.kinds & 2) !== 0);
  state.slots[4] = { k: 'id', id: equipment[3]!.id };

  const preview = buildPreview(encodeBuild(state, TABLES.items, TABLES.heroes), DATA, TABLES);
  assert.equal(preview.items[0], null);
  assert.equal(preview.items[1]?.id, equipment[3]!.id, 'it keeps its own position');
  assert.equal(preview.items.length, 6);
});

test('an index this deployment cannot name reads as an empty slot', () => {
  const state = createEmptyState();
  state.slots[3] = { k: 'unknown', idx: 4000 };
  const preview = buildPreview(encodeBuild(state, TABLES.items, TABLES.heroes), DATA, TABLES);
  assert.equal(preview.items[0], null, 'a question mark has no place in a scannable row');
});

test('the main spell is the q, not the ultimate', () => {
  // The ultimate is close to fixed per hero, so a column of rows led by it
  // reads as a column of hero names. `q` is what one build does differently
  // from the next. The shared `f` heal is excluded outright: every hero has it.
  const { hero, payload } = sample();
  const preview = buildPreview(payload, DATA, TABLES);
  const q = hero.bySlot['q']?.[0];
  if (q !== undefined) assert.equal(preview.spell?.id, q);
});

test('the shared heal is never chosen as the headline', () => {
  const hero = heroesData.heroes[0]!;
  const state = createEmptyState();
  state.hero = hero.id;
  const f = ABILITY_SLOTS.indexOf('f');
  const heal = hero.bySlot['f']?.[0];
  if (heal === undefined) return;
  state.spells[f] = { k: 'id', id: heal };

  const preview = buildPreview(encodeBuild(state, TABLES.items, TABLES.heroes), DATA, TABLES);
  assert.equal(preview.spell, null, 'the one ability every hero has says nothing about a build');
});

test('an empty build previews as empty slots rather than throwing', () => {
  const state = createEmptyState();
  state.maps = [mapsData.maps[0]!.id];
  const preview = buildPreview(encodeBuild(state, TABLES.items, TABLES.heroes), DATA, TABLES);
  assert.equal(preview.spell, null);
  assert.deepEqual(preview.items, [null, null, null, null, null, null]);
});

test('a payload this deployment cannot read previews as blank, not as a crash', () => {
  // What a row does when the server is a codec version ahead of the browser.
  for (const payload of ['', 'nonsense', '6.AAAA', '99.AAAAAAAA']) {
    const preview = buildPreview(payload, DATA, TABLES);
    assert.equal(preview.spell, null, payload);
    assert.deepEqual(preview.items, [], payload);
  }
});

test('the preview is always six slots wide, however much the build holds', () => {
  // Fixed width is what lets the rows read as a column rather than as ragged
  // strips of different lengths.
  const { payload } = sample();
  assert.equal(buildPreview(payload, DATA, TABLES).items.length, 6);

  const bare = createEmptyState();
  bare.maps = [mapsData.maps[0]!.id];
  assert.equal(buildPreview(encodeBuild(bare, TABLES.items, TABLES.heroes), DATA, TABLES).items.length, 6);
});

test('spells are listed in the order the kit reads, not in wire order', () => {
  const { state } = sample();
  const listed = spellsInDisplayOrder(state.spells, DATA);
  assert.deepEqual(
    listed.map((s) => s.key),
    ['passive', 'q', 'w', 'e', 'd', 'f', 'r'],
  );
  assert.equal(listed.length, ABILITY_SLOTS.length, 'every key is drawn, filled or not');
});

test('a spell this deployment cannot name is reported rather than dropped', () => {
  const state = createEmptyState();
  state.hero = heroesData.heroes[0]!.id;
  state.spells[0] = { k: 'unknown', idx: 4000 };

  const listed = spellsInDisplayOrder(state.spells, DATA);
  const q = listed.find((s) => s.key === ABILITY_SLOTS[0]);
  assert.equal(q?.unknown, true);
  assert.equal(q?.spell, null);
});

test("the author's own headline wins over the kit order", () => {
  /*
   * The whole point of `mainSpell` on the build: `q` is a decent reading of
   * most kits and wrong about the build that is really about its W. Only the
   * *stored* build carries one — an anonymous `#b=` link has no such field, so
   * the order below still draws those.
   */
  const { hero, state } = sample();
  const payload = encodeBuild(state, TABLES.items, TABLES.heroes);

  const w = hero.bySlot['w']?.[0];
  if (w === undefined) return;

  assert.equal(buildPreview(payload, DATA, TABLES, 'w').spell?.id, w);
  assert.equal(buildPreview(payload, DATA, TABLES, null).spell?.id, hero.bySlot['q']?.[0]);
});

test('a headline naming an empty slot falls back rather than drawing a hole', () => {
  // The server refuses this pair on save; a row that met one anyway — an older
  // build whose spell was cleared — should still show something.
  const state = createEmptyState();
  state.hero = heroesData.heroes[0]!.id;
  const q = heroesData.heroes[0]!.bySlot['q']?.[0];
  if (q === undefined) return;
  state.spells[ABILITY_SLOTS.indexOf('q')] = { k: 'id', id: q };

  const preview = buildPreview(encodeBuild(state, TABLES.items, TABLES.heroes), DATA, TABLES, 'r');
  assert.equal(preview.spell?.id, q, 'the kit order answers when the named slot is empty');
});

/**
 * The Life Soul, and the key it takes over.
 *
 * Against the real data rather than a fixture: the point is that the soul slot
 * the layout names holds an item the index actually flags `SLOT_KIND.SOUL`, and
 * a fixture would keep passing after the pak stopped shipping any.
 */
const SOUL_SLOT = 15;
const SOULS = DATA.items.filter((i) => (i.kinds & 64) !== 0);

test('a worn Life Soul is what the f key shows, in place of the shared heal', () => {
  assert.ok(SOULS.length > 0, 'the emitted index has Life Souls to wear');
  const { state } = sample();
  const heal = spellsInDisplayOrder(state.spells, DATA, state.slots).find((s) => s.key === 'f');
  assert.equal(heal?.soul, null, 'nothing worn, so f is the ordinary heal');
  assert.notEqual(heal?.spell, null);

  state.slots[SOUL_SLOT] = { k: 'id', id: SOULS[0]!.id };
  const listed = spellsInDisplayOrder(state.spells, DATA, state.slots);
  const f = listed.find((s) => s.key === 'f');
  assert.equal(f?.soul?.id, SOULS[0]!.id);
  // The ability underneath is untouched — the soul is a display override, not
  // an edit to what the build encodes.
  assert.notEqual(f?.spell, null);
  // And no other key moves.
  for (const entry of listed) if (entry.key !== 'f') assert.equal(entry.soul, null);
});

test('a row led by f leads with the soul, and one led by anything else does not', () => {
  const { state } = sample();
  state.slots[SOUL_SLOT] = { k: 'id', id: SOULS[0]!.id };
  const payload = encodeBuild(state, TABLES.items, TABLES.heroes);

  assert.equal(buildPreview(payload, DATA, TABLES, 'f').soul?.id, SOULS[0]!.id);
  assert.equal(buildPreview(payload, DATA, TABLES, 'q').soul, null);
});

test('the soul slot survives the codec, which is what lets the f tile find it', () => {
  const hero = heroesData.heroes[0]!;
  const state = createEmptyState();
  state.hero = hero.id;
  // `f` has to be a headline the row can actually draw, which means the heal is
  // in the build — the soul stands in for that ability, it does not replace it.
  const heal = hero.bySlot['f']?.[0];
  assert.ok(heal !== undefined, 'every hero carries the shared heal on f');
  state.spells[ABILITY_SLOTS.indexOf('f')] = { k: 'id', id: heal };
  state.slots[SOUL_SLOT] = { k: 'id', id: SOULS[0]!.id };

  const payload = encodeBuild(state, TABLES.items, TABLES.heroes);
  assert.equal(payload.startsWith('8.'), true, 'still v8 — see buildCodec.ts');
  assert.equal(buildPreview(payload, DATA, TABLES, 'f').soul?.id, SOULS[0]!.id);
});

test('the f tile reaches the souls before one is worn, not only after', () => {
  /*
   * The bug this is here for: the tile used to open the souls only while one
   * was already equipped, so the only way to reach it was the soul slot — the
   * route somebody clicking `f` has not found. It does not depend on what is
   * worn, only on the slot being on offer.
   */
  assert.equal(tileOffersSouls('f', true, 1), true, 'offered, one heal candidate');
  assert.equal(tileOffersSouls('f', true, 0), true, 'offered, nothing filled yet');

  // Not where the slot is not on offer — S1 has no Life Soul.
  assert.equal(tileOffersSouls('f', false, 1), false);
  // And never on a key that is a real decision.
  for (const key of ['q', 'w', 'e', 'd', 'r', 'passive']) {
    assert.equal(tileOffersSouls(key, true, 1), false, `${key} keeps its spell picker`);
  }
  // A hypothetical second `f` ability would make that picker a real choice
  // again, and it must win over the shortcut.
  assert.equal(tileOffersSouls('f', true, 2), false);
});

test('every hero has exactly one f candidate, which is what the shortcut rests on', () => {
  for (const hero of heroesData.heroes.filter((h) => h.playable)) {
    const candidates = (hero.bySlot as Record<string, string[] | undefined>)['f'] ?? [];
    assert.equal(candidates.length, 1, `${hero.id} has one f ability`);
  }
});
