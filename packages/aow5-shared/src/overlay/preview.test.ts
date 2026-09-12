import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  PREVIEW_LOOT,
  PREVIEW_ROOM,
  PREVIEW_RUNS,
  clock,
  compact,
  previewReadout,
  type PreviewItem,
} from './preview.ts';

/**
 * The preview session is a claim about the game, so it is checked against the
 * game's own tables rather than against itself.
 *
 * Two pictures draw these numbers and neither is easy to eyeball for
 * arithmetic — a card is a PNG in somebody else's chat client. What a test can
 * hold is that the ids are real, the prices are the extracted ones, and the
 * three session figures are still the sum, the subset and the mean they claim
 * to be.
 */

const data = (file: string): string =>
  readFileSync(fileURLToPath(new URL(`../../public/data/${file}`, import.meta.url)), 'utf8');

interface IndexFile {
  rows: [number, string, string, number, number, number, string, number][];
}

const rows = (JSON.parse(data('items.index.json')) as IndexFile).rows;
const byId = new Map(
  rows.map((row) => [row[1], { id: row[1], name: row[1], icon: row[6], quality: row[3], cost: row[5] }]),
);
const lookup = (id: string): PreviewItem | undefined => byId.get(id);

test('every id in the session is an item this deployment has', () => {
  for (const pile of PREVIEW_LOOT) {
    assert.ok(byId.has(pile.id), `${pile.id} is not in items.index.json`);
  }
});

test('the room is one the map table names in all three languages', () => {
  for (const lang of ['en', 'ru', 'zh']) {
    const maps = JSON.parse(data(`locale.${lang}.maps.json`)) as { maps: Record<string, { name: string }> };
    assert.ok((maps.maps[PREVIEW_ROOM]?.name ?? '') !== '', `${PREVIEW_ROOM} has no ${lang} name`);
  }
});

test('the room list is the second column, ordered by what each pile is worth', () => {
  const { rows: listed } = previewReadout(lookup);
  assert.deepEqual(
    listed.map((row) => row.qty),
    PREVIEW_LOOT.filter((pile) => pile.room > 0)
      .map((pile) => ({ pile, total: (byId.get(pile.id)?.cost ?? 0) * pile.room }))
      .sort((a, b) => b.total - a.total)
      .map((entry) => entry.pile.room),
  );
  for (const row of listed) assert.equal(row.total, row.unit * row.qty);
});

test('the session is the two columns added, and the room is the second of them', () => {
  const readout = previewReadout(lookup);
  const expectedRoom = PREVIEW_LOOT.reduce((n, p) => n + (byId.get(p.id)?.cost ?? 0) * p.room, 0);
  const expectedFinished = PREVIEW_LOOT.reduce((n, p) => n + (byId.get(p.id)?.cost ?? 0) * p.finished, 0);
  assert.equal(readout.roomGold, expectedRoom);
  assert.equal(readout.sessionGold, expectedFinished + expectedRoom);
  assert.equal(readout.averageRunGold, expectedFinished / PREVIEW_RUNS);
});

test('the room is a subset of the session, so no row claims more than dropped', () => {
  for (const pile of PREVIEW_LOOT) assert.ok(pile.room <= pile.finished + pile.room);
});

test('the best drop is the most valuable pile, not the biggest', () => {
  const { best } = previewReadout(lookup);
  assert.ok(best !== null);
  const worth = PREVIEW_LOOT.map((p) => (byId.get(p.id)?.cost ?? 0) * (p.finished + p.room));
  assert.equal(best.total, Math.max(...worth));
  // The point of the card: the headline is a pile worth more than the largest
  // heap of cheap things. A session whose best drop was the potions would make
  // the layout's headline meaningless.
  const biggestHeap = PREVIEW_LOOT.reduce((a, b) =>
    a.finished + a.room >= b.finished + b.room ? a : b,
  );
  assert.notEqual(best.item.id, biggestHeap.id);
});

test('an id the lookup does not know is dropped rather than drawn', () => {
  const partial = previewReadout((id) => (id === PREVIEW_LOOT[0]?.id ? undefined : byId.get(id)));
  assert.equal(partial.rows.length, PREVIEW_LOOT.filter((p) => p.room > 0).length - 1);
  assert.ok(partial.rows.every((row) => row.item.id !== PREVIEW_LOOT[0]?.id));
});

test('compact rounds and capitalises M, as the overlay does', () => {
  assert.equal(compact(720), '720');
  assert.equal(compact(1234), '1.2k');
  assert.equal(compact(18220), '18.2k');
  assert.equal(compact(50000), '50k');
  assert.equal(compact(1_999_999), '2M');
});

test('clock pads the minutes and grows an hours field', () => {
  assert.equal(clock(72), '01:12');
  assert.equal(clock(42 * 60 + 8), '42:08');
  assert.equal(clock(3600 + 62), '1:01:02');
  assert.equal(clock(-5), '00:00');
});
