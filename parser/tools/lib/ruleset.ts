import { braceMatch } from './jsonScan.ts';
import { scriptText } from './hudScript.ts';

/**
 * The addon's per-season ruleset tree.
 *
 * `panorama/layout/custom_game/vendor/data/rulesets/` holds a manifest and, per
 * season, a compiled copy of every table the client reads — `ak_items`,
 * `ak_gems`, `ak_talent` and sixteen more. A season's file carries only what it
 * overrides; the manifest says which rows those are and which maps the season
 * plays on.
 *
 * These are `.vjs_c` like the publish payloads step 02 already reads, but they
 * are not publish payloads: instead of
 * `__AK_PANORAMA_PUBLISH_DATA__("@/json/…", {…})` they assign into a shared
 * object, `raw.manifest = {…}` for the manifest and
 * `ruleset["<table>"] = {…}` for a table. Hence a reader of their own.
 *
 * Only `ak_life_souls` is read today, because it is the addon's own answer to
 * which items are Life Souls — the client refuses to offer one that is not in
 * it — and the S1 copy being empty is what makes the slot a second-season slot
 * rather than a hardcoded list of thirty ids. The rest of the tree is here in
 * the comment rather than in code because nothing downstream asks for it yet.
 */

/** One season in `rulesets/manifest.vjs_c`. */
export interface RulesetSeason {
  id: string;
  /** Room ids the season plays on, e.g. `["s2", "s2-1", "s2-2"]`. */
  maps?: string[];
}

export interface RulesetManifest {
  version: number;
  /** The season the others are diffed against. */
  baseSeason: string;
  seasons: RulesetSeason[];
}

/** Pulls `<lhs> = {…}` out of a compiled ruleset script. */
function assignedObject(buf: Buffer, lhs: string, source: string): Record<string, unknown> {
  const text = scriptText(buf);
  const marker = `${lhs}=`;
  const at = text.indexOf(marker);
  if (at < 0) {
    throw new Error(
      `ruleset: assignment ${JSON.stringify(lhs)} not found in ${source}. ` +
        'The addon may have changed how it ships its season tables.',
    );
  }
  const start = at + marker.length;
  if (text[start] !== '{') {
    throw new Error(`${source}: ${lhs} is not an object literal`);
  }
  const end = braceMatch(text, start);
  return JSON.parse(text.slice(start, end)) as Record<string, unknown>;
}

export function readRulesetManifest(buf: Buffer, source: string): RulesetManifest {
  const raw = assignedObject(buf, 'raw.manifest', source) as unknown as RulesetManifest;
  if (!Array.isArray(raw.seasons) || raw.seasons.length === 0) {
    throw new Error(`${source}: manifest names no seasons`);
  }
  return raw;
}

/**
 * One season's copy of one table.
 *
 * An empty object is a real answer — S1's `ak_life_souls` is `{}`, which is the
 * addon saying the season has no Life Souls — so it is returned rather than
 * treated as a miss.
 */
export function readRulesetTable(buf: Buffer, table: string, source: string): Record<string, unknown> {
  return assignedObject(buf, `ruleset[${JSON.stringify(table)}]`, source);
}
