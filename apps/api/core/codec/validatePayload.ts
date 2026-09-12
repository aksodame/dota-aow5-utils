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
 * There is no longer any version that migrates on decode, so a byte-equality
 * check would now pass — and it is still not performed, because the moment a
 * v8 arrives that does migrate, the check would start rejecting perfectly good
 * links and the reason would have been forgotten.
 */
import { MAX_PAYLOAD_CHARS } from 'aow5-api-contract';
import { decodeBuild, type HeroTable, type IdTable } from 'aow5-shared/codec';
import { ABILITY_SLOTS } from 'aow5-shared/types';

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
  /** Likewise null for a room this deployment cannot resolve. */
  /**
   * The rooms the payload names. Empty when it names none.
   *
   * A list since codec v8. The *tier* is no longer derived from these: it is
   * the author's own field on the build, because a guide may cover a tier
   * without naming a room at all.
   */
  mapIds: string[];
  /** Filled slots. Unknown indices count — they are still choices the author made. */
  itemCount: number;
  spellCount: number;
  /**
   * Which of the seven keys hold a spell, as the game's own slot names.
   *
   * Here so the service can refuse a `mainSpell` naming an empty slot without
   * decoding the payload a second time — a headline pointing at a spell the
   * build does not have would draw a hole in every row it appears in.
   */
  spellKeys: string[];
  /** The title the payload carries, if any. The stored build's own title wins. */
  title: string | null;
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

export function validatePayload(
  raw: string,
  table: IdTable,
  heroes?: HeroTable,
  /**
   * Tier per map id. Passed in rather than imported so this stays testable
   * against a made-up table, exactly as `table` and `heroes` are.
   */
): PayloadCheck {
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
  const itemCount = state.slots.filter((slot) => slot !== null).length;
  const spellCount = state.spells.filter((spell) => spell !== null).length;
  const spellKeys = ABILITY_SLOTS.filter((_, index) => state.spells[index] != null);

  // An empty loadout is a well-formed payload and a pointless build. Publishing
  // one is a UI decision, not a codec one, so it is reported rather than
  // refused: the caller can require `itemCount > 0` for a *published* build and
  // still let a draft be saved.
  return {
    ok: true,
    payload,
    facets: {
      codecVersion: declaredVersion(payload),
      heroId: state.hero,
      mapIds: [...state.maps],
      itemCount,
      spellCount,
      spellKeys: [...spellKeys],
      title: state.title,
    },
  };
}
