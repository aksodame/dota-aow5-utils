import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyState, encodeBuild, groupsInPanel } from 'aow5-shared/codec';
import { ABILITY_SLOTS, SLOT_KIND } from 'aow5-shared/types';
import { ID_TABLE, HERO_TABLE } from '../codec/tables.ts';
import { abilityName, decodeStored, headlineSoul, mainSpellId, mainSpellName } from './names.ts';

import heroes from 'aow5-shared/public/data/heroes.json' with { type: 'json' };
import itemsIndex from 'aow5-shared/public/data/items.index.json' with { type: 'json' };
import itemNames from 'aow5-shared/public/data/locale.en.names.json' with { type: 'json' };

/**
 * The card's headline, and the one thing on it that is not an ability.
 *
 * A Life Soul takes over the `f` key, so a card whose headline is `f` has to
 * name and draw the soul. The server decodes its own payloads and never reads
 * the page it is making a picture of, so this is the only thing keeping the two
 * from disagreeing — see `equippedSoul` in the webapp for the other half.
 */

const SOUL_SLOT = groupsInPanel('soul')[0]?.start ?? -1;
const SOUL_ID = itemsIndex.rows.find((row) => (Number(row[7]) & SLOT_KIND.SOUL) !== 0)?.[1] as string | undefined;
const HERO = heroes.heroes[0]!;
const HEAL = (HERO.bySlot as Record<string, string[] | undefined>)['f']?.[0];

/** A build wearing a soul, with the heal it stands in for still on `f`. */
function wearing(soulId: string) {
  const state = createEmptyState();
  state.hero = HERO.id;
  if (HEAL !== undefined) state.spells[ABILITY_SLOTS.indexOf('f')] = { k: 'id', id: HEAL };
  state.slots[SOUL_SLOT] = { k: 'id', id: soulId };
  return state;
}

test('the emitted tables still carry a Life Soul and a slot to wear it in', () => {
  assert.ok(SOUL_SLOT >= 0, 'the layout names a soul slot');
  assert.ok(SOUL_ID !== undefined, 'the index flags at least one item as a Life Soul');
  assert.ok(HEAL !== undefined, 'every hero carries the shared heal on f');
});

test('a headline of f names the worn soul, not the heal every build has', () => {
  if (SOUL_ID === undefined || HEAL === undefined) return;
  const state = wearing(SOUL_ID);

  assert.equal(headlineSoul(state, 'f'), SOUL_ID);
  assert.equal(mainSpellName(state, 'f', 'en'), itemNames.names[SOUL_ID as keyof typeof itemNames.names]);
  assert.notEqual(mainSpellName(state, 'f', 'en'), abilityName(HEAL, 'en'));
  // The ability underneath is untouched: the soul is what that key does, not a
  // different thing encoded in the payload.
  assert.equal(mainSpellId(state, 'f'), HEAL);
});

test('no other headline is touched, and neither is a build wearing nothing', () => {
  if (SOUL_ID === undefined || HEAL === undefined) return;
  assert.equal(headlineSoul(wearing(SOUL_ID), 'q'), null);
  assert.equal(headlineSoul(wearing(SOUL_ID), null), null, 'the default headline is q');

  const bare = createEmptyState();
  bare.hero = HERO.id;
  bare.spells[ABILITY_SLOTS.indexOf('f')] = { k: 'id', id: HEAL };
  assert.equal(headlineSoul(bare, 'f'), null);
  assert.equal(mainSpellName(bare, 'f', 'en'), abilityName(HEAL, 'en'));
  assert.equal(headlineSoul(null, 'f'), null);
});

test('the soul survives the stored payload, which is all a card is given', () => {
  if (SOUL_ID === undefined) return;
  const stored = decodeStored(encodeBuild(wearing(SOUL_ID), ID_TABLE, HERO_TABLE));
  assert.equal(headlineSoul(stored, 'f'), SOUL_ID);
});
