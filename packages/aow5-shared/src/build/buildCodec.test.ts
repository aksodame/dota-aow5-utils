import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { base64UrlToBytes, bytesToBase64Url } from './base64url.ts';
import { BitWriter } from './bits.ts';
import {
  CODEC_VERSION,
  decodeBuild,
  encodeBuild,
  makeIdTable,
  type HeroTable,
  type IdTable,
} from './buildCodec.ts';
import {
  DEFAULT_SECTIONS,
  MAX_SECTIONS,
  MAX_SECTION_DESC,
  MAX_SECTION_NAME,
  SECTION_LAYOUT,
  SLOTS_PER_SECTION,
  buildReducer,
  countSpells,
  createEmptyState,
  spellDefaults,
  slotAcceptsAt,
  slotKindAt,
  type BuildState,
} from './buildState.ts';
import { SLOT_KIND } from '../types/items.ts';
import { ABILITY_SLOTS, ABILITY_SLOT_ORDER, SPELLS_PER_SECTION, type HeroesData } from '../types/heroes.ts';
import { rebuildAbilityTable } from '../data/loadData.ts';

/**
 * The codec is the one module whose output format must never break silently:
 * a regression here invalidates every link anyone has already shared. These run
 * against the real committed id table, not a fixture.
 */

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const ids = (JSON.parse(fs.readFileSync(path.join(ROOT, 'data/id-table.json'), 'utf8')) as { ids: string[] }).ids;
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/meta.json'), 'utf8')) as { idTableHash: string };
const table: IdTable = makeIdTable(ids, meta.idTableHash);

/** Same table with slot kinds attached, as the app builds it. */
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/items.index.json'), 'utf8')) as {
  rows: [number, string, string, number, number, number, string, number][];
};
const kinds = new Array<number>(ids.length).fill(0);
for (const row of index.rows) kinds[row[0]] = row[7];
const kindTable: IdTable = makeIdTable(ids, meta.idTableHash, kinds);

/** Deterministic PRNG so a failing property case is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const roundTrip = (state: BuildState) => {
  const encoded = encodeBuild(state, table);
  const decoded = decodeBuild(encoded, table);
  assert.equal(decoded.ok, true);
  return decoded as Extract<typeof decoded, { ok: true }>;
};

/** The real hero roster and ability table, exactly as the app rebuilds them. */
const heroesData = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/heroes.json'), 'utf8')) as HeroesData;
const abilityIds = rebuildAbilityTable(heroesData.abilities, heroesData.abilityTableLength);
const heroTable: HeroTable = { abilityIds, heroIds: heroesData.heroes.map((h) => h.id) };

const roundTripHero = (state: BuildState) => {
  const encoded = encodeBuild(state, table, heroTable);
  const decoded = decodeBuild(encoded, table, heroTable);
  assert.equal(decoded.ok, true);
  return decoded as Extract<typeof decoded, { ok: true }>;
};

test('id table is loaded and non-trivial', () => {
  assert.ok(ids.length > 1000, `expected a real id table, got ${ids.length} entries`);
  assert.equal(new Set(ids).size, ids.length, 'id table must not contain duplicates');
});

test('a fresh board has the default number of sections', () => {
  const state = createEmptyState();
  assert.equal(state.sections.length, DEFAULT_SECTIONS);
  assert.equal(encodeBuild(state, table), '', 'an untouched board produces no hash');
  assert.deepEqual(decodeBuild('', table), { ok: true, state: createEmptyState(), warnings: [] });
});

test('a single item round-trips in a short URL', () => {
  const state = createEmptyState(2);
  state.sections[1]!.slots[2] = { k: 'id', id: ids[100]! };
  const encoded = encodeBuild(state, table);
  assert.deepEqual(roundTrip(state).state, state);
  assert.ok(encoded.length < 30, `expected a compact payload, got ${encoded.length} chars`);
});

test('section count round-trips for every allowed size', () => {
  for (let count = 1; count <= MAX_SECTIONS; count++) {
    const state = createEmptyState(count);
    // Put an item in the last section so the board is never "untouched".
    state.sections[count - 1]!.slots[0] = { k: 'id', id: ids[count]! };
    const decoded = roundTrip(state);
    assert.equal(decoded.state.sections.length, count, `section count ${count} did not survive`);
    assert.deepEqual(decoded.state, state);
  }
});

test('adding empty sections is preserved through a link', () => {
  // Expanding the board is a deliberate act, so it must survive sharing even
  // when the extra sections hold nothing.
  let state = createEmptyState();
  state = buildReducer(state, { type: 'addSection' });
  state = buildReducer(state, { type: 'addSection' });
  assert.equal(state.sections.length, DEFAULT_SECTIONS + 2);

  const encoded = encodeBuild(state, table);
  assert.notEqual(encoded, '', 'an expanded board is not an untouched board');
  assert.equal(roundTrip(state).state.sections.length, DEFAULT_SECTIONS + 2);
});

test('duplicating a section appends an independent copy', () => {
  let state = createEmptyState();
  state.sections[0]!.name = 'Core';
  state.sections[0]!.description = 'Rush these, then decide.';
  state.sections[0]!.slots[0] = { k: 'id', id: ids[5]! };
  state.sections[0]!.spells[0] = { k: 'unknown', idx: 7 };

  state = buildReducer(state, { type: 'duplicateSection', section: 0 });
  assert.equal(state.sections.length, DEFAULT_SECTIONS + 1);
  assert.deepEqual(state.sections[1], state.sections[0], 'the copy carries name, note, items and spells');
  assert.deepEqual(roundTrip(state).state, state);

  // Editing one must not reach into the other.
  state = buildReducer(state, { type: 'clearSlot', section: 1, slot: 0 });
  assert.deepEqual(state.sections[0]!.slots[0], { k: 'id', id: ids[5]! });
  assert.equal(state.sections[1]!.slots[0], null);
});

test('duplicating is refused at the section ceiling and for a section that is not there', () => {
  const full = createEmptyState(MAX_SECTIONS);
  assert.equal(buildReducer(full, { type: 'duplicateSection', section: 0 }), full);

  const state = createEmptyState();
  assert.equal(buildReducer(state, { type: 'duplicateSection', section: 4 }), state);
  assert.equal(buildReducer(state, { type: 'duplicateSection', section: -1 }), state);
});

test('a small board is cheaper than the old fixed nine-section format', () => {
  const state = createEmptyState(2);
  state.sections[0]!.slots[0] = { k: 'id', id: ids[1]! };
  const slots = encodeBuild(state, table).split('.')[1]!;
  const bytes = base64UrlToBytes(slots);
  // 2 fingerprint + 1 count + ceil(2*15/8)=4 bitmap + 2 packed.
  const expected = 3 + Math.ceil((2 * SLOTS_PER_SECTION) / 8) + 2;
  assert.equal(bytes.length, expected, 'a two-section board should not pay for nine sections of bitmap');
  const nineSectionHeader = 3 + Math.ceil((9 * SLOTS_PER_SECTION) / 8);
  assert.ok(bytes.length < nineSectionHeader, 'small boards must cost less than a full one');
});

test('a full nine-section board round-trips and stays inside a shareable URL', () => {
  const state = createEmptyState(MAX_SECTIONS);
  let n = 0;
  for (let s = 0; s < MAX_SECTIONS; s++) {
    for (let i = 0; i < SLOTS_PER_SECTION; i++) {
      state.sections[s]!.slots[i] = { k: 'id', id: ids[(n++ * 17) % ids.length]! };
    }
  }
  const slotsSegment = encodeBuild(state, table).split('.')[1] ?? '';
  assert.deepEqual(roundTrip(state).state, state);
  // 9 sections x 15 slots, every one filled: the absolute worst case.
  assert.ok(slotsSegment.length < 320, `slots segment ${slotsSegment.length} chars, expected < 320`);
});

test('renamed sections round-trip, including Cyrillic and emoji', () => {
  const state = createEmptyState(MAX_SECTIONS);
  for (let s = 0; s < MAX_SECTIONS; s++) {
    state.sections[s]!.name = `Сборка ${s} 🗡️🛡️ `.padEnd(MAX_SECTION_NAME, 'x').slice(0, MAX_SECTION_NAME);
    state.sections[s]!.slots[0] = { k: 'id', id: ids[s * 31]! };
  }
  const encoded = encodeBuild(state, table);
  assert.deepEqual(roundTrip(state).state, state);
  // The worst realistic case must still fit comfortably in a browser URL.
  assert.ok(encoded.length < 1400, `encoded ${encoded.length} chars, expected < 1400`);
});

test('section names survive URL-significant characters', () => {
  const state = createEmptyState(2);
  state.sections[0]!.name = '# & ? / % + = <tag>';
  state.sections[1]!.name = 'a b  c\ttab';
  const { state: out } = roundTrip(state);
  assert.equal(out.sections[0]!.name, '# & ? / % + = <tag>');
  assert.equal(out.sections[1]!.name, 'a b  c\ttab');
});

test('an unknown index is preserved and re-encodes byte-identically', () => {
  const unknownIdx = ids.length + 5;
  const state = createEmptyState();
  state.sections[0]!.slots[0] = { k: 'unknown', idx: unknownIdx };
  const encoded = encodeBuild(state, table);

  const decoded = decodeBuild(encoded, table);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  assert.deepEqual(decoded.state.sections[0]!.slots[0], { k: 'unknown', idx: unknownIdx });
  assert.ok(decoded.warnings.some((w) => w.k === 'unknown-index'));

  // Sharing a link onward from an older build must not corrupt it.
  assert.equal(encodeBuild(decoded.state, table), encoded);
});

test('a hole in the table (non-playable item) decodes as unknown, not as an empty id', () => {
  // The app rebuilds the table from the playable-only index, so positions
  // belonging to hidden or disabled items are empty strings.
  const sparse = ids.slice();
  const holeAt = 42;
  sparse[holeAt] = '';
  const sparseTable = makeIdTable(sparse, meta.idTableHash);

  const state = createEmptyState(2);
  state.sections[1]!.slots[1] = { k: 'unknown', idx: holeAt };
  const encoded = encodeBuild(state, sparseTable);

  const decoded = decodeBuild(encoded, sparseTable);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  assert.deepEqual(decoded.state.sections[1]!.slots[1], { k: 'unknown', idx: holeAt });
  assert.equal(encodeBuild(decoded.state, sparseTable), encoded, 're-encode must be lossless');
});

test('a mismatched table fingerprint warns but still decodes the items', () => {
  const state = createEmptyState(2);
  state.sections[1]!.slots[3] = { k: 'id', id: ids[7]! };
  const encoded = encodeBuild(state, table);

  const otherTable = makeIdTable(ids, 'dead' + meta.idTableHash.slice(4));
  const decoded = decodeBuild(encoded, otherTable);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  assert.ok(decoded.warnings.some((w) => w.k === 'table-mismatch'));
  assert.deepEqual(decoded.state.sections[1]!.slots[3], { k: 'id', id: ids[7]! });
});

test('a future codec version is reported, not thrown', () => {
  const decoded = decodeBuild('99.AAAA', table);
  assert.deepEqual(decoded, { ok: false, reason: 'unsupported-version', version: 99 });
});

test('malformed payloads fail cleanly', () => {
  for (const bad of ['2.!!!!', '2.AA', 'nope', '2', '.', '2.']) {
    const decoded = decodeBuild(bad, table);
    assert.equal(decoded.ok, false, `expected ${JSON.stringify(bad)} to be rejected`);
    if (!decoded.ok) assert.equal(decoded.reason, 'malformed');
  }
});

test('an out-of-range section count is rejected', () => {
  const state = createEmptyState();
  state.sections[0]!.slots[0] = { k: 'id', id: ids[0]! };
  const bytes = base64UrlToBytes(encodeBuild(state, table).split('.')[1]!);
  for (const bogus of [0, 10, 255]) {
    const tampered = Uint8Array.from(bytes);
    tampered[2] = bogus;
    let b64 = '';
    for (const byte of tampered) b64 += String.fromCharCode(byte);
    const payload = btoa(b64).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    const decoded = decodeBuild(`2.${payload}`, table);
    assert.equal(decoded.ok, false, `section count ${bogus} should be rejected`);
  }
});

test('a corrupt names segment keeps the items', () => {
  const state = createEmptyState();
  state.sections[0]!.slots[0] = { k: 'id', id: ids[3]! };
  state.sections[0]!.name = 'Core';
  const encoded = encodeBuild(state, table);
  const truncated = `${encoded.slice(0, encoded.lastIndexOf('.') + 1)}AAAA`;

  const decoded = decodeBuild(truncated, table);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  assert.deepEqual(decoded.state.sections[0]!.slots[0], { k: 'id', id: ids[3]! });
});

test('property: 500 random boards round-trip exactly', () => {
  const rand = mulberry32(0x5eed);
  for (let iter = 0; iter < 500; iter++) {
    const count = 1 + Math.floor(rand() * MAX_SECTIONS);
    const state = createEmptyState(count);
    let touched = false;
    for (let s = 0; s < count; s++) {
      if (rand() < 0.3) {
        state.sections[s]!.name = `S${s}-${Math.floor(rand() * 1e6).toString(36)}`;
        touched = true;
      }
      for (let i = 0; i < SLOTS_PER_SECTION; i++) {
        if (rand() < 0.45) {
          state.sections[s]!.slots[i] = { k: 'id', id: ids[Math.floor(rand() * ids.length)]! };
          touched = true;
        }
      }
    }
    // An untouched default board encodes to '' by design; skip those.
    if (!touched && count === DEFAULT_SECTIONS) continue;
    assert.deepEqual(roundTrip(state).state, state, `mismatch on iteration ${iter}`);
  }
});

test('section descriptions round-trip', () => {
  const state = createEmptyState(3);
  state.sections[0]!.name = 'Core';
  state.sections[0]!.description = 'Rush these three, then decide.';
  state.sections[2]!.description = 'Свап под физический урон 🛡️';
  state.sections[1]!.slots[3] = { k: 'id', id: ids[10]! };

  const decoded = roundTrip(state);
  assert.deepEqual(decoded.state, state);
  assert.equal(decoded.state.sections[0]!.description, 'Rush these three, then decide.');
  assert.equal(decoded.state.sections[2]!.description, 'Свап под физический урон 🛡️');
  assert.equal(decoded.state.sections[1]!.description, null, 'undescribed sections stay null');
});

test('a description alone makes a board shareable', () => {
  // No items and no names, but the note is real content and must survive.
  const state = createEmptyState(2);
  state.sections[1]!.description = 'Notes only.';
  const encoded = encodeBuild(state, table);
  assert.notEqual(encoded, '', 'a described board is not an untouched board');

  // With no names, the names segment is present but empty: `4.slots..descs`.
  const parts = encoded.split('.');
  assert.equal(parts.length, 4);
  assert.equal(parts[2], '', 'empty names segment is held open');
  assert.deepEqual(roundTrip(state).state, state);
});

test('descriptions are absent from the URL when unused', () => {
  const state = createEmptyState();
  state.sections[0]!.name = 'Core';
  state.sections[0]!.slots[0] = { k: 'id', id: ids[5]! };
  assert.equal(encodeBuild(state, table).split('.').length, 3, 'no trailing empty description segment');
});

test('a corrupt description segment keeps the items and the names', () => {
  const state = createEmptyState();
  state.sections[0]!.name = 'Core';
  state.sections[0]!.description = 'note';
  state.sections[0]!.slots[3] = { k: 'id', id: ids[9]! };
  const parts = encodeBuild(state, table).split('.');
  const decoded = decodeBuild(`${parts[0]}.${parts[1]}.${parts[2]}.AAAA`, table);

  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  assert.deepEqual(decoded.state.sections[0]!.slots[3], { k: 'id', id: ids[9]! });
  assert.equal(decoded.state.sections[0]!.name, 'Core');
});

test('a fully annotated board still fits in a browser URL', () => {
  // The worst realistic case: nine sections, all named and described to the cap.
  const state = createEmptyState(MAX_SECTIONS);
  for (let s = 0; s < MAX_SECTIONS; s++) {
    state.sections[s]!.name = 'Имя раздела 🗡️'.padEnd(MAX_SECTION_NAME, 'x').slice(0, MAX_SECTION_NAME);
    state.sections[s]!.description = 'Описание '.repeat(30).slice(0, MAX_SECTION_DESC);
    state.sections[s]!.slots[0] = { k: 'id', id: ids[s]! };
  }
  const encoded = encodeBuild(state, table);
  assert.deepEqual(roundTrip(state).state, state);
  // Comfortably under the ~2000-char floor of the strictest browsers, though
  // past what chat clients render — which is what the UI warns about.
  assert.ok(encoded.length < 6000, `encoded ${encoded.length} chars`);
});

test('v3 links still decode now that descriptions exist', () => {
  // Captured before the description segment was added.
  const v3 = '3.wsQCmEIgGFZgAQAj_0thN2NQAA.AAMKRWFybHkgZ2FtZQjQr9C00YDQvg';
  const decoded = decodeBuild(v3, kindTable);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;

  assert.equal(decoded.state.sections.length, 2);
  assert.equal(decoded.state.sections[0]!.name, 'Early game');
  assert.equal(decoded.state.sections[1]!.name, 'Ядро');
  // v3 slots were already typed, so positions are preserved exactly.
  assert.deepEqual(decoded.state.sections[0]!.slots[0], { k: 'id', id: 'item_P000' });
  assert.deepEqual(decoded.state.sections[0]!.slots[9], { k: 'id', id: 'item_G001' });
  assert.deepEqual(decoded.state.sections[1]!.slots[12], { k: 'id', id: 'item_pet_cat_god' });
  assert.equal(decoded.state.sections[0]!.description, null);
  // v3 slots were typed, so nothing is re-homed. A fingerprint mismatch is
  // expected and harmless here: the fixture predates later item appends, and
  // reporting that is the codec working as designed.
  assert.equal(
    decoded.warnings.filter((w) => w.k !== 'table-mismatch').length,
    0,
    'a v3 link needs no migration',
  );
  assert.equal(decoded.state.hero, null, 'v3 predates heroes');
  assert.ok(
    decoded.state.sections.every((s) => s.spells.every((v) => v === null)),
    'v3 predates spells',
  );
});

test('golden vector: a fixed board encodes to exact bytes', () => {
  // If this fails, the wire format changed and every link anyone has already
  // shared now decodes differently. Bump CODEC_VERSION rather than editing the
  // expectations below.
  //
  // The leading two bytes are the id-table fingerprint, which legitimately
  // moves when items are appended, so this pins everything after it by value
  // and checks the fingerprint against the table hash instead.
  const state = createEmptyState(2);
  state.sections[0]!.slots[0] = { k: 'id', id: ids[0]! };
  // Last slot of the last section: 2 sections x 15 slots -> slot index 29.
  state.sections[1]!.slots[SLOTS_PER_SECTION - 1] = { k: 'id', id: ids[1]! };
  state.sections[0]!.name = 'Core';

  const encoded = encodeBuild(state, table);
  const [version, slots, names] = encoded.split('.');
  assert.equal(version, String(CODEC_VERSION));

  const slotBytes = base64UrlToBytes(slots!);
  // 2 fingerprint + 1 count + 4 bitmap (30 slots) + 3 packed index bytes.
  assert.equal(slotBytes.length, 10);
  assert.equal(
    ((slotBytes[0]! << 8) | slotBytes[1]!).toString(16).padStart(4, '0'),
    meta.idTableHash.slice(0, 4),
    'fingerprint is the first 16 bits of the id table hash',
  );
  assert.equal(slotBytes[2], 2, 'section count');
  // Occupancy bitmap over 30 slots: only slot 0 and slot 29 are set, MSB-first.
  assert.deepEqual([...slotBytes.subarray(3, 7)], [0x80, 0x00, 0x00, 0x04]);
  // Indices 0 and 1 packed as 12-bit big-endian values.
  assert.deepEqual([...slotBytes.subarray(7)], [0x00, 0x00, 0x01]);

  // Names: u16be bitmap with only section 0 set, varint length 4, then "Core".
  assert.equal(names, 'AAEEQ29yZQ');
  assert.deepEqual([...base64UrlToBytes(names!)], [0x00, 0x01, 0x04, 0x43, 0x6f, 0x72, 0x65]);
  // No descriptions set, so the segment is absent entirely.
  assert.equal(encoded.split('.').length, 3);

  const decoded = decodeBuild(encoded, table);
  assert.equal(decoded.ok, true);
  if (decoded.ok) assert.deepEqual(decoded.state, state);
});

test('v1 links still decode, with items re-homed into typed slots', () => {
  // Captured from the build before slots were typed. v1 boards were nine flat
  // sections; each item is now placed in the first slot of its section that
  // accepts its kind, so a potion cannot land in an equipment slot.
  const v1 = '1.wsTgYAAAAIAAAAAAAEtgAgARN2Vz_w.ABMKRWFybHkgZ2FtZQjQr9C00YDQvgZHbHlwaHM';
  const decoded = decodeBuild(v1, kindTable);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;

  const { sections } = decoded.state;
  assert.equal(sections.length, 5, 'trailing empty sections are trimmed');
  assert.equal(sections[0]!.name, 'Early game');
  assert.equal(sections[1]!.name, 'Ядро');
  assert.equal(sections[4]!.name, 'Glyphs');

  const at = (section: number, slot: number) => {
    const v = sections[section]!.slots[slot];
    return v && v.k === 'id' ? v.id : null;
  };

  // Equipment lands in the equipment block, which starts at slot 3.
  assert.equal(at(0, 3), 'item_0101');
  assert.equal(at(0, 4), 'item_0100');
  assert.equal(at(1, 3), 'item_0425');
  // A rune lands in the rune block, which starts at slot 9.
  assert.equal(at(4, 9), 'item_G001');
  // Materials and stones fit nowhere specific, so they go to the backpack.
  assert.equal(at(0, 14), 'item_M001');
  assert.equal(at(1, 14), 'item_s_0305');

  // Nothing was lost, and the move is reported rather than silent.
  const moved = decoded.warnings.find((w) => w.k === 'migrated-layout');
  assert.ok(moved && moved.k === 'migrated-layout');
  if (moved?.k === 'migrated-layout') {
    assert.equal(moved.moved, 6);
    assert.equal(moved.dropped, 0);
  }
});

test('every item of a v1 link survives migration even without kind data', () => {
  // Without kinds the codec cannot match types, but it must still not drop
  // anything: items fall into the first free slot instead.
  const v1 = '1.wsTgYAAAAIAAAAAAAEtgAgARN2Vz_w.ABMKRWFybHkgZ2FtZQjQr9C00YDQvgZHbHlwaHM';
  const decoded = decodeBuild(v1, table);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  const placed = decoded.state.sections.reduce((n, s) => n + s.slots.filter(Boolean).length, 0);
  assert.equal(placed, 6);
});

test('a v2 link migrates its nine flat slots into the typed layout', () => {
  // v2 kept nine untyped slots but added the section count byte.
  const v2 = '2.wsQC4GAAS2ACABE3ZXA.AAMKRWFybHkgZ2FtZQjQr9C00YDQvg';
  const decoded = decodeBuild(v2, kindTable);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;

  assert.equal(decoded.state.sections.length, 2);
  assert.equal(decoded.state.sections[0]!.name, 'Early game');
  const placed = decoded.state.sections.reduce((n, s) => n + s.slots.filter(Boolean).length, 0);
  assert.equal(placed, 5, 'all five items survive');

  // Each landed somewhere its kind allows.
  for (const section of decoded.state.sections) {
    section.slots.forEach((v, slot) => {
      if (!v || v.k !== 'id') return;
      const item = kinds[ids.indexOf(v.id)] ?? 0;
      assert.ok((item & slotKindAt(slot)) !== 0, `${v.id} does not belong in slot ${slot}`);
    });
  }
});

test('hiding a group leaves every slot position untouched', () => {
  // Groups can be hidden from the UI, but their slots stay in the layout:
  // shifting an index would silently repoint every link ever shared.
  assert.equal(SLOTS_PER_SECTION, 15);
  assert.equal(slotKindAt(12), SLOT_KIND.PET);
  assert.equal(slotKindAt(13), SLOT_KIND.NEUTRAL);
  assert.equal(slotKindAt(14), SLOT_KIND.BACKPACK);

  const hidden = SECTION_LAYOUT.filter((g) => g.hidden);
  assert.ok(hidden.length > 0, 'expected at least one hidden group to exercise this');

  // A hidden slot still round-trips, so nothing an old link carries is lost.
  const state = createEmptyState();
  state.sections[0]!.slots[12] = { k: 'id', id: 'item_pet_cat_god' };
  assert.deepEqual(roundTrip(state).state, state);
});

test('a group can accept more than its own kind', () => {
  // The neutral slot is deliberately unrestricted for now, but its canonical
  // kind is unchanged so legacy migration still treats it as the neutral slot.
  assert.equal(slotAcceptsAt(13), SLOT_KIND.BACKPACK);
  assert.equal(slotKindAt(13), SLOT_KIND.NEUTRAL);
  // Restricted groups are untouched by that.
  assert.equal(slotAcceptsAt(0), SLOT_KIND.POTION);
  assert.equal(slotAcceptsAt(3), SLOT_KIND.EQUIP);
  assert.equal(slotAcceptsAt(9), SLOT_KIND.RUNE);
});

test('slot kinds cover every group in the layout', () => {
  // A guard on the pipeline: if a category ever emptied out, its slots would
  // be unfillable and the picker would show nothing.
  for (const kind of [SLOT_KIND.POTION, SLOT_KIND.EQUIP, SLOT_KIND.RUNE, SLOT_KIND.PET, SLOT_KIND.NEUTRAL]) {
    assert.ok(kinds.some((k) => (k & kind) !== 0), `no item accepts slot kind ${kind}`);
  }
});
// --- heroes and spells ------------------------------------------------------

test('hero data is loaded and matches the frozen roster', () => {
  assert.ok(heroesData.heroes.length >= 1, 'expected a real roster');
  heroesData.heroes.forEach((hero, i) => {
    assert.equal(hero.idx, i + 1, `${hero.id} must sit at roster position ${i + 1}`);
  });
  assert.equal(abilityIds.length, heroesData.abilityTableLength);
  assert.equal(new Set(abilityIds.filter(Boolean)).size, abilityIds.filter(Boolean).length, 'no duplicate abilities');
});

test('a hero alone round-trips and keeps the board otherwise empty', () => {
  const state = createEmptyState();
  state.hero = heroesData.heroes[0]!.id;
  const encoded = encodeBuild(state, table, heroTable);
  assert.notEqual(encoded, '', 'choosing a hero is not an untouched board');
  const { state: out } = roundTripHero(state);
  assert.deepEqual(out, state);
});

test('one spell per key round-trips for every hero that has them', () => {
  for (const hero of heroesData.heroes) {
    if (hero.abilities.length === 0) continue;
    const state = createEmptyState();
    state.hero = hero.id;
    ABILITY_SLOTS.forEach((slot, i) => {
      const first = hero.bySlot[slot]?.[0];
      if (first) state.sections[0]!.spells[i] = { k: 'id', id: first };
    });
    const { state: out } = roundTripHero(state);
    assert.deepEqual(out, state, `${hero.short} spells did not survive`);
  }
});

test('spells differ per section, which is the point of picking them per card', () => {
  // Axe binds two different abilities to Q, so a guide can swap between them.
  const axe = heroesData.heroes.find((h) => (h.bySlot.q?.length ?? 0) >= 2);
  assert.ok(axe, 'expected a hero with two candidates for one key');
  const [early, late] = axe.bySlot.q!;
  const state = createEmptyState(2);
  state.hero = axe.id;
  state.sections[0]!.spells[0] = { k: 'id', id: early! };
  state.sections[1]!.spells[0] = { k: 'id', id: late! };
  const { state: out } = roundTripHero(state);
  assert.deepEqual(out.sections[0]!.spells[0], { k: 'id', id: early });
  assert.deepEqual(out.sections[1]!.spells[0], { k: 'id', id: late });
});

test('a guide with a hero and spells stays inside a shareable URL', () => {
  const hero = heroesData.heroes.find((h) => h.abilities.length > 0)!;
  const state = createEmptyState(MAX_SECTIONS);
  state.hero = hero.id;
  let n = 0;
  for (let s = 0; s < MAX_SECTIONS; s++) {
    state.sections[s]!.name = `Сборка ${s}`;
    for (let i = 0; i < SLOTS_PER_SECTION; i++) {
      state.sections[s]!.slots[i] = { k: 'id', id: ids[(n++ * 17) % ids.length]! };
    }
    ABILITY_SLOTS.forEach((slot, i) => {
      const first = hero.bySlot[slot]?.[0];
      if (first) state.sections[s]!.spells[i] = { k: 'id', id: first };
    });
  }
  const encoded = encodeBuild(state, table, heroTable);
  assert.deepEqual(roundTripHero(state).state, state);
  const spellsSegment = encoded.split('.')[4] ?? '';
  // Worst case: 1 hero byte + ceil(9*7/8)=8 bitmap + 63 packed 12-bit indices.
  assert.ok(spellsSegment.length < 150, `spells segment ${spellsSegment.length} chars, expected < 150`);
});

test('an unknown spell index is preserved and re-encodes byte-identically', () => {
  const unknownIdx = abilityIds.length + 3;
  const state = createEmptyState();
  state.hero = heroesData.heroes[0]!.id;
  state.sections[0]!.spells[0] = { k: 'unknown', idx: unknownIdx };

  const encoded = encodeBuild(state, table, heroTable);
  const decoded = decodeBuild(encoded, table, heroTable);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  assert.deepEqual(decoded.state.sections[0]!.spells[0], { k: 'unknown', idx: unknownIdx });
  assert.ok(decoded.warnings.some((w) => w.k === 'unknown-spell'));
  // The whole point: passing a newer guide along must not degrade it.
  assert.equal(encodeBuild(decoded.state, table, heroTable), encoded);
});

test('a hero this build cannot name survives being re-shared', () => {
  const state = createEmptyState();
  state.heroUnknown = heroTable.heroIds.length + 2;

  const encoded = encodeBuild(state, table, heroTable);
  const decoded = decodeBuild(encoded, table, heroTable);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  assert.equal(decoded.state.hero, null);
  assert.equal(decoded.state.heroUnknown, state.heroUnknown);
  assert.ok(decoded.warnings.some((w) => w.k === 'unknown-hero'));
  assert.equal(encodeBuild(decoded.state, table, heroTable), encoded);
});

test('switching hero clears spells, because abilities belong to one hero', () => {
  const [first, second] = heroesData.heroes;
  let state = createEmptyState();
  state = buildReducer(state, { type: 'setHero', hero: first!.id });
  const spell = first!.abilities[0];
  assert.ok(spell, 'expected the first hero to have a selectable ability');
  state = buildReducer(state, { type: 'setSpell', section: 0, spell: 0, value: { k: 'id', id: spell } });
  assert.equal(countSpells(state), 1);

  state = buildReducer(state, { type: 'setHero', hero: second!.id });
  assert.equal(state.hero, second!.id);
  assert.equal(countSpells(state), 0, 'a spell from the previous hero must not linger');
});

test('spells survive a board that has neither names nor descriptions', () => {
  // Segments are positional, so this is the `5.slots...spells` shape.
  const hero = heroesData.heroes.find((h) => h.abilities.length > 0)!;
  const state = createEmptyState();
  state.hero = hero.id;
  state.sections[0]!.spells[0] = { k: 'id', id: hero.abilities[0]! };

  const encoded = encodeBuild(state, table, heroTable);
  const parts = encoded.split('.');
  assert.equal(parts.length, 5, `expected five segments, got ${encoded}`);
  assert.equal(parts[2], '', 'names segment should be empty');
  assert.equal(parts[3], '', 'descriptions segment should be empty');
  assert.deepEqual(roundTripHero(state).state, state);
});

test('a v4 link decodes under v5 with no hero and no spells', () => {
  // Captured before heroes existed; every link already shared looks like this.
  const v4 = '4.wsQCmEIgGFZgAQAj_0thN2NQAA.AAMKRWFybHkgZ2FtZQjQr9C00YDQvg';
  const decoded = decodeBuild(v4, kindTable, heroTable);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  assert.equal(decoded.state.hero, null);
  assert.equal(decoded.state.heroUnknown, null);
  assert.equal(decoded.state.sections[0]!.name, 'Early game');
  assert.ok(decoded.state.sections.every((s) => s.spells.length === SPELLS_PER_SECTION));
  assert.ok(decoded.state.sections.every((s) => s.spells.every((v) => v === null)));
  assert.equal(decoded.warnings.filter((w) => w.k !== 'table-mismatch').length, 0);
});

test('decoding without a hero table degrades visibly instead of inventing spells', () => {
  const hero = heroesData.heroes.find((h) => h.abilities.length > 0)!;
  const state = createEmptyState();
  state.hero = hero.id;
  state.sections[0]!.spells[0] = { k: 'id', id: hero.abilities[0]! };

  const encoded = encodeBuild(state, table, heroTable);
  const decoded = decodeBuild(encoded, table);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  assert.equal(decoded.state.hero, null, 'no roster to resolve against');
  assert.equal(decoded.state.heroUnknown, hero.idx);
  assert.equal(decoded.state.sections[0]!.spells[0]?.k, 'unknown');
  // Still lossless: re-encoding reproduces the original bytes exactly.
  assert.equal(encodeBuild(decoded.state, table), encoded);
});

// --- the f key and forced picks ---------------------------------------------

test('wire order is append-only: v5 positions are untouched by the f key', () => {
  // Reordering these silently repoints every spell in every guide ever shared.
  assert.deepEqual([...ABILITY_SLOTS], ['q', 'w', 'e', 'd', 'r', 'passive', 'f']);
  assert.equal(SPELLS_PER_SECTION, 7);
  // Display order is a separate concern and may be rearranged freely.
  assert.deepEqual([...ABILITY_SLOT_ORDER], ['passive', 'q', 'w', 'e', 'd', 'f', 'r']);
  assert.deepEqual([...ABILITY_SLOT_ORDER].sort(), [...ABILITY_SLOTS].sort(), 'both orders cover the same keys');
});

test('every hero is granted the shared f heal, and it is their only candidate', () => {
  for (const hero of heroesData.heroes) {
    assert.deepEqual(hero.bySlot.f, ['ak_hero_heal'], `${hero.short} should carry the shared heal`);
  }
  const heal = heroesData.abilities['ak_hero_heal'];
  assert.ok(heal, 'the shared heal must be in the ability table');
  assert.equal(heal.hero, null, 'a shared ability has no single owner');
  assert.equal(heal.slot, 'f');
});

test('spellDefaults fills only the keys that offer exactly one ability', () => {
  for (const hero of heroesData.heroes) {
    const defaults = spellDefaults(hero);
    ABILITY_SLOTS.forEach((slot, i) => {
      const candidates = hero.bySlot[slot] ?? [];
      if (candidates.length === 1) {
        assert.deepEqual(defaults[i], { k: 'id', id: candidates[0] }, `${hero.short}.${slot} should be preselected`);
      } else {
        assert.equal(defaults[i], null, `${hero.short}.${slot} has ${candidates.length} options, so it is a choice`);
      }
    });
  }
});

test('choosing a hero preselects the forced keys in every section', () => {
  const axe = heroesData.heroes.find((h) => h.short === 'axe')!;
  let state = createEmptyState(3);
  state = buildReducer(state, { type: 'setHero', hero: axe.id, defaults: spellDefaults(axe) });

  const fIndex = ABILITY_SLOTS.indexOf('f');
  const qIndex = ABILITY_SLOTS.indexOf('q');
  for (const section of state.sections) {
    assert.deepEqual(section.spells[fIndex], { k: 'id', id: 'ak_hero_heal' }, 'f is forced');
    assert.equal(section.spells[qIndex], null, 'q has two candidates, so it stays a choice');
  }
  // The heal, plus e and d which Axe offers one of each.
  assert.equal(countSpells(state), 3 * 3);
});

test('a cleared or added section comes back with its forced picks', () => {
  const axe = heroesData.heroes.find((h) => h.short === 'axe')!;
  const defaults = spellDefaults(axe);
  const fIndex = ABILITY_SLOTS.indexOf('f');

  let state = buildReducer(createEmptyState(2), { type: 'setHero', hero: axe.id, defaults });
  state = buildReducer(state, { type: 'clearSection', section: 0, defaults });
  assert.deepEqual(state.sections[0]!.spells[fIndex], { k: 'id', id: 'ak_hero_heal' });

  state = buildReducer(state, { type: 'addSection', defaults });
  assert.deepEqual(state.sections[2]!.spells[fIndex], { k: 'id', id: 'ak_hero_heal' });
});

test('a guide using all seven keys round-trips', () => {
  const axe = heroesData.heroes.find((h) => h.short === 'axe')!;
  const state = createEmptyState();
  state.hero = axe.id;
  ABILITY_SLOTS.forEach((slot, i) => {
    const first = axe.bySlot[slot]?.[0];
    if (first) state.sections[0]!.spells[i] = { k: 'id', id: first };
  });
  assert.equal(state.sections[0]!.spells.filter(Boolean).length, 7, 'Axe fills every key');
  assert.deepEqual(roundTripHero(state).state, state);
});

test('a v5 link decodes under v6 with the first six keys intact and f empty', () => {
  // Built at the v5 width of six keys per section, before f existed.
  const axe = heroesData.heroes.find((h) => h.short === 'axe')!;
  const v5State = createEmptyState();
  v5State.hero = axe.id;
  const wanted: Record<string, string> = {};
  for (const slot of ['q', 'w', 'e', 'd', 'r', 'passive'] as const) {
    const id = axe.bySlot[slot]?.[0];
    if (id) wanted[slot] = id;
  }

  // Hand-build the v5 payload: 6 slots per section rather than 7.
  const V5_WIDTH = 6;
  const sectionCount = v5State.sections.length;
  const bitmapBytes = Math.ceil((sectionCount * V5_WIDTH) / 8);
  const bitmap = new Uint8Array(bitmapBytes);
  const indices: number[] = [];
  const v5Order = ['q', 'w', 'e', 'd', 'r', 'passive'] as const;
  v5Order.forEach((slot, n) => {
    const id = wanted[slot];
    if (!id) return;
    bitmap[n >> 3] = (bitmap[n >> 3] ?? 0) | (0x80 >> (n & 7));
    indices.push(abilityIds.indexOf(id));
  });
  const writer = new BitWriter();
  for (const idx of indices) writer.writeBits(idx, 12);
  const packed = writer.toBytes();
  const bytes = new Uint8Array(1 + bitmapBytes + packed.length);
  bytes[0] = axe.idx;
  bytes.set(bitmap, 1);
  bytes.set(packed, 1 + bitmapBytes);

  const slotsSegment = encodeBuild(v5State, table, heroTable).split('.')[1]!;
  const v5 = `5.${slotsSegment}...${bytesToBase64Url(bytes)}`;

  const decoded = decodeBuild(v5, table, heroTable);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  assert.equal(decoded.state.hero, axe.id, 'the hero byte is unchanged between v5 and v6');
  for (const [slot, id] of Object.entries(wanted)) {
    const i = ABILITY_SLOTS.indexOf(slot as (typeof ABILITY_SLOTS)[number]);
    assert.deepEqual(decoded.state.sections[0]!.spells[i], { k: 'id', id }, `v5 ${slot} must survive`);
  }
  assert.equal(decoded.state.sections[0]!.spells[ABILITY_SLOTS.indexOf('f')], null, 'v5 predates the f key');
  assert.equal(decoded.warnings.filter((w) => w.k === 'spells-truncated').length, 0);
});
