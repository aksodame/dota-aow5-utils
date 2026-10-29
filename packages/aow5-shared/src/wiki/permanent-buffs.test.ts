import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { ItemsExtraFile } from './items-extra.ts';
import { PERMANENT_BUFFS, permanentBuffPool, permanentBuffRows } from './permanent-buffs.ts';

/** The curated permanent consumables, against the pak's own item and text data. */

const PUBLIC = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'public');
const read = <T>(rel: string): T => JSON.parse(readFileSync(join(PUBLIC, rel), 'utf8')) as T;

const index = read<{ rows: unknown[][] }>('data/items.index.json');
const ids = new Set(index.rows.map((row) => String(row[1])));
const extra = read<ItemsExtraFile>('data/wiki/items-extra.json');
const en = read<Record<string, { descPlain?: string }>>('data/locale.en.details.json');
const ru = read<Record<string, { descPlain?: string }>>('data/locale.ru.details.json');
const desc = (file: Record<string, { descPlain?: string }>, id: string) => file[id]?.descPlain ?? '';

test('every curated buff is a real item with a use limit and a permanent text', () => {
  for (const buff of PERMANENT_BUFFS) {
    assert.ok(ids.has(buff.id), `${buff.id} is in the catalogue`);
    const max = extra.items[buff.id]?.useMax;
    assert.ok(max !== undefined && max > 0, `${buff.id} has use_max`);
    const text = `${desc(en, buff.id)} ${desc(ru, buff.id)}`;
    assert.match(text, /permanent|навсегда/i, `${buff.id} says it is permanent`);
    assert.ok(Object.keys(buff.perUse).length > 0, `${buff.id} has an effect`);
  }
});

test('counts clamp to use_max and scale the pool', () => {
  const rows = permanentBuffRows(extra, { item_P207: 99, item_P207_2: 2, item_M500: -3 });
  const p207 = rows.find((r) => r.id === 'item_P207')!;
  assert.equal(p207.max, 5);
  assert.equal(p207.used, 5);
  const m500 = rows.find((r) => r.id === 'item_M500')!;
  assert.equal(m500.used, 0);
  assert.equal(permanentBuffPool([{ ...p207, used: 2 }]).bonus_health, 50);
});

test('permanent potions that move panel stats are all listed', () => {
  const listed = new Set(PERMANENT_BUFFS.map((buff) => buff.id));
  for (const id of ['item_P220', 'item_P221', 'item_P222', 'item_P223', 'item_P274']) {
    assert.ok(listed.has(id), `${id} is in the permanent buffs list`);
  }
});

test('the page gets the whole list even with nothing used', () => {
  const rows = permanentBuffRows(extra, {});
  assert.equal(rows.length, PERMANENT_BUFFS.length);
  assert.ok(rows.every((r) => r.used === 0 && r.max > 0));
  assert.deepEqual(permanentBuffPool(rows), {});
});
