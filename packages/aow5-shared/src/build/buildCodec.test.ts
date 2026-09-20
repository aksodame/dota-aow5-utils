import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CODEC_VERSION,
  MAX_ENCODABLE_INDEX,
  decodeBuild,
  encodeBuild,
  makeIdTable,
  type HeroTable,
  type IdTable,
} from './buildCodec.ts';
import {
  LOADOUT_LAYOUT,
  MAX_TITLE,
  SLOT_COUNT,
  buildReducer,
  countItems,
  countSpells,
  createEmptyState,
  groupsInPanel,
  visibleGroups,
  isEmptyState,
  slotAcceptsAt,
  slotKindAt,
  type BuildState,
} from './buildState.ts';
import { SPELLS_PER_SECTION } from '../types/heroes.ts';
import { SLOT_KIND } from '../types/items.ts';

/**
 * The codec, against synthetic tables.
 *
 * Tables are made up here on purpose: the point is the encoding, and a test
 * that depends on the real item table starts failing every time the game ships
 * an item. `integration.test.ts` covers the seam with the real artifacts.
 */

const ITEM_IDS = Array.from({ length: 300 }, (_, i) => `item_${String(i).padStart(4, '0')}`);
// Holes, as the app-side table has for non-playable items.
ITEM_IDS[7] = '';
ITEM_IDS[42] = '';

const ABILITY_IDS = Array.from({ length: 40 }, (_, i) => `ability_${i}`);
const HERO_IDS = ['npc_dota_hero_axe', 'npc_dota_hero_lina', 'npc_dota_hero_crystal_maiden'];
// 1-based, exactly as the emitted map table is: position 0 is the "no map" hole.
const MAP_IDS = ['', 'M001', 'M002', 'M007', 'G001'];

const table: IdTable = makeIdTable(ITEM_IDS, 'abcd0000');
const heroes: HeroTable = { abilityIds: ABILITY_IDS, heroIds: HERO_IDS, mapIds: MAP_IDS };

/** base64url, for hand-built boards. The codec keeps its own copy private. */
function b64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Round-trips a state and asserts the decode succeeded. */
function roundTrip(state: BuildState): { state: BuildState; payload: string } {
  const payload = encodeBuild(state, table, heroes);
  const result = decodeBuild(payload, table, heroes);
  assert.ok(result.ok, `decode failed: ${result.ok ? '' : result.reason}`);
  return { state: result.state, payload };
}

// --- the empty build --------------------------------------------------------

test('an untouched build encodes to nothing at all', () => {
  assert.equal(encodeBuild(createEmptyState(), table, heroes), '');
  assert.ok(isEmptyState(createEmptyState()));
});

test('a build is no longer empty once anything is set', () => {
  for (const mutate of [
    (s: BuildState) => buildReducer(s, { type: 'setHero', hero: 'npc_dota_hero_axe' }),
    (s: BuildState) => buildReducer(s, { type: 'toggleMap', map: 'M001' }),
    (s: BuildState) => buildReducer(s, { type: 'setTitle', title: 'a title' }),
    (s: BuildState) => buildReducer(s, { type: 'setSlot', slot: 3, value: { k: 'id', id: 'item_0100' } }),
    (s: BuildState) => buildReducer(s, { type: 'setSpell', spell: 0, value: { k: 'id', id: 'ability_1' } }),
  ]) {
    assert.equal(isEmptyState(mutate(createEmptyState())), false);
    assert.notEqual(encodeBuild(mutate(createEmptyState()), table, heroes), '');
  }
});

test('an empty payload is malformed rather than an empty build', () => {
  const result = decodeBuild('', table, heroes);
  assert.equal(result.ok, false);
  assert.equal(result.ok ? '' : result.reason, 'malformed');
});

// --- round trips ------------------------------------------------------------

test('every slot round-trips at its own position', () => {
  let state = createEmptyState();
  for (let n = 0; n < SLOT_COUNT; n++) {
    state = buildReducer(state, { type: 'setSlot', slot: n, value: { k: 'id', id: ITEM_IDS[100 + n]! } });
  }

  const { state: decoded } = roundTrip(state);
  for (let n = 0; n < SLOT_COUNT; n++) {
    assert.deepEqual(decoded.slots[n], { k: 'id', id: ITEM_IDS[100 + n] }, `slot ${n}`);
  }
  assert.equal(countItems(decoded), SLOT_COUNT);
});

test('a sparse build keeps its gaps where they were', () => {
  let state = createEmptyState();
  state = buildReducer(state, { type: 'setSlot', slot: 0, value: { k: 'id', id: 'item_0001' } });
  state = buildReducer(state, { type: 'setSlot', slot: 8, value: { k: 'id', id: 'item_0002' } });
  state = buildReducer(state, { type: 'setSlot', slot: 14, value: { k: 'id', id: 'item_0003' } });

  const { state: decoded } = roundTrip(state);
  assert.deepEqual(decoded.slots[0], { k: 'id', id: 'item_0001' });
  assert.equal(decoded.slots[1], null);
  assert.deepEqual(decoded.slots[8], { k: 'id', id: 'item_0002' });
  assert.equal(decoded.slots[13], null);
  assert.deepEqual(decoded.slots[14], { k: 'id', id: 'item_0003' });
  assert.equal(countItems(decoded), 3);
});

test('the hero round-trips', () => {
  for (const hero of HERO_IDS) {
    const state = buildReducer(createEmptyState(), { type: 'setHero', hero });
    assert.equal(roundTrip(state).state.hero, hero);
  }
});

test('the map round-trips, including the last position in the table', () => {
  for (const map of ['M001', 'M002', 'M007', 'G001']) {
    const state = buildReducer(createEmptyState(), { type: 'toggleMap', map });
    const decoded = roundTrip(state).state;
    assert.deepEqual(decoded.maps, [map], map);
    assert.deepEqual(decoded.mapsUnknown, []);
  }
});

test('every spell key round-trips at its own position', () => {
  let state = createEmptyState();
  for (let n = 0; n < SPELLS_PER_SECTION; n++) {
    state = buildReducer(state, { type: 'setSpell', spell: n, value: { k: 'id', id: ABILITY_IDS[n + 5]! } });
  }
  const { state: decoded } = roundTrip(state);
  for (let n = 0; n < SPELLS_PER_SECTION; n++) {
    assert.deepEqual(decoded.spells[n], { k: 'id', id: ABILITY_IDS[n + 5] }, `spell ${n}`);
  }
  assert.equal(countSpells(decoded), SPELLS_PER_SECTION);
});

test('the title round-trips, unicode included', () => {
  for (const title of ['Tier 8 speed farm', 'Лёд и пламя', '倾天秘境 T3', 'a']) {
    const state = buildReducer(createEmptyState(), { type: 'setTitle', title });
    assert.equal(roundTrip(state).state.title, title, title);
  }
});

test('a whole build round-trips in one go', () => {
  let state = createEmptyState();
  state = buildReducer(state, { type: 'setHero', hero: 'npc_dota_hero_lina' });
  state = buildReducer(state, { type: 'toggleMap', map: 'M007' });
  state = buildReducer(state, { type: 'setTitle', title: 'Underground Temple, no shield' });
  for (let n = 0; n < SLOT_COUNT; n++) {
    state = buildReducer(state, { type: 'setSlot', slot: n, value: { k: 'id', id: ITEM_IDS[50 + n]! } });
  }
  for (let n = 0; n < SPELLS_PER_SECTION; n++) {
    state = buildReducer(state, { type: 'setSpell', spell: n, value: { k: 'id', id: ABILITY_IDS[n]! } });
  }

  const { state: decoded } = roundTrip(state);
  assert.deepEqual(decoded, state);
});

// --- segments ---------------------------------------------------------------

test('a build with no spells and no title is two segments', () => {
  const state = buildReducer(createEmptyState(), { type: 'setHero', hero: 'npc_dota_hero_axe' });
  assert.equal(encodeBuild(state, table, heroes).split('.').length, 2);
});

test('a title with no spells still leaves the spell segment empty rather than absent', () => {
  let state = buildReducer(createEmptyState(), { type: 'setHero', hero: 'npc_dota_hero_axe' });
  state = buildReducer(state, { type: 'setTitle', title: 'named' });

  const payload = encodeBuild(state, table, heroes);
  const parts = payload.split('.');
  assert.equal(parts.length, 4, 'segments are positional, so the empty one is kept');
  assert.equal(parts[2], '');
  assert.equal(roundTrip(state).state.title, 'named');
});

test('the payload starts with the codec version', () => {
  const state = buildReducer(createEmptyState(), { type: 'toggleMap', map: 'M001' });
  assert.equal(encodeBuild(state, table, heroes).split('.')[0], String(CODEC_VERSION));
});

// --- preserving what this build cannot name ---------------------------------

test('an item index this build does not know survives a round trip', () => {
  const state = buildReducer(createEmptyState(), { type: 'setSlot', slot: 4, value: { k: 'unknown', idx: 2999 } });
  const first = encodeBuild(state, table, heroes);

  const decoded = decodeBuild(first, table, heroes);
  assert.ok(decoded.ok);
  assert.deepEqual(decoded.state.slots[4], { k: 'unknown', idx: 2999 });
  assert.ok(decoded.warnings.some((w) => w.k === 'unknown-index' && w.idx === 2999));

  // The whole point: re-encoding reproduces the original bytes.
  assert.equal(encodeBuild(decoded.state, table, heroes), first);
});

test('a hole in the id table decodes as unknown rather than as an empty id', () => {
  // Index 7 is a hole — a non-playable item the app-side table leaves blank.
  const payload = encodeBuild(
    buildReducer(createEmptyState(), { type: 'setSlot', slot: 0, value: { k: 'unknown', idx: 7 } }),
    table,
    heroes,
  );
  const decoded = decodeBuild(payload, table, heroes);
  assert.ok(decoded.ok);
  assert.deepEqual(decoded.state.slots[0], { k: 'unknown', idx: 7 });
});

test('a hero this build cannot name is kept, not stripped', () => {
  const state: BuildState = { ...createEmptyState(), heroUnknown: 9 };
  const payload = encodeBuild(state, table, heroes);
  const decoded = decodeBuild(payload, table, heroes);
  assert.ok(decoded.ok);
  assert.equal(decoded.state.hero, null);
  assert.equal(decoded.state.heroUnknown, 9);
  assert.ok(decoded.warnings.some((w) => w.k === 'unknown-hero'));
  assert.equal(encodeBuild(decoded.state, table, heroes), payload);
});

test('a map this build cannot name is kept, not stripped', () => {
  const state: BuildState = { ...createEmptyState(), mapsUnknown: [900] };
  const payload = encodeBuild(state, table, heroes);
  const decoded = decodeBuild(payload, table, heroes);
  assert.ok(decoded.ok);
  assert.deepEqual(decoded.state.maps, []);
  assert.deepEqual(decoded.state.mapsUnknown, [900]);
  assert.ok(decoded.warnings.some((w) => w.k === 'unknown-map' && w.idx === 900));
  assert.equal(encodeBuild(decoded.state, table, heroes), payload);
});

test('a retired room tombstone decodes as unknown rather than as an empty id', () => {
  // Position 0 of mapIds is the reserved hole; a tombstone looks the same.
  const withTombstone: HeroTable = { ...heroes, mapIds: ['', 'M001', '', 'M007'] };
  const state = buildReducer(createEmptyState(), { type: 'toggleMap', map: 'M007' });
  const payload = encodeBuild(state, table, withTombstone);

  const decoded = decodeBuild(payload, table, withTombstone);
  assert.ok(decoded.ok);
  assert.deepEqual(decoded.state.maps, ['M007']);

  // And the tombstoned position itself.
  const orphan = encodeBuild({ ...createEmptyState(), mapsUnknown: [2] }, table, withTombstone);
  const back = decodeBuild(orphan, table, withTombstone);
  assert.ok(back.ok);
  assert.deepEqual(back.state.mapsUnknown, [2]);
});

test('a spell index this build does not know survives a round trip', () => {
  const state = buildReducer(createEmptyState(), { type: 'setSpell', spell: 2, value: { k: 'unknown', idx: 900 } });
  const payload = encodeBuild(state, table, heroes);
  const decoded = decodeBuild(payload, table, heroes);
  assert.ok(decoded.ok);
  assert.deepEqual(decoded.state.spells[2], { k: 'unknown', idx: 900 });
  assert.ok(decoded.warnings.some((w) => w.k === 'unknown-spell' && w.idx === 900));
  assert.equal(encodeBuild(decoded.state, table, heroes), payload);
});

test('an id absent from the table is dropped rather than encoded as a guess', () => {
  const state = buildReducer(createEmptyState(), { type: 'setSlot', slot: 1, value: { k: 'id', id: 'item_does_not_exist' } });
  const { state: decoded } = roundTrip(state);
  assert.equal(decoded.slots[1], null);
});

test('an index past what 12 bits can carry is dropped rather than truncated', () => {
  let state = buildReducer(createEmptyState(), {
    type: 'setSlot',
    slot: 1,
    value: { k: 'unknown', idx: MAX_ENCODABLE_INDEX + 1 },
  });
  state = buildReducer(state, { type: 'setSlot', slot: 2, value: { k: 'id', id: 'item_0005' } });

  // The slot it cannot carry comes back empty rather than pointing at whatever
  // the low twelve bits of that index happen to name. Its neighbour is intact.
  const { state: decoded } = roundTrip(state);
  assert.equal(decoded.slots[1], null);
  assert.deepEqual(decoded.slots[2], { k: 'id', id: 'item_0005' });
});

// --- decoding without the tables --------------------------------------------

test('decoding without hero tables keeps the hero, map and spells as unknowns', () => {
  let state = createEmptyState();
  state = buildReducer(state, { type: 'setHero', hero: 'npc_dota_hero_axe' });
  state = buildReducer(state, { type: 'toggleMap', map: 'M002' });
  state = buildReducer(state, { type: 'setSpell', spell: 0, value: { k: 'id', id: 'ability_3' } });
  const payload = encodeBuild(state, table, heroes);

  const decoded = decodeBuild(payload, table);
  assert.ok(decoded.ok);
  assert.equal(decoded.state.heroUnknown, 1);
  assert.deepEqual(decoded.state.mapsUnknown, [2]);
  assert.deepEqual(decoded.state.spells[0], { k: 'unknown', idx: 3 });
});

// --- warnings and failures --------------------------------------------------

test('a payload built against another table decodes but says so', () => {
  const state = buildReducer(createEmptyState(), { type: 'setSlot', slot: 0, value: { k: 'id', id: 'item_0005' } });
  const payload = encodeBuild(state, table, heroes);

  const other = makeIdTable(ITEM_IDS, 'ffff0000');
  const decoded = decodeBuild(payload, other, heroes);
  assert.ok(decoded.ok, 'a fingerprint mismatch is a warning, not a failure');
  assert.ok(decoded.warnings.some((w) => w.k === 'table-mismatch'));
  assert.deepEqual(decoded.state.slots[0], { k: 'id', id: 'item_0005' });
});

test('every superseded codec version is refused rather than misread', () => {
  for (const version of [1, 2, 3, 4, 5, 6]) {
    const result = decodeBuild(`${version}.AAAAAAAAAAAA`, table, heroes);
    assert.equal(result.ok, false, `v${version} must not decode`);
    assert.equal(result.ok ? '' : result.reason, 'unsupported-version');
    assert.equal(result.ok ? 0 : result.version, version);
  }
});

test('a future version is refused by name', () => {
  const result = decodeBuild(`${CODEC_VERSION + 1}.AAAAAAAAAAAA`, table, heroes);
  assert.equal(result.ok, false);
  assert.equal(result.ok ? '' : result.reason, 'unsupported-version');
});

test('malformed payloads fail rather than throw', () => {
  const cases = ['not-a-version.AAAA', `${CODEC_VERSION}`, `${CODEC_VERSION}.`, `${CODEC_VERSION}.!!!!`, `${CODEC_VERSION}.AA`];
  for (const payload of cases) {
    const result = decodeBuild(payload, table, heroes);
    assert.equal(result.ok, false, payload);
    assert.ok(result.ok || result.reason === 'malformed', payload);
  }
});

test('a truncated board is malformed rather than a build with missing items', () => {
  let state = createEmptyState();
  for (let n = 0; n < SLOT_COUNT; n++) {
    state = buildReducer(state, { type: 'setSlot', slot: n, value: { k: 'id', id: ITEM_IDS[n + 60]! } });
  }
  const payload = encodeBuild(state, table, heroes);
  const [version, board] = payload.split('.');
  // Lop off the packed indices, keeping a header that claims fifteen items.
  const result = decodeBuild(`${version}.${board!.slice(0, 12)}`, table, heroes);
  assert.equal(result.ok, false);
});

test('a corrupt spell segment costs the spells and nothing else', () => {
  let state = buildReducer(createEmptyState(), { type: 'setSlot', slot: 0, value: { k: 'id', id: 'item_0009' } });
  state = buildReducer(state, { type: 'setSpell', spell: 0, value: { k: 'id', id: 'ability_2' } });
  const [version, board] = encodeBuild(state, table, heroes).split('.');

  const decoded = decodeBuild(`${version}.${board}.!!!`, table, heroes);
  assert.ok(decoded.ok, 'the items survive');
  assert.deepEqual(decoded.state.slots[0], { k: 'id', id: 'item_0009' });
  assert.equal(decoded.state.spells[0], null);
  assert.ok(decoded.warnings.some((w) => w.k === 'spells-truncated'));
});

test('a corrupt title segment costs the title and nothing else', () => {
  let state = buildReducer(createEmptyState(), { type: 'setSlot', slot: 0, value: { k: 'id', id: 'item_0009' } });
  state = buildReducer(state, { type: 'setTitle', title: 'kept?' });
  const [version, board, spells] = encodeBuild(state, table, heroes).split('.');

  const decoded = decodeBuild(`${version}.${board}.${spells ?? ''}.!!!`, table, heroes);
  assert.ok(decoded.ok);
  assert.deepEqual(decoded.state.slots[0], { k: 'id', id: 'item_0009' });
  assert.equal(decoded.state.title, null);
  assert.ok(decoded.warnings.some((w) => w.k === 'title-truncated'));
});

// --- the reducer ------------------------------------------------------------

test('changing hero clears the spells, because none of them are shared', () => {
  let state = buildReducer(createEmptyState(), { type: 'setHero', hero: 'npc_dota_hero_axe' });
  state = buildReducer(state, { type: 'setSpell', spell: 0, value: { k: 'id', id: 'ability_1' } });
  state = buildReducer(state, { type: 'setSpell', spell: 1, value: { k: 'id', id: 'ability_2' } });
  assert.equal(countSpells(state), 2);

  const switched = buildReducer(state, { type: 'setHero', hero: 'npc_dota_hero_lina' });
  assert.equal(countSpells(switched), 0);
});

test('changing hero leaves the items and the map alone', () => {
  let state = buildReducer(createEmptyState(), { type: 'setHero', hero: 'npc_dota_hero_axe' });
  state = buildReducer(state, { type: 'toggleMap', map: 'M001' });
  state = buildReducer(state, { type: 'setSlot', slot: 3, value: { k: 'id', id: 'item_0011' } });

  const switched = buildReducer(state, { type: 'setHero', hero: 'npc_dota_hero_lina' });
  assert.deepEqual(switched.maps, ['M001']);
  assert.deepEqual(switched.slots[3], { k: 'id', id: 'item_0011' });
});

test('setHero seeds the defaults it is given', () => {
  const state = buildReducer(createEmptyState(), {
    type: 'setHero',
    hero: 'npc_dota_hero_axe',
    defaults: [null, null, null, { k: 'id', id: 'ability_9' }, null, null, { k: 'id', id: 'ability_0' }],
  });
  assert.deepEqual(state.spells[3], { k: 'id', id: 'ability_9' });
  assert.deepEqual(state.spells[6], { k: 'id', id: 'ability_0' });
  assert.equal(state.spells[0], null);
});

test('moving an item onto an occupied slot swaps rather than destroys', () => {
  let state = buildReducer(createEmptyState(), { type: 'setSlot', slot: 3, value: { k: 'id', id: 'item_0011' } });
  state = buildReducer(state, { type: 'setSlot', slot: 4, value: { k: 'id', id: 'item_0012' } });

  const moved = buildReducer(state, { type: 'moveSlot', from: 3, to: 4 });
  assert.deepEqual(moved.slots[3], { k: 'id', id: 'item_0012' });
  assert.deepEqual(moved.slots[4], { k: 'id', id: 'item_0011' });
});

test('moving onto an empty slot leaves the source empty', () => {
  const state = buildReducer(createEmptyState(), { type: 'setSlot', slot: 3, value: { k: 'id', id: 'item_0011' } });
  const moved = buildReducer(state, { type: 'moveSlot', from: 3, to: 10 });
  assert.equal(moved.slots[3], null);
  assert.deepEqual(moved.slots[10], { k: 'id', id: 'item_0011' });
});

test('out-of-range slots and spells are ignored rather than growing the build', () => {
  const state = createEmptyState();
  for (const action of [
    { type: 'setSlot', slot: SLOT_COUNT, value: { k: 'id', id: 'item_0001' } } as const,
    { type: 'setSlot', slot: -1, value: { k: 'id', id: 'item_0001' } } as const,
    { type: 'setSpell', spell: SPELLS_PER_SECTION, value: { k: 'id', id: 'ability_1' } } as const,
    { type: 'moveSlot', from: 0, to: SLOT_COUNT } as const,
  ]) {
    const next = buildReducer(state, action);
    assert.equal(next.slots.length, SLOT_COUNT);
    assert.ok(isEmptyState(next), JSON.stringify(action));
  }
});

test('a title is trimmed, capped and normalised to null when blank', () => {
  const blank = buildReducer(createEmptyState(), { type: 'setTitle', title: '   ' });
  assert.equal(blank.title, null);

  const trimmed = buildReducer(createEmptyState(), { type: 'setTitle', title: '  spaced  ' });
  assert.equal(trimmed.title, 'spaced');

  const long = buildReducer(createEmptyState(), { type: 'setTitle', title: 'x'.repeat(MAX_TITLE + 20) });
  assert.equal(long.title?.length, MAX_TITLE);
});

test('clearAll returns an untouched build', () => {
  let state = buildReducer(createEmptyState(), { type: 'setHero', hero: 'npc_dota_hero_axe' });
  state = buildReducer(state, { type: 'toggleMap', map: 'M001' });
  state = buildReducer(state, { type: 'setSlot', slot: 0, value: { k: 'id', id: 'item_0001' } });
  assert.ok(isEmptyState(buildReducer(state, { type: 'clearAll' })));
});

// --- the layout -------------------------------------------------------------

test('the layout covers every slot exactly once', () => {
  const seen = new Set<number>();
  for (const group of LOADOUT_LAYOUT) {
    for (let i = 0; i < group.count; i++) {
      const slot = group.start + i;
      assert.equal(seen.has(slot), false, `slot ${slot} is claimed twice`);
      seen.add(slot);
    }
  }
  assert.equal(seen.size, SLOT_COUNT);
  for (let n = 0; n < SLOT_COUNT; n++) assert.ok(seen.has(n), `slot ${n} belongs to no group`);
});

test('slot indices are the ones every existing link was written against', () => {
  // Frozen. Changing any of these repoints every build already shared. A new
  // group may only be appended, which is what slot 15 is.
  assert.equal(SLOT_COUNT, 16);
  assert.equal(slotKindAt(0), SLOT_KIND.POTION);
  assert.equal(slotKindAt(2), SLOT_KIND.POTION);
  assert.equal(slotKindAt(3), SLOT_KIND.EQUIP);
  assert.equal(slotKindAt(8), SLOT_KIND.EQUIP);
  assert.equal(slotKindAt(9), SLOT_KIND.RUNE);
  assert.equal(slotKindAt(11), SLOT_KIND.RUNE);
  assert.equal(slotKindAt(12), SLOT_KIND.PET);
  assert.equal(slotKindAt(13), SLOT_KIND.NEUTRAL);
  assert.equal(slotKindAt(14), SLOT_KIND.BACKPACK);
  assert.equal(slotKindAt(15), SLOT_KIND.SOUL);
});

test('appending the soul slot did not widen the board, which is why it is still v8', () => {
  /*
   * The bitmap was already two whole bytes for fifteen slots, so slot 15 took
   * a bit that existed and was always zero. Encoding a board with nothing in
   * the soul slot has to produce exactly the bytes it produced before the slot
   * existed, or every link in the wild now points somewhere else.
   */
  const before = createEmptyState();
  before.slots[3] = { k: 'id', id: ITEM_IDS[5] as string };
  before.slots[14] = { k: 'id', id: ITEM_IDS[9] as string };
  const payload = encodeBuild(before, table);

  // Two bytes of bitmap, sixteen bits, and slot 15 is the last of them.
  assert.equal(Math.ceil(16 / 8), 2);
  assert.equal(payload.startsWith('8.'), true);

  const withSoul = createEmptyState();
  withSoul.slots[3] = before.slots[3] ?? null;
  withSoul.slots[14] = before.slots[14] ?? null;
  withSoul.slots[15] = { k: 'id', id: ITEM_IDS[11] as string };
  const soulPayload = encodeBuild(withSoul, table);

  assert.notEqual(soulPayload, payload);
  // Still v8: nothing about the layout makes an older reader wrong, it simply
  // stops one slot short. See the note in buildCodec.ts.
  assert.equal(soulPayload.startsWith('8.'), true);
  const back = decodeBuild(soulPayload, table);
  assert.equal(back.ok, true);
  assert.deepEqual(back.ok ? back.state.slots[15] : null, withSoul.slots[15]);
});

test('the neutral slot deliberately accepts more than its own kind', () => {
  assert.equal(slotKindAt(13), SLOT_KIND.NEUTRAL);
  assert.equal(slotAcceptsAt(13), SLOT_KIND.BACKPACK);
});

test('the five panels between them hold every group', () => {
  const grouped = [
    ...groupsInPanel('consumable'),
    ...groupsInPanel('gear'),
    ...groupsInPanel('carry'),
    ...groupsInPanel('rune'),
    ...groupsInPanel('soul'),
  ];
  assert.equal(grouped.length, LOADOUT_LAYOUT.length);
  assert.deepEqual(new Set(grouped.map((g) => g.key)), new Set(LOADOUT_LAYOUT.map((g) => g.key)));
});

test('the soul slot is offered in S2, and out of season only when it is filled', () => {
  const empty = createEmptyState();
  assert.deepEqual(visibleGroups('soul', empty.slots, 2).map((g) => g.key), ['soul']);
  // S1 does not have the slot, and a link carries no season at all.
  assert.deepEqual(visibleGroups('soul', empty.slots, 1), []);
  assert.deepEqual(visibleGroups('soul', empty.slots), []);

  // Whatever the season says, a slot holding something is drawn: a build that
  // moved back to S1, or a `#b=` link, must not silently lose what it carries.
  const filled = createEmptyState();
  filled.slots[15] = { k: 'id', id: 'item_H0001' };
  assert.deepEqual(visibleGroups('soul', filled.slots, 1).map((g) => g.key), ['soul']);
  assert.deepEqual(visibleGroups('soul', filled.slots).map((g) => g.key), ['soul']);
});

test('the hidden pet slot comes back the moment it holds something', () => {
  const empty = createEmptyState();
  assert.equal(visibleGroups('carry', empty.slots, 2).some((g) => g.key === 'pet'), false);
  const filled = createEmptyState();
  filled.slots[12] = { k: 'id', id: 'item_pet_001' };
  assert.equal(visibleGroups('carry', filled.slots, 2).some((g) => g.key === 'pet'), true);
});

test('the worn six are three to a row, and the carried two are their own block', () => {
  // The shape the game's own equipment panel uses. A 3x3 including the neutral
  // and backpack slots implied a ninth worn piece, which there is not.
  const [equip] = groupsInPanel('gear');
  assert.equal(equip?.key, 'equip');
  assert.equal(equip?.count, 6);
  assert.equal(equip?.columns, 3);

  // Neutral above, backpack below — layout order, not wire order.
  assert.deepEqual(
    groupsInPanel('carry')
      .filter((g) => g.hidden !== true)
      .map((g) => g.key),
    ['neutral', 'backpack'],
  );
});

test('a build names several rooms, and they round-trip in a stable order', () => {
  /*
   * The reason v8 exists: a guide covering both of a tier's rooms used to have
   * to pick one and be wrong for half its readers.
   */
  let state = createEmptyState();
  for (const map of ['M007', 'M001', 'M002']) state = buildReducer(state, { type: 'toggleMap', map });

  const decoded = roundTrip(state).state;
  assert.equal(decoded.maps.length, 3);
  assert.deepEqual([...decoded.maps].sort(), ['M001', 'M002', 'M007']);

  // Clicked in a different order, encoded identically: the words are sorted, so
  // two builds naming the same rooms share a link.
  let other = createEmptyState();
  for (const map of ['M002', 'M007', 'M001']) other = buildReducer(other, { type: 'toggleMap', map });
  assert.equal(encodeBuild(other, table, heroes), encodeBuild(state, table, heroes));
});

test('naming no room at all is a real answer', () => {
  // A build with a hero and no room. Not `createEmptyState()`, which encodes to
  // the empty string on purpose — see the empty-build tests above.
  const state = buildReducer(createEmptyState(), { type: 'setHero', hero: HERO_IDS[0]! });
  const decoded = roundTrip(state).state;
  assert.deepEqual(decoded.maps, []);
  assert.deepEqual(decoded.mapsUnknown, []);
});

test('toggling a room off removes only that one', () => {
  let state = createEmptyState();
  state = buildReducer(state, { type: 'toggleMap', map: 'M001' });
  state = buildReducer(state, { type: 'toggleMap', map: 'M002' });
  state = buildReducer(state, { type: 'toggleMap', map: 'M001' });
  assert.deepEqual(state.maps, ['M002']);
});

test('a v7 link still decodes, as the one room it named', () => {
  /*
   * Links are already shared, and the whole argument for the codec is that a
   * build travels without an account. v7's fixed map word sits exactly where
   * v8 keeps its count, so this is the same bytes read differently rather than
   * a second decoder.
   */
  const v8 = encodeBuild(buildReducer(createEmptyState(), { type: 'toggleMap', map: 'M007' }), table, heroes);
  assert.ok(v8.startsWith('8.'), `expected a v8 payload, got ${v8.slice(0, 4)}`);

  // A genuine v7 board: fingerprint, hero, one u16 map word, bitmap, no slots.
  const idx = heroes.mapIds.indexOf('M007');
  assert.ok(idx > 0);
  const board = new Uint8Array([
    (table.fingerprint >> 8) & 0xff,
    table.fingerprint & 0xff,
    0,
    (idx >> 8) & 0xff,
    idx & 0xff,
    0,
    0,
  ]);
  const v7 = `7.${b64(board)}`;

  const decoded = decodeBuild(v7, table, heroes);
  assert.ok(decoded.ok, decoded.ok ? '' : decoded.reason);
  if (decoded.ok) assert.deepEqual(decoded.state.maps, ['M007']);
});

test('a v7 link re-encodes as v8, keeping its room', () => {
  // Opening an old link and saving it is how a build moves forward a version.
  const idx = heroes.mapIds.indexOf('M002');
  const board = new Uint8Array([
    (table.fingerprint >> 8) & 0xff,
    table.fingerprint & 0xff,
    0,
    (idx >> 8) & 0xff,
    idx & 0xff,
    0,
    0,
  ]);
  const decoded = decodeBuild(`7.${b64(board)}`, table, heroes);
  assert.ok(decoded.ok);
  if (!decoded.ok) return;

  const again = encodeBuild(decoded.state, table, heroes);
  assert.ok(again.startsWith('8.'));
  const back = decodeBuild(again, table, heroes);
  assert.ok(back.ok);
  if (back.ok) assert.deepEqual(back.state.maps, ['M002']);
});

