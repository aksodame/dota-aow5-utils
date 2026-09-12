/**
 * A read-only decoder for the codec the *old* site shipped: v1-v6.
 *
 * The live codec refuses those versions outright, and deliberately — a v6 board
 * was up to nine sections, each with its own name, description, items and
 * spells, and there is no honest way to fold nine loadouts into the one a build
 * is now. That refusal is the rule for anything a reader can reach. This file
 * is the one exception, and it exists for exactly one job: the one-shot import
 * that turns each of those sections into a build of its own.
 *
 * So it lives under `scripts/`, not in `core/`. Nothing the server serves may
 * import it, and the moment the import has run on production it is dead code
 * that can be deleted. Decode only: there is no encoder here, because writing a
 * v6 payload is something this project must never do again.
 *
 * The format, restated from the codec that wrote it:
 *
 *   `<version>.<slots>[.<names>[.<descriptions>[.<spells>]]]`
 *
 * slots segment
 *   [0..1]  u16be  item table fingerprint
 *   [2]     u8     section count, 1-9
 *   [3..]          occupancy bitmap over `count * 15` slots, MSB-first
 *   then           packed 12-bit item indices, one per set bit, ascending
 *
 * names / descriptions segments — each omitted when nothing is set
 *   [0..1]  u16be  presence bitmap over the nine sections, **LSB-first**
 *   then           per present section: a varint byte length, then UTF-8
 *
 * spells segment — omitted when there is no hero and no spell
 *   [0]     u8     hero, as its 1-based frozen roster position (0 = none)
 *   [1..]          occupancy bitmap over `count * 7` spell slots, MSB-first
 *   then           packed 12-bit ability-table indices, ascending
 *
 * The two bitmaps run in opposite directions, which is not a typo here: the
 * slot and spell bitmaps are MSB-first over a byte array, while the text
 * segment's is a little-endian bit test over one u16. Both are copied from the
 * original rather than tidied, because the payloads in the database were
 * written by that code and are the only thing that gets a vote.
 *
 * Version differences this handles:
 *   v6  what every published build on the old site actually is.
 *   v5  identical, except the spell bitmap is six wide — the `f` heal was
 *       appended as a seventh key afterwards, which is what made v6 a version.
 *   v3, v4  the same 15-slot layout; they differ only in segments that are
 *       optional anyway.
 *   v1, v2  a nine-slot untyped section that the old decoder re-homed into the
 *       typed layout. Not reimplemented — see `decodeLegacyPayload`, which
 *       refuses them by name so an import reports them instead of guessing.
 */

/** Slots in one old section. Same fifteen the live loadout has. */
const SLOTS_PER_SECTION = 15;
/** Ability keys in v6. v5 had six; see `spellWidthFor`. */
const SPELLS_PER_SECTION = 7;
const V5_SPELLS_PER_SECTION = 6;
const MAX_SECTIONS = 9;
const INDEX_BITS = 12;
/** 0xFFF meant "explicitly empty" and never named an item. */
const RESERVED_INDEX = (1 << INDEX_BITS) - 1;

export type LegacySlot = { k: 'id'; id: string } | { k: 'unknown'; idx: number };

export interface LegacySection {
  name: string | null;
  description: string | null;
  /** Always 15 long; `null` is an empty slot. */
  slots: (LegacySlot | null)[];
  /** Always 7 long, in wire order `q w e d r passive f`. */
  spells: (LegacySlot | null)[];
}

export interface LegacyBoard {
  version: number;
  hero: string | null;
  /** A roster position this deployment cannot name, kept rather than dropped. */
  heroUnknown: number | null;
  sections: LegacySection[];
}

export type LegacyDecode =
  | { ok: true; board: LegacyBoard }
  | { ok: false; reason: string };

/** The frozen tables, in the shape this decoder reads them. */
export interface LegacyTables {
  /** Item ids by table position. A hole is `''` and decodes as `unknown`. */
  itemIds: readonly string[];
  /** Ability ids by table position. */
  abilityIds: readonly string[];
  /** The roster, in config order. A hero's byte is its position here plus one. */
  heroIds: readonly string[];
}

function base64UrlToBytes(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('base64url: illegal character');
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/** MSB-first, which is how the indices were packed. */
function readPacked(bytes: Uint8Array, count: number): number[] | null {
  if (bytes.length * 8 < count * INDEX_BITS) return null;
  const out: number[] = [];
  let pos = 0;
  for (let n = 0; n < count; n += 1) {
    let value = 0;
    for (let i = 0; i < INDEX_BITS; i += 1) {
      const byte = bytes[pos >> 3] ?? 0;
      value = (value << 1) | ((byte >> (7 - (pos & 7))) & 1);
      pos += 1;
    }
    out.push(value >>> 0);
  }
  return out;
}

/** Set bit positions in an MSB-first bitmap, ascending. */
function occupiedSlots(bitmap: Uint8Array, slotCount: number): number[] {
  const out: number[] = [];
  for (let slot = 0; slot < slotCount; slot += 1) {
    const byte = bitmap[slot >> 3] ?? 0;
    if ((byte >> (7 - (slot & 7))) & 1) out.push(slot);
  }
  return out;
}

const bitmapBytesFor = (sections: number, perSection: number) => Math.ceil((sections * perSection) / 8);

const textDecoder = new TextDecoder('utf-8', { fatal: false });

/**
 * Reads a names or descriptions segment.
 *
 * Returns one entry per section that carried text; anything absent stays
 * `undefined`. Text was cosmetic to the old decoder — a corrupt segment cost
 * the caller its names and never its items — so a failure here is `null` and
 * the caller carries on.
 */
function decodeTextSegment(payload: string): (string | undefined)[] | null {
  try {
    const bytes = base64UrlToBytes(payload);
    if (bytes.length < 2) return null;
    const bitmap = ((bytes[0] ?? 0) << 8) | (bytes[1] ?? 0);
    const out: (string | undefined)[] = [];
    let p = 2;
    for (let i = 0; i < MAX_SECTIONS; i += 1) {
      // LSB-first over the u16, unlike the slot bitmap above.
      if (((bitmap >> i) & 1) === 0) continue;
      let len = 0;
      let shift = 0;
      for (;;) {
        if (p >= bytes.length) return null;
        const b = bytes[p] ?? 0;
        p += 1;
        len |= (b & 0x7f) << shift;
        if ((b & 0x80) === 0) break;
        shift += 7;
        if (shift > 28) return null;
      }
      if (p + len > bytes.length) return null;
      out[i] = textDecoder.decode(bytes.subarray(p, p + len));
      p += len;
    }
    return out;
  } catch {
    return null;
  }
}

/** v5 predates the `f` key, so its spell bitmap is one column narrower. */
const spellWidthFor = (version: number): number =>
  version <= 5 ? V5_SPELLS_PER_SECTION : SPELLS_PER_SECTION;

/**
 * Decodes one stored payload into the board it was written from.
 *
 * `tables` are the *current* frozen tables. They are append-only, so a position
 * an old payload names still means what it meant — which is the property that
 * makes importing years-old links safe. The fingerprint in the payload is read
 * past rather than checked: a mismatch only ever meant "these tables have grown
 * since", which is exactly the expected state here.
 */
export function decodeLegacyPayload(raw: string, tables: LegacyTables): LegacyDecode {
  const trimmed = raw.replace(/^#/, '').replace(/^b=/, '').trim();
  if (trimmed === '') return { ok: false, reason: 'empty payload' };

  const dot = trimmed.indexOf('.');
  if (dot <= 0) return { ok: false, reason: 'missing version separator' };
  const version = Number(trimmed.slice(0, dot));
  if (!Number.isInteger(version)) return { ok: false, reason: 'bad version' };
  if (version === 1 || version === 2) {
    // These carried nine untyped slots per section, which the old decoder
    // re-homed into the typed layout by kind. Refused rather than guessed —
    // the import prints them so a human can decide.
    return { ok: false, reason: `codec v${version} (pre-typed layout) is not imported` };
  }
  if (version < 1 || version > 6) return { ok: false, reason: `codec v${version} is not a legacy version` };

  const parts = trimmed.slice(dot + 1).split('.');
  const slotsPart = parts[0] ?? '';
  const namesPart = parts[1] ?? '';
  const descsPart = parts[2] ?? '';
  const spellsPart = parts[3] ?? '';

  let bytes: Uint8Array;
  try {
    bytes = base64UrlToBytes(slotsPart);
  } catch {
    return { ok: false, reason: 'slots segment is not base64url' };
  }
  if (bytes.length < 4) return { ok: false, reason: 'slots segment too short' };

  const sectionCount = bytes[2] ?? 0;
  if (sectionCount < 1 || sectionCount > MAX_SECTIONS) {
    return { ok: false, reason: `section count ${sectionCount} out of range` };
  }

  const sections: LegacySection[] = Array.from({ length: sectionCount }, () => ({
    name: null,
    description: null,
    slots: Array.from({ length: SLOTS_PER_SECTION }, () => null),
    spells: Array.from({ length: SPELLS_PER_SECTION }, () => null),
  }));

  const bitmapBytes = bitmapBytesFor(sectionCount, SLOTS_PER_SECTION);
  if (bytes.length < 3 + bitmapBytes) return { ok: false, reason: 'slots segment truncated' };

  const occupied = occupiedSlots(bytes.subarray(3, 3 + bitmapBytes), sectionCount * SLOTS_PER_SECTION);
  const indices = readPacked(bytes.subarray(3 + bitmapBytes), occupied.length);
  if (indices === null) return { ok: false, reason: 'slots segment truncated' };

  occupied.forEach((slot, n) => {
    const idx = indices[n] ?? 0;
    if (idx === RESERVED_INDEX) return;
    const section = Math.floor(slot / SLOTS_PER_SECTION);
    const at = slot % SLOTS_PER_SECTION;
    const id = tables.itemIds[idx];
    // A hole or a position past the table is kept verbatim, exactly as the old
    // decoder did, so nothing is silently resolved to the wrong item.
    sections[section]!.slots[at] = id ? { k: 'id', id } : { k: 'unknown', idx };
  });

  for (const [part, field] of [
    [namesPart, 'name'],
    [descsPart, 'description'],
  ] as const) {
    if (part === '') continue;
    const text = decodeTextSegment(part);
    if (text === null) continue;
    text.forEach((value, i) => {
      if (value !== undefined && i < sections.length) sections[i]![field] = value;
    });
  }

  let hero: string | null = null;
  let heroUnknown: number | null = null;

  if (spellsPart !== '') {
    let spellBytes: Uint8Array | null = null;
    try {
      spellBytes = base64UrlToBytes(spellsPart);
    } catch {
      spellBytes = null;
    }
    const width = spellWidthFor(version);
    const spellBitmapBytes = bitmapBytesFor(sectionCount, width);
    if (spellBytes !== null && spellBytes.length >= 1 + spellBitmapBytes) {
      const heroByte = spellBytes[0] ?? 0;
      if (heroByte > 0) {
        const id = tables.heroIds[heroByte - 1];
        if (id === undefined) heroUnknown = heroByte;
        else hero = id;
      }

      const spellOccupied = occupiedSlots(
        spellBytes.subarray(1, 1 + spellBitmapBytes),
        sectionCount * width,
      );
      const spellIndices = readPacked(spellBytes.subarray(1 + spellBitmapBytes), spellOccupied.length);
      if (spellIndices !== null) {
        spellOccupied.forEach((slot, n) => {
          const idx = spellIndices[n] ?? 0;
          if (idx === RESERVED_INDEX) return;
          const section = Math.floor(slot / width);
          const at = slot % width;
          if (section >= sections.length || at >= SPELLS_PER_SECTION) return;
          const id = tables.abilityIds[idx];
          sections[section]!.spells[at] = id ? { k: 'id', id } : { k: 'unknown', idx };
        });
      }
    }
  }

  return { ok: true, board: { version, hero, heroUnknown, sections } };
}
