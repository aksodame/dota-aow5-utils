import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_PAYLOAD_CHARS } from 'aow5-api-contract';
import { createEmptyState, encodeBuild, MAX_ENCODABLE_INDEX } from 'aow5-shared/codec';
import { HERO_TABLE, ID_TABLE } from './tables.ts';
import { normalisePayload, validatePayload } from './validatePayload.ts';

/** A board with two real items and one spell, encoded the way the planner does. */
function sampleBoard() {
  const state = createEmptyState();
  const first = state.sections[0];
  assert.ok(first, 'the empty state has at least one section');
  first.slots[0] = { k: 'id', id: ID_TABLE.ids[0]! };
  first.slots[1] = { k: 'id', id: ID_TABLE.ids[1]! };
  first.spells[0] = { k: 'id', id: HERO_TABLE.abilityIds[0]! };
  state.hero = HERO_TABLE.heroIds[0]!;
  return { state, payload: encodeBuild(state, ID_TABLE, HERO_TABLE) };
}

test('a board the planner produced is accepted, and its facets describe it', () => {
  const { state, payload } = sampleBoard();
  const check = validatePayload(payload, ID_TABLE, HERO_TABLE);

  assert.equal(check.ok, true);
  if (!check.ok) return;
  assert.equal(check.facets.itemCount, 2);
  assert.equal(check.facets.spellCount, 1);
  assert.equal(check.facets.heroId, HERO_TABLE.heroIds[0]);
  assert.equal(check.facets.sectionCount, state.sections.length);
  assert.equal(check.facets.codecVersion, 6);
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
  state.sections[0]!.slots[0] = { k: 'unknown', idx: MAX_ENCODABLE_INDEX };
  const payload = encodeBuild(state, ID_TABLE, HERO_TABLE);

  const check = validatePayload(payload, ID_TABLE, HERO_TABLE);
  assert.equal(check.ok, true);
  if (!check.ok) return;
  assert.equal(check.payload, payload, 'the unknown index must not be normalised away');
  assert.equal(check.facets.itemCount, 1, 'an unknown slot is still a filled slot');
});

test('the three URL shapes the planner has handed out all normalise to one stored form', () => {
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
  const check = validatePayload('6.' + 'A'.repeat(MAX_PAYLOAD_CHARS), ID_TABLE, HERO_TABLE);
  assert.equal(check.ok, false);
  if (check.ok) return;
  assert.equal(check.rejection.reason, 'too-long');
});

test('garbage is malformed, not a server error', () => {
  for (const raw of ['not-a-build', '6', '.', '6.!!!!!!']) {
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

test('every version the codec still supports is still accepted', () => {
  // Not a golden test — those live with the codec. This pins the weaker claim
  // the API depends on: nothing here narrows what decodeBuild will take.
  const { payload } = sampleBoard();
  const check = validatePayload(payload, ID_TABLE, HERO_TABLE);
  assert.equal(check.ok, true);
});
