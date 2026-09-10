import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_PAYLOAD_CHARS } from 'aow5-api-contract';
import { CODEC_VERSION, createEmptyState, encodeBuild, MAX_ENCODABLE_INDEX } from 'aow5-shared/codec';
import { categoryOfMap, isTierKey } from 'aow5-shared/data';
import { ABILITY_SLOTS } from 'aow5-shared/types';
import { HERO_TABLE, ID_TABLE, MAP_BY_ID } from './tables.ts';
import { normalisePayload, validatePayload } from './validatePayload.ts';

/** The first real map in the frozen table. Position 0 is the "no map" hole. */
const SAMPLE_MAP = HERO_TABLE.mapIds.find((id) => id !== '')!;

/** A loadout with two real items, one spell and a real map, as the editor makes it. */
function sampleBoard() {
  const state = createEmptyState();
  state.slots[0] = { k: 'id', id: ID_TABLE.ids[0]! };
  state.slots[1] = { k: 'id', id: ID_TABLE.ids[1]! };
  state.spells[0] = { k: 'id', id: HERO_TABLE.abilityIds[0]! };
  state.hero = HERO_TABLE.heroIds[0]!;
  state.maps = [SAMPLE_MAP];
  return { state, payload: encodeBuild(state, ID_TABLE, HERO_TABLE) };
}

test('a loadout the editor produced is accepted, and its facets describe it', () => {
  const { payload } = sampleBoard();
  const check = validatePayload(payload, ID_TABLE, HERO_TABLE);

  assert.equal(check.ok, true);
  if (!check.ok) return;
  assert.equal(check.facets.itemCount, 2);
  assert.equal(check.facets.spellCount, 1);
  assert.equal(check.facets.heroId, HERO_TABLE.heroIds[0]);
  assert.deepEqual(check.facets.mapIds, [SAMPLE_MAP]);
  assert.equal(check.facets.codecVersion, CODEC_VERSION);
});

test('the payload carries the rooms, and nothing about the tier', () => {
  /*
   * The tier moved off the payload and onto the build. A guide may cover a
   * whole tier without naming a room, and Event content sits on no tier — the
   * payload could express neither, because it only ever knew about rooms.
   */
  const { payload } = sampleBoard();
  const check = validatePayload(payload, ID_TABLE, HERO_TABLE);
  assert.equal(check.ok, true);
  if (!check.ok) return;
  assert.deepEqual(check.facets.mapIds, [SAMPLE_MAP]);
  assert.ok(!('tier' in check.facets), 'the tier belongs to the build, not to the payload');
});

test('a build names several rooms, and every one survives validation', () => {
  const real = HERO_TABLE.mapIds.filter((id) => id !== '').slice(0, 3);
  const state = createEmptyState();
  state.slots[0] = { k: 'id', id: ID_TABLE.ids[0]! };
  state.maps = [...real];

  const check = validatePayload(encodeBuild(state, ID_TABLE, HERO_TABLE), ID_TABLE, HERO_TABLE);
  assert.equal(check.ok, true);
  if (!check.ok) return;
  assert.deepEqual([...check.facets.mapIds].sort(), [...real].sort());
});

test('a build that names no room says so with an empty list', () => {
  const state = createEmptyState();
  state.slots[0] = { k: 'id', id: ID_TABLE.ids[0]! };
  const check = validatePayload(encodeBuild(state, ID_TABLE, HERO_TABLE), ID_TABLE, HERO_TABLE);

  assert.equal(check.ok, true);
  if (!check.ok) return;
  assert.deepEqual(check.facets.mapIds, []);
});

test('what is stored is what was sent, byte for byte', () => {
  const { payload } = sampleBoard();
  const check = validatePayload(payload, ID_TABLE, HERO_TABLE);
  assert.equal(check.ok, true);
  if (!check.ok) return;
  assert.equal(check.payload, payload);
});

test('an index this build cannot name survives instead of being rejected or rewritten', () => {
  // The whole fourth invariant in one case: a build saved by a newer deployment
  // names an item this table has never heard of. It must store unchanged, so
  // the link still decodes on the deployment that wrote it.
  const state = createEmptyState();
  state.slots[0] = { k: 'unknown', idx: MAX_ENCODABLE_INDEX };
  const payload = encodeBuild(state, ID_TABLE, HERO_TABLE);

  const check = validatePayload(payload, ID_TABLE, HERO_TABLE);
  assert.equal(check.ok, true);
  if (!check.ok) return;
  assert.equal(check.payload, payload, 'the unknown index must not be normalised away');
  assert.equal(check.facets.itemCount, 1, 'an unknown slot is still a filled slot');
});

test('the three URL shapes the editor has handed out all normalise to one stored form', () => {
  const { payload } = sampleBoard();
  assert.equal(normalisePayload(payload), payload);
  assert.equal(normalisePayload(`#b=${payload}`), payload);
  assert.equal(normalisePayload(`b=${payload}`), payload);
  assert.equal(normalisePayload(`  ${payload}  `), payload);
});

test('an empty payload is refused rather than stored as a blank build', () => {
  for (const raw of ['', '   ', '#b=', '#']) {
    const check = validatePayload(raw, ID_TABLE, HERO_TABLE);
    assert.equal(check.ok, false, `expected ${JSON.stringify(raw)} to be refused`);
    if (check.ok) return;
    assert.equal(check.rejection.reason, 'empty');
  }
});

test('length is checked before the decoder ever sees it', () => {
  const check = validatePayload(`${CODEC_VERSION}.` + 'A'.repeat(MAX_PAYLOAD_CHARS), ID_TABLE, HERO_TABLE);
  assert.equal(check.ok, false);
  if (check.ok) return;
  assert.equal(check.rejection.reason, 'too-long');
});

test('garbage is malformed, not a server error', () => {
  for (const raw of ['not-a-build', String(CODEC_VERSION), '.', `${CODEC_VERSION}.!!!!!!`]) {
    const check = validatePayload(raw, ID_TABLE, HERO_TABLE);
    assert.equal(check.ok, false, `expected ${JSON.stringify(raw)} to be refused`);
  }
});

test('a version from the future is named as such, so the error can say so', () => {
  const check = validatePayload('99.AAAA', ID_TABLE, HERO_TABLE);
  assert.equal(check.ok, false);
  if (check.ok) return;
  assert.equal(check.rejection.reason, 'unsupported-version');
  assert.equal(check.rejection.version, 99);
});

test('a superseded version is refused by name rather than half-read', () => {
  // v1-v6 encoded a board of up to nine sections. There is no honest way to
  // read one as a single loadout, so the API must reject it with a reason the
  // site can explain rather than store something it guessed at.
  for (const version of [1, 2, 3, 4, 5, 6]) {
    const check = validatePayload(`${version}.AAAAAAAAAAAA`, ID_TABLE, HERO_TABLE);
    assert.equal(check.ok, false, `v${version} must not be stored`);
    if (check.ok) return;
    assert.equal(check.rejection.reason, 'unsupported-version');
    assert.equal(check.rejection.version, version);
  }
});

test('the frozen map table is 1-based, with nothing claiming the reserved slot', () => {
  // The codec reads a map straight out of this array, so an off-by-one here
  // would file every build under its neighbour.
  assert.equal(HERO_TABLE.mapIds[0], '', 'position 0 is "no map chosen"');
  assert.ok(HERO_TABLE.mapIds.filter((id) => id !== '').length > 0);
  for (const [id, map] of MAP_BY_ID) {
    assert.ok(HERO_TABLE.mapIds.includes(id), `${id} is in the map table but has no frozen position`);
    assert.ok(isTierKey(categoryOfMap(map)), `${id} is filed under ${categoryOfMap(map)}`);
  }
});;

test('the facets say which ability keys hold a spell, for the headline to be checked against', () => {
  /*
   * What `mainSpell` is validated with. The rule the service enforces is that a
   * build cannot nominate a headline it does not have — so the seam worth
   * testing is that this list is the *filled* slots and nothing else.
   */
  const state = createEmptyState();
  state.hero = HERO_TABLE.heroIds[0]!;
  state.spells[0] = { k: 'id', id: HERO_TABLE.abilityIds[0]! };
  state.spells[3] = { k: 'id', id: HERO_TABLE.abilityIds[1]! };

  const check = validatePayload(encodeBuild(state, ID_TABLE, HERO_TABLE), ID_TABLE, HERO_TABLE);
  assert.equal(check.ok, true);
  if (!check.ok) return;

  assert.deepEqual(check.facets.spellKeys, [ABILITY_SLOTS[0], ABILITY_SLOTS[3]]);
  assert.equal(check.facets.spellCount, 2);
});

test('an unknown spell index still counts as a filled slot', () => {
  // A build from a deployment ahead of this one: the ability cannot be named,
  // but the author did choose something there, and a headline pointing at it is
  // a choice this server has no business refusing.
  const state = createEmptyState();
  state.hero = HERO_TABLE.heroIds[0]!;
  state.spells[1] = { k: 'unknown', idx: MAX_ENCODABLE_INDEX };

  const check = validatePayload(encodeBuild(state, ID_TABLE, HERO_TABLE), ID_TABLE, HERO_TABLE);
  assert.equal(check.ok, true);
  if (!check.ok) return;
  assert.deepEqual(check.facets.spellKeys, [ABILITY_SLOTS[1]]);
});
