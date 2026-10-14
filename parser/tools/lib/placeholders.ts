/**
 * Substitutes `%token%` placeholders in localized description strings.
 *
 * Game strings interleave two things that both use `%`:
 *   `%ability_self_movespeed_pct%%%`
 *    ^-------- named token -------^^^-- a literal percent sign (`%%`)
 *
 * A single left-to-right pass with an alternation that tries `%%` first gets
 * this right: the named token consumes its own closing `%`, leaving exactly one
 * `%%` behind. Getting it wrong yields either a doubled `%%` or a swallowed
 * digit, so it is pinned by a golden fixture.
 */

/** Top-level item fields that descriptions may reference by name. */
const TOP_LEVEL_KEYS = [
  'AbilityCooldown',
  'AbilityManaCost',
  'AbilityCastRange',
  'AbilityCastPoint',
  'AbilityHealthCostPct',
  'ItemCost',
  'Level',
  'TimeCost',
] as const;

export interface SubstitutionSource {
  values: Record<string, number | string>;
  top: Record<string, unknown>;
}

export interface SubstitutionResult {
  text: string;
  /** Tokens we could not resolve. Left verbatim in `text`, never guessed at. */
  unresolved: string[];
}

/** Trims trailing zeros and caps at 2 decimals; no thousands separators. */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100);
}

function lookup(name: string, src: SubstitutionSource): string | undefined {
  const tryKey = (key: string): string | undefined => {
    const v = src.values[key];
    if (v === undefined) return undefined;
    return typeof v === 'number' ? formatNumber(v) : String(v);
  };

  // Descriptions reference stats both bare and with an `ability_value_` /
  // `ability_` prefix that does not appear in the AbilityValues map itself.
  const direct = tryKey(name);
  if (direct !== undefined) return direct;

  if (name.startsWith('ability_value_')) {
    const stripped = tryKey(name.slice('ability_value_'.length));
    if (stripped !== undefined) return stripped;
  }
  if (name.startsWith('ability_')) {
    const stripped = tryKey(name.slice('ability_'.length));
    if (stripped !== undefined) return stripped;
  }

  const lowerName = name.toLowerCase();
  for (const key of TOP_LEVEL_KEYS) {
    if (key.toLowerCase() === lowerName) {
      const v = src.top[key];
      if (typeof v === 'number') return formatNumber(v);
      if (typeof v === 'string') return v;
    }
  }

  // Case-insensitive last chance against the stat map.
  for (const [key, value] of Object.entries(src.values)) {
    if (key.toLowerCase() === lowerName) {
      return typeof value === 'number' ? formatNumber(value) : String(value);
    }
  }

  return undefined;
}

const TOKEN_RE = /%%|%([A-Za-z0-9_]+)%/g;

export function substitute(text: string, src: SubstitutionSource): SubstitutionResult {
  const unresolved: string[] = [];
  const out = text.replace(TOKEN_RE, (match, name: string | undefined) => {
    if (name === undefined) return '%'; // the `%%` branch
    const resolved = lookup(name, src);
    if (resolved === undefined) {
      unresolved.push(name);
      return match; // leave the literal token; never invent a number
    }
    return resolved;
  });
  return { text: out, unresolved };
}
