/**
 * Deciding whether a submitted board is a board.
 *
 * The rule this file exists to hold: **validate by decoding, never by
 * re-encoding.** `CONTRIBUTING.md`'s fourth invariant says an index a newer
 * build understands and an older one does not must survive a round trip
 * byte-for-byte. That guarantee is only free while nothing rewrites the bytes,
 * so what the author sent is what gets stored, and `encodeBuild` is never
 * called on the way in.
 *
 * A v1-v5 payload legitimately re-encodes to something different — those
 * versions migrate on decode — which is exactly why a byte-equality check here
 * would reject perfectly good links. It is not performed at all.
 */
import { MAX_PAYLOAD_CHARS } from 'aow5-api-contract';
import { decodeBuild, type HeroTable, type IdTable } from 'aow5-shared/codec';

export type PayloadRejection =
  | { reason: 'empty' }
  | { reason: 'too-long'; length: number; max: number }
  | { reason: 'malformed'; detail?: string }
  | { reason: 'unsupported-version'; version: number };

/** What gets denormalised into columns so a browse query never decodes anything. */
export interface PayloadFacets {
  codecVersion: number;
  /** null when the author has not picked one, or picked one this build cannot name. */
  heroId: string | null;
  sectionCount: number;
  /** Filled slots, across every section. Unknown indices count — they are still choices. */
  itemCount: number;
  spellCount: number;
}

export type PayloadCheck =
  | { ok: true; payload: string; facets: PayloadFacets }
  | { ok: false; rejection: PayloadRejection };

/**
 * Strips what a URL puts in front of a board, and nothing else.
 *
 * The planner hands out `#b=<payload>`, and people paste the whole fragment.
 * Removing that prefix is transport bookkeeping, not a rewrite — every byte
 * after it is untouched. `decodeBuild` tolerates the same three shapes, so this
 * only decides what gets *stored*.
 */
export function normalisePayload(raw: string): string {
  return raw.trim().replace(/^#/, '').replace(/^b=/, '').trim();
}

/** The version a payload announces, without decoding it. */
function declaredVersion(payload: string): number {
  const dot = payload.indexOf('.');
  if (dot <= 0) return 0;
  const version = Number(payload.slice(0, dot));
  return Number.isInteger(version) ? version : 0;
}

export function validatePayload(raw: string, table: IdTable, heroes?: HeroTable): PayloadCheck {
  const payload = normalisePayload(raw);

  if (payload === '') return { ok: false, rejection: { reason: 'empty' } };

  // Length before decode: a decoder is not the right place to meet a megabyte.
  if (payload.length > MAX_PAYLOAD_CHARS) {
    return { ok: false, rejection: { reason: 'too-long', length: payload.length, max: MAX_PAYLOAD_CHARS } };
  }

  const result = decodeBuild(payload, table, heroes);
  if (!result.ok) {
    return result.reason === 'unsupported-version'
      ? { ok: false, rejection: { reason: 'unsupported-version', version: result.version ?? 0 } }
      : { ok: false, rejection: { reason: 'malformed', ...(result.detail ? { detail: result.detail } : {}) } };
  }

  const { state } = result;
  let itemCount = 0;
  let spellCount = 0;
  for (const section of state.sections) {
    for (const slot of section.slots) if (slot !== null) itemCount += 1;
    for (const spell of section.spells) if (spell !== null) spellCount += 1;
  }

  // An empty board is a well-formed payload and a pointless build. Publishing
  // one is a UI decision, not a codec one, so it is reported rather than
  // refused: the caller can require `itemCount > 0` for a *published* build and
  // still let a draft be saved.
  return {
    ok: true,
    payload,
    facets: {
      codecVersion: declaredVersion(payload),
      heroId: state.hero,
      sectionCount: state.sections.length,
      itemCount,
      spellCount,
    },
  };
}
