import { base64UrlToBytes, bytesToBase64Url } from './base64url.ts';
import { BitReader, BitWriter } from './bits.ts';
import {
  DEFAULT_SECTIONS,
  MAX_SECTIONS,
  MIN_SECTIONS,
  SLOTS_PER_SECTION,
  createEmptyState,
  createSection,
  isEmptyState,
  isSectionEmpty,
  slotKindAt,
  type BuildState,
  type SlotValue,
  type SpellValue,
} from './buildState.ts';
import { SPELLS_PER_SECTION } from '../types/heroes.ts';

/**
 * Encodes a whole board into a URL fragment.
 *
 * Wire format: `<codecVersion>.<slots>[.<names>]`
 *
 * The version sits outside base64 so it stays greppable and the decoder can
 * dispatch on it before touching a payload it may not understand.
 *
 * v2 slots segment:
 *   [0..1]  u16be  table fingerprint (first 16 bits of sha256 over the id table)
 *   [2]     u8     section count (1-9)
 *   [3..]          occupancy bitmap, ceil(count*9/8) bytes, MSB-first,
 *                  slot n = section*9 + slot
 *   [...]          packed 12-bit indices, one per set bit, ascending slot order
 *
 * Sizing the bitmap to the section count is what keeps a small board's link
 * small: a two-section board costs 6 bytes of header rather than 13.
 * 12 bits leaves 4096 slots of headroom over the current ~1,750 items, and
 * 0xFFF is reserved as a future "explicitly empty" sentinel.
 *
 * Text segments — names, then descriptions — each omitted when nothing is set:
 *   u16be presence bitmap, then per present section a varint byte length
 *   followed by UTF-8 bytes. A board with descriptions but no names encodes the
 *   names segment as empty (`4.slots..descs`).
 *
 * v5 adds a fourth segment for the hero and the spells each section takes, and
 * v6 widens it from six ability keys to seven:
 *   [0]     u8     hero, as its 1-based frozen roster position (0 = none)
 *   [1..]          occupancy bitmap over count*7 spell slots, MSB-first
 *   [...]          packed 12-bit ability-table indices, ascending slot order
 *
 * It is omitted entirely for a guide with no hero and no spells, so boards that
 * do not use the feature cost nothing. Because segments are positional, a guide
 * with spells but no names encodes as `5.slots...spells`.
 *
 * v1 was identical except that the board was always exactly nine sections, so
 * there was no count byte and the bitmap was a fixed 11 bytes. It is still
 * decoded — see `decodeV1` — so links shared before sections became variable
 * keep working.
 *
 * This module is deliberately pure — no DOM, no import.meta, tables passed in
 * — so it runs unchanged under `node --test`.
 */

export const CODEC_VERSION = 6;
/** Versions this build can read. */
export const SUPPORTED_VERSIONS = [1, 2, 3, 4, 5, 6];

/**
 * v5 encoded six ability keys per section. v6 appended the shared `f` heal as a
 * seventh, which changes the size of the spell bitmap — so v5 payloads are read
 * at their own width and the first six positions still mean what they did.
 */
const V5_SPELLS_PER_SECTION = 6;

/** v1 and v2 predate typed slots: nine flat slots per section. */
const LEGACY_SLOTS_PER_SECTION = 9;
const V1_SECTIONS = 9;
const V1_BITMAP_BYTES = 11; // ceil(81 / 8)
const INDEX_BITS = 12;
export const MAX_ENCODABLE_INDEX = (1 << INDEX_BITS) - 2; // 0xFFF is reserved
const RESERVED_INDEX = (1 << INDEX_BITS) - 1;

const bitmapBytesFor = (sectionCount: number, slotsPerSection: number) =>
  Math.ceil((sectionCount * slotsPerSection) / 8);

/**
 * The frozen item id table, indexed by the values the URL encodes.
 *
 * The app rebuilds this from `items.index.json`, which ships only playable
 * items, so positions belonging to hidden or disabled items are empty strings.
 * Those are holes, not ids: a link pointing at one decodes to an `unknown`
 * slot and re-encodes unchanged, rather than resolving to `''`.
 */
export interface IdTable {
  ids: string[];
  /** Low 16 bits of the table hash. */
  fingerprint: number;
  /**
   * Slot-kind bitmask per id, parallel to `ids`. Optional: only the migration
   * of pre-v3 links needs it, to re-home flat slots into typed ones.
   */
  kinds?: number[];
}

/**
 * The frozen, append-only tables behind the spells segment.
 *
 * `abilityIds` is indexed by what the URL encodes. `heroIds` is the roster in
 * config order, so a hero's byte is its position here plus one — 0 stays free
 * to mean "no hero chosen".
 */
export interface HeroTable {
  abilityIds: string[];
  heroIds: string[];
}

export type DecodeWarning =
  | { k: 'table-mismatch'; expected: number; got: number }
  | { k: 'unknown-index'; slot: number; idx: number }
  | { k: 'names-truncated' }
  | { k: 'migrated-layout'; moved: number; dropped: number }
  | { k: 'unknown-hero'; idx: number }
  | { k: 'unknown-spell'; section: number; spell: number; idx: number }
  | { k: 'spells-truncated' };

export type DecodeResult =
  | { ok: true; state: BuildState; warnings: DecodeWarning[] }
  | { ok: false; reason: 'unsupported-version' | 'malformed'; version?: number; detail?: string };

export function makeIdTable(ids: string[], hashHex: string, kinds?: number[]): IdTable {
  return { ids, fingerprint: Number.parseInt(hashHex.slice(0, 4), 16) || 0, kinds };
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: false });

function writeVarint(out: number[], value: number): void {
  let v = value;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
}

/**
 * Encodes one optional string per section: a u16be presence bitmap, then a
 * varint byte length and UTF-8 bytes for each present entry.
 *
 * Names and descriptions share this shape, so they share the code. Returns null
 * when nothing is set, which keeps the segment out of the URL entirely.
 */
function encodeTextSegment(values: (string | null | undefined)[]): string | null {
  const present: { index: number; bytes: Uint8Array }[] = [];
  for (let i = 0; i < values.length && i < MAX_SECTIONS; i++) {
    const value = values[i];
    if (value === null || value === undefined || value === '') continue;
    present.push({ index: i, bytes: textEncoder.encode(value) });
  }
  if (present.length === 0) return null;

  let bitmap = 0;
  for (const p of present) bitmap |= 1 << p.index;

  const out: number[] = [(bitmap >> 8) & 0xff, bitmap & 0xff];
  for (const p of present) {
    writeVarint(out, p.bytes.length);
    for (const b of p.bytes) out.push(b);
  }
  return bytesToBase64Url(Uint8Array.from(out));
}

/** Inverse of `encodeTextSegment`. Returns null if the payload is unusable. */
function decodeTextSegment(payload: string): (string | undefined)[] | null {
  try {
    const bytes = base64UrlToBytes(payload);
    if (bytes.length < 2) throw new Error('too short');
    const bitmap = ((bytes[0] ?? 0) << 8) | (bytes[1] ?? 0);
    const out: (string | undefined)[] = [];
    let p = 2;
    for (let i = 0; i < MAX_SECTIONS; i++) {
      if (((bitmap >> i) & 1) === 0) continue;
      let len = 0;
      let shift = 0;
      for (;;) {
        if (p >= bytes.length) throw new Error('truncated varint');
        const b = bytes[p++]!;
        len |= (b & 0x7f) << shift;
        if ((b & 0x80) === 0) break;
        shift += 7;
        if (shift > 28) throw new Error('varint too long');
      }
      if (p + len > bytes.length) throw new Error('truncated string');
      out[i] = textDecoder.decode(bytes.subarray(p, p + len));
      p += len;
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Applies the optional name and description segments.
 *
 * Text is cosmetic: a corrupt segment is reported but never costs the items.
 * Entries for sections beyond the encoded count are ignored rather than
 * silently growing the board.
 */
function applyText(state: BuildState, namesPart: string, descsPart: string, warnings: DecodeWarning[]): void {
  if (namesPart !== '') {
    const names = decodeTextSegment(namesPart);
    if (names === null) warnings.push({ k: 'names-truncated' });
    else {
      names.forEach((name, i) => {
        if (name !== undefined && i < state.sections.length) state.sections[i]!.name = name;
      });
    }
  }
  if (descsPart !== '') {
    const descs = decodeTextSegment(descsPart);
    if (descs === null) warnings.push({ k: 'names-truncated' });
    else {
      descs.forEach((desc, i) => {
        if (desc !== undefined && i < state.sections.length) state.sections[i]!.description = desc;
      });
    }
  }
}

/**
 * Encodes the hero byte plus every chosen spell.
 *
 * Returns null when there is nothing to say — no hero, no spells — which keeps
 * the segment out of the URL for guides that do not use the feature.
 */
function encodeSpellSegment(state: BuildState, sectionCount: number, heroes: HeroTable | undefined): string | null {
  let heroByte = 0;
  if (state.hero !== null && heroes) {
    const found = heroes.heroIds.indexOf(state.hero);
    if (found >= 0) heroByte = found + 1;
  }
  // A roster position this build could not name still goes back out unchanged.
  if (heroByte === 0 && state.heroUnknown !== null) heroByte = state.heroUnknown;
  if (heroByte < 0 || heroByte > 0xff) heroByte = 0;

  const indexOf = new Map<string, number>();
  if (heroes) {
    for (let i = 0; i < heroes.abilityIds.length; i++) {
      const id = heroes.abilityIds[i];
      if (id) indexOf.set(id, i);
    }
  }

  const bitmapBytes = bitmapBytesFor(sectionCount, SPELLS_PER_SECTION);
  const bitmap = new Uint8Array(bitmapBytes);
  const indices: number[] = [];

  for (let s = 0; s < sectionCount; s++) {
    for (let n = 0; n < SPELLS_PER_SECTION; n++) {
      const value = state.sections[s]?.spells[n];
      if (!value) continue;
      let idx: number;
      if (value.k === 'unknown') {
        idx = value.idx;
      } else {
        const found = indexOf.get(value.id);
        if (found === undefined) continue; // a spell this build cannot name; drop it
        idx = found;
      }
      if (idx < 0 || idx > MAX_ENCODABLE_INDEX) continue;
      const slot = s * SPELLS_PER_SECTION + n;
      bitmap[slot >> 3] = (bitmap[slot >> 3] ?? 0) | (0x80 >> (slot & 7));
      indices.push(idx);
    }
  }

  if (heroByte === 0 && indices.length === 0) return null;

  const writer = new BitWriter();
  for (const idx of indices) writer.writeBits(idx, INDEX_BITS);
  const packed = writer.toBytes();

  const bytes = new Uint8Array(1 + bitmapBytes + packed.length);
  bytes[0] = heroByte;
  bytes.set(bitmap, 1);
  bytes.set(packed, 1 + bitmapBytes);
  return bytesToBase64Url(bytes);
}

/** Inverse of `encodeSpellSegment`. Text-like: a corrupt payload never costs items. */
function applySpells(
  state: BuildState,
  payload: string,
  sectionCount: number,
  spellsPerSection: number,
  heroes: HeroTable | undefined,
  warnings: DecodeWarning[],
): void {
  if (payload === '') return;

  let bytes: Uint8Array;
  try {
    bytes = base64UrlToBytes(payload);
  } catch {
    warnings.push({ k: 'spells-truncated' });
    return;
  }

  const bitmapBytes = bitmapBytesFor(sectionCount, spellsPerSection);
  if (bytes.length < 1 + bitmapBytes) {
    warnings.push({ k: 'spells-truncated' });
    return;
  }

  const heroByte = bytes[0] ?? 0;
  if (heroByte > 0) {
    const id = heroes?.heroIds[heroByte - 1];
    if (id === undefined) {
      warnings.push({ k: 'unknown-hero', idx: heroByte });
      state.heroUnknown = heroByte;
    } else {
      state.hero = id;
    }
  }

  const bitmap = bytes.subarray(1, 1 + bitmapBytes);
  const slotCount = sectionCount * spellsPerSection;
  const occupied: number[] = [];
  for (let slot = 0; slot < slotCount; slot++) {
    const byte = bitmap[slot >> 3] ?? 0;
    if ((byte >> (7 - (slot & 7))) & 1) occupied.push(slot);
  }

  const reader = new BitReader(bytes.subarray(1 + bitmapBytes));
  if (reader.bitsRemaining < occupied.length * INDEX_BITS) {
    warnings.push({ k: 'spells-truncated' });
    return;
  }

  for (const slot of occupied) {
    const idx = reader.readBits(INDEX_BITS);
    if (idx === RESERVED_INDEX) continue;
    const section = Math.floor(slot / spellsPerSection);
    const n = slot % spellsPerSection;
    const target = state.sections[section];
    // A narrower legacy width can only address positions this build still has.
    if (!target || n >= SPELLS_PER_SECTION) continue;

    const id = heroes?.abilityIds[idx];
    let value: SpellValue;
    if (!id) {
      warnings.push({ k: 'unknown-spell', section, spell: n, idx });
      value = { k: 'unknown', idx };
    } else {
      value = { k: 'id', id };
    }
    target.spells[n] = value;
  }
}

/** Returns the fragment payload (without a leading `#b=`), or '' for an untouched board. */
export function encodeBuild(state: BuildState, table: IdTable, heroes?: HeroTable): string {
  if (isEmptyState(state)) return '';

  const indexOf = new Map<string, number>();
  for (let i = 0; i < table.ids.length; i++) {
    const id = table.ids[i];
    if (id) indexOf.set(id, i); // skip holes for non-playable positions
  }

  const sectionCount = Math.min(MAX_SECTIONS, Math.max(MIN_SECTIONS, state.sections.length));
  const bitmapBytes = bitmapBytesFor(sectionCount, SLOTS_PER_SECTION);
  const bitmap = new Uint8Array(bitmapBytes);
  const indices: number[] = [];

  for (let s = 0; s < sectionCount; s++) {
    for (let n = 0; n < SLOTS_PER_SECTION; n++) {
      const value = state.sections[s]?.slots[n];
      if (!value) continue;
      let idx: number;
      if (value.k === 'unknown') {
        idx = value.idx;
      } else {
        const found = indexOf.get(value.id);
        if (found === undefined) continue; // item this build cannot name; drop it
        idx = found;
      }
      if (idx < 0 || idx > MAX_ENCODABLE_INDEX) continue;
      const slot = s * SLOTS_PER_SECTION + n;
      bitmap[slot >> 3] = (bitmap[slot >> 3] ?? 0) | (0x80 >> (slot & 7));
      indices.push(idx);
    }
  }

  const writer = new BitWriter();
  for (const idx of indices) writer.writeBits(idx, INDEX_BITS);
  const packed = writer.toBytes();

  const bytes = new Uint8Array(3 + bitmapBytes + packed.length);
  bytes[0] = (table.fingerprint >> 8) & 0xff;
  bytes[1] = table.fingerprint & 0xff;
  bytes[2] = sectionCount;
  bytes.set(bitmap, 3);
  bytes.set(packed, 3 + bitmapBytes);

  const slots = bytesToBase64Url(bytes);
  const names = encodeTextSegment(state.sections.map((s) => s.name));
  const descs = encodeTextSegment(state.sections.map((s) => s.description));
  const spells = encodeSpellSegment(state, sectionCount, heroes);

  // Trailing empty segments are dropped so a board using none of them stays short.
  if (spells !== null) return `${CODEC_VERSION}.${slots}.${names ?? ''}.${descs ?? ''}.${spells}`;
  if (descs !== null) return `${CODEC_VERSION}.${slots}.${names ?? ''}.${descs}`;
  if (names !== null) return `${CODEC_VERSION}.${slots}.${names}`;
  return `${CODEC_VERSION}.${slots}`;
}

/**
 * Fills a state's slots from a bitmap plus a packed index run.
 *
 * `slotsPerSection` is the *encoded* width, which is the current layout for v3
 * and nine for the older flat formats. When it differs, each item is re-homed
 * into the first free slot of its section that accepts it — see `placeLegacy`.
 */
function readSlots(
  state: BuildState,
  bitmap: Uint8Array,
  packed: Uint8Array,
  sectionCount: number,
  slotsPerSection: number,
  table: IdTable,
  warnings: DecodeWarning[],
): boolean {
  const slotCount = sectionCount * slotsPerSection;
  const occupied: number[] = [];
  for (let slot = 0; slot < slotCount; slot++) {
    const byte = bitmap[slot >> 3] ?? 0;
    if ((byte >> (7 - (slot & 7))) & 1) occupied.push(slot);
  }

  const reader = new BitReader(packed);
  if (reader.bitsRemaining < occupied.length * INDEX_BITS) return false;

  const legacy = slotsPerSection !== SLOTS_PER_SECTION;
  let migrated = 0;
  let dropped = 0;

  for (const slot of occupied) {
    const idx = reader.readBits(INDEX_BITS);
    if (idx === RESERVED_INDEX) continue;
    const section = Math.floor(slot / slotsPerSection);
    const n = slot % slotsPerSection;

    const id = table.ids[idx];
    let value: SlotValue;
    if (!id) {
      // Either a newer build knows this index, or it belongs to an item this
      // build filtered out. Keep it verbatim so re-sharing stays lossless.
      warnings.push({ k: 'unknown-index', slot, idx });
      value = { k: 'unknown', idx };
    } else {
      value = { k: 'id', id };
    }

    if (!legacy) {
      state.sections[section]!.slots[n] = value;
      continue;
    }

    const placed = placeLegacy(state, section, value, idx, table);
    if (placed) migrated++;
    else dropped++;
  }

  if (legacy && (migrated > 0 || dropped > 0)) {
    warnings.push({ k: 'migrated-layout', moved: migrated, dropped });
  }
  return true;
}

/**
 * Puts an item from a pre-v3 flat slot into the first free typed slot of its
 * section that will accept it.
 *
 * Old slots carried no type, so position cannot be preserved. Matching on kind
 * keeps the build meaningful — potions land in potion slots, gear in gear
 * slots. Anything with no home falls back to the backpack, and only a section
 * with no free slot at all loses an entry.
 */
function placeLegacy(
  state: BuildState,
  section: number,
  value: SlotValue,
  idx: number,
  table: IdTable,
): boolean {
  const target = state.sections[section];
  if (!target) return false;

  const kinds = table.kinds?.[idx];
  const fits = (slot: number) => kinds === undefined || (kinds & slotKindAt(slot)) !== 0;

  for (let slot = 0; slot < SLOTS_PER_SECTION; slot++) {
    if (target.slots[slot] === null && fits(slot)) {
      target.slots[slot] = value;
      return true;
    }
  }
  // No kind-appropriate opening; take any free slot rather than lose the item.
  for (let slot = 0; slot < SLOTS_PER_SECTION; slot++) {
    if (target.slots[slot] === null) {
      target.slots[slot] = value;
      return true;
    }
  }
  return false;
}

/**
 * Reads a section-count-prefixed payload: v2 and v3 share this header shape and
 * differ only in how many slots a section holds, which sizes the bitmap.
 */
function decodeCounted(
  slotsPart: string,
  namesPart: string,
  descsPart: string,
  spellsPart: string,
  table: IdTable,
  slotsPerSection: number,
  spellsPerSection: number,
  heroes: HeroTable | undefined,
): DecodeResult {
  let bytes: Uint8Array;
  try {
    bytes = base64UrlToBytes(slotsPart);
  } catch {
    return { ok: false, reason: 'malformed', detail: 'slots payload is not base64url' };
  }
  if (bytes.length < 4) return { ok: false, reason: 'malformed', detail: 'slots payload too short' };

  const warnings: DecodeWarning[] = [];
  const fingerprint = ((bytes[0] ?? 0) << 8) | (bytes[1] ?? 0);
  if (fingerprint !== table.fingerprint) {
    warnings.push({ k: 'table-mismatch', expected: table.fingerprint, got: fingerprint });
  }

  const sectionCount = bytes[2] ?? 0;
  if (sectionCount < MIN_SECTIONS || sectionCount > MAX_SECTIONS) {
    return { ok: false, reason: 'malformed', detail: `section count ${sectionCount} out of range` };
  }

  const bitmapBytes = bitmapBytesFor(sectionCount, slotsPerSection);
  if (bytes.length < 3 + bitmapBytes) {
    return { ok: false, reason: 'malformed', detail: 'slots payload truncated' };
  }

  const state = createEmptyState(sectionCount);
  const ok = readSlots(
    state,
    bytes.subarray(3, 3 + bitmapBytes),
    bytes.subarray(3 + bitmapBytes),
    sectionCount,
    slotsPerSection,
    table,
    warnings,
  );
  if (!ok) return { ok: false, reason: 'malformed', detail: 'slots payload truncated' };

  applyText(state, namesPart, descsPart, warnings);
  applySpells(state, spellsPart, sectionCount, spellsPerSection, heroes, warnings);

  return { ok: true, state, warnings };
}

/**
 * Reads a v1 payload, from before the section count was variable.
 *
 * v1 boards were always nine sections. Trailing sections that are empty and
 * unnamed carried no information, so they are dropped back to the current
 * default — otherwise every old link would open as nine mostly-blank cards.
 */
function decodeV1(slotsPart: string, namesPart: string, table: IdTable): DecodeResult {
  let bytes: Uint8Array;
  try {
    bytes = base64UrlToBytes(slotsPart);
  } catch {
    return { ok: false, reason: 'malformed', detail: 'slots payload is not base64url' };
  }
  if (bytes.length < 2 + V1_BITMAP_BYTES) {
    return { ok: false, reason: 'malformed', detail: 'slots payload too short' };
  }

  const warnings: DecodeWarning[] = [];
  const fingerprint = ((bytes[0] ?? 0) << 8) | (bytes[1] ?? 0);
  if (fingerprint !== table.fingerprint) {
    warnings.push({ k: 'table-mismatch', expected: table.fingerprint, got: fingerprint });
  }

  const state = createEmptyState(V1_SECTIONS);
  const ok = readSlots(
    state,
    bytes.subarray(2, 2 + V1_BITMAP_BYTES),
    bytes.subarray(2 + V1_BITMAP_BYTES),
    V1_SECTIONS,
    LEGACY_SLOTS_PER_SECTION,
    table,
    warnings,
  );
  if (!ok) return { ok: false, reason: 'malformed', detail: 'slots payload truncated' };

  applyText(state, namesPart, '', warnings);

  while (state.sections.length > DEFAULT_SECTIONS && isSectionEmpty(state.sections[state.sections.length - 1]!)) {
    state.sections.pop();
  }

  return { ok: true, state, warnings };
}

export function decodeBuild(raw: string, table: IdTable, heroes?: HeroTable): DecodeResult {
  const trimmed = raw.replace(/^#/, '').replace(/^b=/, '').trim();
  if (trimmed === '') return { ok: true, state: createEmptyState(), warnings: [] };

  const dot = trimmed.indexOf('.');
  if (dot <= 0) return { ok: false, reason: 'malformed', detail: 'missing version separator' };

  const version = Number(trimmed.slice(0, dot));
  if (!Number.isInteger(version)) return { ok: false, reason: 'malformed', detail: 'bad version' };
  if (!SUPPORTED_VERSIONS.includes(version)) return { ok: false, reason: 'unsupported-version', version };

  // base64url never contains a dot, so splitting on it is unambiguous.
  // Segments: slots, then optional names, descriptions and spells.
  const parts = trimmed.slice(dot + 1).split('.');
  const slotsPart = parts[0] ?? '';
  const namesPart = parts[1] ?? '';
  const descsPart = parts[2] ?? '';
  const spellsPart = parts[3] ?? '';

  if (version === 1) return decodeV1(slotsPart, namesPart, table);
  // v2 encoded nine flat slots per section; v3 and up use the typed layout.
  const slotsPerSection = version === 2 ? LEGACY_SLOTS_PER_SECTION : SLOTS_PER_SECTION;
  // v5 predates the `f` key, so its spell bitmap is six wide rather than seven.
  const spellsPerSection = version <= 5 ? V5_SPELLS_PER_SECTION : SPELLS_PER_SECTION;
  return decodeCounted(slotsPart, namesPart, descsPart, spellsPart, table, slotsPerSection, spellsPerSection, heroes);
}

/** Re-exported so callers can render an "add section" affordance. */
export { MAX_SECTIONS, createSection };
