import { base64UrlToBytes, bytesToBase64Url } from './base64url.ts';
import { BitReader, BitWriter } from './bits.ts';
import {
  MAX_TITLE,
  SLOT_COUNT,
  createEmptyState,
  isEmptyState,
  type BuildState,
  type SlotValue,
  type SpellValue,
} from './buildState.ts';
import { SPELLS_PER_SECTION } from '../types/heroes.ts';

/**
 * Encodes one build into a URL fragment.
 *
 * Wire format: `<codecVersion>.<board>[.<spells>[.<title>]]`
 *
 * The version sits outside base64 so it stays greppable and the decoder can
 * dispatch on it before touching a payload it may not understand.
 *
 * v8 board segment — always present:
 *   [0..1]  u16be  item table fingerprint (first 16 bits of sha256 over it)
 *   [2]     u8     hero, as its 1-based frozen roster position (0 = none)
 *   [3]     u8     how many maps follow (0 = none)
 *   [4..]   u16be  one per map, each a 1-based frozen table position
 *   then    u16be  occupancy bitmap over the 15 slots, MSB-first
 *   then           packed 12-bit item indices, one per set bit, ascending
 *
 * v7 was the same with exactly one map word and no count, which is what makes
 * reading it here a special case rather than a separate decoder: the count byte
 * is where v7 kept the high half of its single map word.
 *
 * spells segment — omitted when nothing is chosen:
 *   [0]     u8     occupancy bitmap over the 7 ability keys, MSB-first
 *   [1..]          packed 12-bit ability-table indices, ascending
 *
 * v7 title segment — omitted when there is no title:
 *   varint byte length, then UTF-8 bytes
 *
 * 12 bits leaves 4096 slots of headroom over the current ~1,800 items, and
 * 0xFFF is reserved as an "explicitly empty" sentinel. A map gets a full 16
 * bits where the hero gets 8: the roster is five heroes and grows about never,
 * while rooms arrive with every content drop. The *count* gets 8, which is 255
 * rooms on one build — far past the fifteen that exist and past any guide worth
 * writing.
 *
 * **Hero and maps live in the always-present header** rather than in the
 * optional trailing segment they would fit in. They cost two bytes on a board
 * that names neither, which buys the decoder having no branch where the hero is
 * unknown because a later segment was missing — the class of bug the old
 * positional layout kept producing.
 *
 * ## v7, and why it still reads
 *
 * v7 encoded one map in a fixed `u16` where v8 keeps a count. Links are already
 * in the wild — the whole point of the codec is that a build can be shared
 * without an account — so v7 is decoded rather than refused: its map word
 * becomes a one-element list. Nothing re-encodes as v7, so a v7 link opened and
 * saved comes back as v8.
 *
 * ## What happened to v1-v6
 *
 * They encoded a board of up to nine sections, each with its own name,
 * description and spells. The site no longer has that concept: a build is one
 * loadout for one map, which is what makes it filterable and rankable. There is
 * no honest migration — nine loadouts do not become one, and picking the first
 * would silently discard eight — so the old versions are refused with
 * `unsupported-version` and nothing pretends otherwise.
 *
 * This module is deliberately pure — no DOM, no import.meta, tables passed in
 * — so it runs unchanged under `node --test`.
 */

export const CODEC_VERSION = 8;
/**
 * Versions this build can read. v7 is one map, v8 is a list — see above.
 */
export const SUPPORTED_VERSIONS = [7, 8];

const INDEX_BITS = 12;
export const MAX_ENCODABLE_INDEX = (1 << INDEX_BITS) - 2; // 0xFFF is reserved
const RESERVED_INDEX = (1 << INDEX_BITS) - 1;

/** ceil(15 / 8) and ceil(7 / 8). */
const SLOT_BITMAP_BYTES = Math.ceil(SLOT_COUNT / 8);
const SPELL_BITMAP_BYTES = Math.ceil(SPELLS_PER_SECTION / 8);
/** Fingerprint, hero, map count. What sits before the map words in v8. */
const V8_FIXED_BYTES = 2 + 1 + 1;
/** Fingerprint, hero, one map word. What sits before the bitmap in v7. */
const V7_FIXED_BYTES = 2 + 1 + 2;
/** The most rooms one build may name, which is what one count byte holds. */
const MAX_MAPS = 0xff;

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
}

/**
 * The frozen, append-only tables behind the header and the spells segment.
 *
 * `abilityIds` is indexed by what the URL encodes. `heroIds` is the roster in
 * config order, so a hero's byte is its position here plus one. `mapIds` is
 * already 1-based with an empty string at position 0, because the map table is
 * emitted that way — 0 means "no map chosen" in both.
 */
export interface HeroTable {
  abilityIds: string[];
  heroIds: string[];
  mapIds: string[];
}

export type DecodeWarning =
  | { k: 'table-mismatch'; expected: number; got: number }
  | { k: 'unknown-index'; slot: number; idx: number }
  | { k: 'unknown-hero'; idx: number }
  | { k: 'unknown-map'; idx: number }
  | { k: 'unknown-spell'; spell: number; idx: number }
  | { k: 'spells-truncated' }
  | { k: 'title-truncated' };

export type DecodeResult =
  | { ok: true; state: BuildState; warnings: DecodeWarning[] }
  | { ok: false; reason: 'unsupported-version' | 'malformed'; version?: number; detail?: string };

export function makeIdTable(ids: string[], hashHex: string): IdTable {
  return { ids, fingerprint: Number.parseInt(hashHex.slice(0, 4), 16) || 0 };
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

/** Sets bit `n` of an MSB-first bitmap. */
function setBit(bitmap: Uint8Array, n: number): void {
  bitmap[n >> 3] = (bitmap[n >> 3] ?? 0) | (0x80 >> (n & 7));
}

/** The positions set in an MSB-first bitmap, ascending. */
function occupiedBits(bitmap: Uint8Array, count: number): number[] {
  const out: number[] = [];
  for (let n = 0; n < count; n++) {
    const byte = bitmap[n >> 3] ?? 0;
    if ((byte >> (7 - (n & 7))) & 1) out.push(n);
  }
  return out;
}

/**
 * Resolves a slot or spell value to the index the URL carries.
 *
 * Returns null for a value this build cannot name at all, which is dropped —
 * an `unknown` keeps its raw index, so the only way to reach null is an id that
 * is genuinely absent from the table.
 */
function indexFor(value: SlotValue | SpellValue, indexOf: Map<string, number>): number | null {
  const idx = value.k === 'unknown' ? value.idx : (indexOf.get(value.id) ?? -1);
  if (idx < 0 || idx > MAX_ENCODABLE_INDEX) return null;
  return idx;
}

/** Position -> id, skipping the holes left by non-playable entries. */
function indexTable(ids: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (id) out.set(id, i);
  }
  return out;
}

/** Returns the fragment payload (without a leading `#b=`), or '' for an untouched build. */
export function encodeBuild(state: BuildState, table: IdTable, heroes?: HeroTable): string {
  if (isEmptyState(state)) return '';

  const itemIndex = indexTable(table.ids);

  let heroByte = 0;
  if (state.hero !== null && heroes) {
    const found = heroes.heroIds.indexOf(state.hero);
    if (found >= 0) heroByte = found + 1;
  }
  // A roster position this build could not name still goes back out unchanged.
  if (heroByte === 0 && state.heroUnknown !== null) heroByte = state.heroUnknown;
  if (heroByte < 0 || heroByte > 0xff) heroByte = 0;

  /*
   * Every room this build names, as table positions.
   *
   * The ones it could not name go out alongside them unchanged, which is what
   * keeps re-sharing a link from quietly dropping a room this deployment has
   * not heard of. Sorted and deduplicated so two builds naming the same pair
   * encode identically whichever order they were clicked in.
   */
  const mapWords: number[] = [];
  for (const id of state.maps) {
    const found = heroes ? heroes.mapIds.indexOf(id) : -1;
    // Position 0 is the reserved "no map" hole, so a hit there is not a map.
    if (found > 0) mapWords.push(found);
  }
  for (const word of state.mapsUnknown) {
    if (Number.isInteger(word) && word > 0 && word <= 0xffff) mapWords.push(word);
  }
  const maps = [...new Set(mapWords)].sort((a, b) => a - b).slice(0, MAX_MAPS);

  const slotBitmap = new Uint8Array(SLOT_BITMAP_BYTES);
  const slotIndices: number[] = [];
  for (let n = 0; n < SLOT_COUNT; n++) {
    const value = state.slots[n];
    if (!value) continue;
    const idx = indexFor(value, itemIndex);
    if (idx === null) continue; // an item this build cannot name; drop it
    setBit(slotBitmap, n);
    slotIndices.push(idx);
  }

  const slotWriter = new BitWriter();
  for (const idx of slotIndices) slotWriter.writeBits(idx, INDEX_BITS);
  const packedSlots = slotWriter.toBytes();

  const mapBytes = maps.length * 2;
  const headerBytes = V8_FIXED_BYTES + mapBytes + SLOT_BITMAP_BYTES;
  const header = new Uint8Array(headerBytes + packedSlots.length);
  header[0] = (table.fingerprint >> 8) & 0xff;
  header[1] = table.fingerprint & 0xff;
  header[2] = heroByte;
  header[3] = maps.length;
  maps.forEach((word, i) => {
    header[V8_FIXED_BYTES + i * 2] = (word >> 8) & 0xff;
    header[V8_FIXED_BYTES + i * 2 + 1] = word & 0xff;
  });
  header.set(slotBitmap, V8_FIXED_BYTES + mapBytes);
  header.set(packedSlots, headerBytes);

  const board = bytesToBase64Url(header);
  const spells = encodeSpells(state, heroes);
  const title = encodeTitle(state.title);

  // Trailing empty segments are dropped so a build using none of them stays short.
  if (title !== null) return `${CODEC_VERSION}.${board}.${spells ?? ''}.${title}`;
  if (spells !== null) return `${CODEC_VERSION}.${board}.${spells}`;
  return `${CODEC_VERSION}.${board}`;
}

/** Returns null when no spell is chosen, keeping the segment out of the URL. */
function encodeSpells(state: BuildState, heroes: HeroTable | undefined): string | null {
  const abilityIndex = indexTable(heroes?.abilityIds ?? []);
  const bitmap = new Uint8Array(SPELL_BITMAP_BYTES);
  const indices: number[] = [];

  for (let n = 0; n < SPELLS_PER_SECTION; n++) {
    const value = state.spells[n];
    if (!value) continue;
    const idx = indexFor(value, abilityIndex);
    if (idx === null) continue; // a spell this build cannot name; drop it
    setBit(bitmap, n);
    indices.push(idx);
  }

  if (indices.length === 0) return null;

  const writer = new BitWriter();
  for (const idx of indices) writer.writeBits(idx, INDEX_BITS);
  const packed = writer.toBytes();

  const bytes = new Uint8Array(SPELL_BITMAP_BYTES + packed.length);
  bytes.set(bitmap, 0);
  bytes.set(packed, SPELL_BITMAP_BYTES);
  return bytesToBase64Url(bytes);
}

function encodeTitle(title: string | null): string | null {
  if (title === null || title === '') return null;
  const bytes = textEncoder.encode(title.slice(0, MAX_TITLE));
  const out: number[] = [];
  writeVarint(out, bytes.length);
  for (const b of bytes) out.push(b);
  return bytesToBase64Url(Uint8Array.from(out));
}

/** Reads the hero and map words into the state, preserving what it cannot name. */
function applyHeader(
  state: BuildState,
  heroByte: number,
  mapWords: readonly number[],
  heroes: HeroTable | undefined,
  warnings: DecodeWarning[],
): void {
  if (heroByte > 0) {
    const id = heroes?.heroIds[heroByte - 1];
    if (id === undefined) {
      warnings.push({ k: 'unknown-hero', idx: heroByte });
      state.heroUnknown = heroByte;
    } else {
      state.hero = id;
    }
  }

  for (const word of mapWords) {
    if (word <= 0) continue;
    // mapIds is already 1-based, so the word indexes it directly. An empty
    // string there is a retired room's tombstone and is treated as unknown.
    const id = heroes?.mapIds[word];
    if (id === undefined || id === '') {
      warnings.push({ k: 'unknown-map', idx: word });
      state.mapsUnknown.push(word);
    } else if (!state.maps.includes(id)) {
      state.maps.push(id);
    }
  }
}

/** Fills the slots from the header's bitmap plus its packed index run. */
function applySlots(state: BuildState, bitmap: Uint8Array, packed: Uint8Array, table: IdTable, warnings: DecodeWarning[]): boolean {
  const occupied = occupiedBits(bitmap, SLOT_COUNT);
  const reader = new BitReader(packed);
  if (reader.bitsRemaining < occupied.length * INDEX_BITS) return false;

  for (const slot of occupied) {
    const idx = reader.readBits(INDEX_BITS);
    if (idx === RESERVED_INDEX) continue;
    const id = table.ids[idx];
    if (!id) {
      // Either a newer build knows this index, or it belongs to an item this
      // build filtered out. Keep it verbatim so re-sharing stays lossless.
      warnings.push({ k: 'unknown-index', slot, idx });
      state.slots[slot] = { k: 'unknown', idx };
    } else {
      state.slots[slot] = { k: 'id', id };
    }
  }
  return true;
}

/** Inverse of `encodeSpells`. A corrupt payload is reported but never costs items. */
function applySpells(state: BuildState, payload: string, heroes: HeroTable | undefined, warnings: DecodeWarning[]): void {
  if (payload === '') return;

  let bytes: Uint8Array;
  try {
    bytes = base64UrlToBytes(payload);
  } catch {
    warnings.push({ k: 'spells-truncated' });
    return;
  }
  if (bytes.length < SPELL_BITMAP_BYTES) {
    warnings.push({ k: 'spells-truncated' });
    return;
  }

  const occupied = occupiedBits(bytes.subarray(0, SPELL_BITMAP_BYTES), SPELLS_PER_SECTION);
  const reader = new BitReader(bytes.subarray(SPELL_BITMAP_BYTES));
  if (reader.bitsRemaining < occupied.length * INDEX_BITS) {
    warnings.push({ k: 'spells-truncated' });
    return;
  }

  for (const spell of occupied) {
    const idx = reader.readBits(INDEX_BITS);
    if (idx === RESERVED_INDEX) continue;
    const id = heroes?.abilityIds[idx];
    if (!id) {
      warnings.push({ k: 'unknown-spell', spell, idx });
      state.spells[spell] = { k: 'unknown', idx };
    } else {
      state.spells[spell] = { k: 'id', id };
    }
  }
}

/** Inverse of `encodeTitle`. Text is cosmetic: a corrupt segment never costs items. */
function applyTitle(state: BuildState, payload: string, warnings: DecodeWarning[]): void {
  if (payload === '') return;
  try {
    const bytes = base64UrlToBytes(payload);
    let len = 0;
    let shift = 0;
    let p = 0;
    for (;;) {
      if (p >= bytes.length) throw new Error('truncated varint');
      const b = bytes[p++]!;
      len |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
      if (shift > 28) throw new Error('varint too long');
    }
    if (p + len > bytes.length) throw new Error('truncated string');
    const title = textDecoder.decode(bytes.subarray(p, p + len));
    state.title = title === '' ? null : title.slice(0, MAX_TITLE);
  } catch {
    warnings.push({ k: 'title-truncated' });
  }
}

export function decodeBuild(payload: string, table: IdTable, heroes?: HeroTable): DecodeResult {
  const trimmed = payload.trim();
  if (trimmed === '') return { ok: false, reason: 'malformed', detail: 'empty payload' };

  const parts = trimmed.split('.');
  const version = Number(parts[0]);
  if (!Number.isInteger(version)) return { ok: false, reason: 'malformed', detail: 'no version' };
  if (!SUPPORTED_VERSIONS.includes(version)) return { ok: false, reason: 'unsupported-version', version };

  const boardPart = parts[1] ?? '';
  if (boardPart === '') return { ok: false, reason: 'malformed', detail: 'no board segment' };

  let bytes: Uint8Array;
  try {
    bytes = base64UrlToBytes(boardPart);
  } catch {
    return { ok: false, reason: 'malformed', detail: 'board is not base64url' };
  }
  const fixed = version === 7 ? V7_FIXED_BYTES : V8_FIXED_BYTES;
  if (bytes.length < fixed + SLOT_BITMAP_BYTES) {
    return { ok: false, reason: 'malformed', detail: 'board too short' };
  }

  const warnings: DecodeWarning[] = [];
  const fingerprint = ((bytes[0] ?? 0) << 8) | (bytes[1] ?? 0);
  if (fingerprint !== table.fingerprint) {
    // Reported, not fatal: the tables are append-only, so a mismatch means the
    // link predates some additions rather than that its indices moved.
    warnings.push({ k: 'table-mismatch', expected: table.fingerprint, got: fingerprint });
  }

  /*
   * v7's single `u16` map and v8's counted list, read into the same shape.
   *
   * The count byte is exactly where v7 kept the high half of its map word, so
   * the two layouts are the same bytes read differently rather than two
   * formats — which is why one decoder handles both.
   */
  const state = createEmptyState();
  let mapWords: number[];
  let mapBytes: number;
  if (version === 7) {
    mapWords = [((bytes[3] ?? 0) << 8) | (bytes[4] ?? 0)];
    mapBytes = 0;
  } else {
    const count = bytes[3] ?? 0;
    mapBytes = count * 2;
    if (bytes.length < V8_FIXED_BYTES + mapBytes + SLOT_BITMAP_BYTES) {
      return { ok: false, reason: 'malformed', detail: 'map list truncated' };
    }
    mapWords = Array.from({ length: count }, (_, i) => {
      const at = V8_FIXED_BYTES + i * 2;
      return ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0);
    });
  }
  applyHeader(state, bytes[2] ?? 0, mapWords, heroes, warnings);

  const bitmapAt = fixed + mapBytes;
  const headerBytes = bitmapAt + SLOT_BITMAP_BYTES;
  const ok = applySlots(
    state,
    bytes.subarray(bitmapAt, headerBytes),
    bytes.subarray(headerBytes),
    table,
    warnings,
  );
  if (!ok) return { ok: false, reason: 'malformed', detail: 'board truncated' };

  applySpells(state, parts[2] ?? '', heroes, warnings);
  applyTitle(state, parts[3] ?? '', warnings);

  return { ok: true, state, warnings };
}
