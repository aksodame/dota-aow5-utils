/**
 * The HUD bundle, and the reforge maths inside it.
 *
 * `panorama/layout/custom_game/hud/script.vjs_c` is the addon's compiled client
 * bundle. The published pak ships it minified — no module headers, no readable
 * identifiers — so nothing here anchors on a name. Every pattern below is
 * anchored on *structure*: the shape of an expression the minifier cannot
 * rewrite (`this.iterationCount`, `Math.sqrt`, a table subscript feeding a
 * `void 0` fallback), with `[\w$]+` wherever an identifier used to be.
 *
 * The `$` matters: a JS identifier may contain one and the minifier hands them
 * out (pak 3462334284 named the reforge-level reader `$a`). A bare `\w+` misses
 * exactly those, and which function draws the short straw changes per build.
 *
 * What comes out is the arithmetic behind an item's rolled stats: how far a
 * value may move from its base, to how many decimals, and which discrete rolls
 * a given reforge level can actually produce. `packages/aow5-shared/src/data/
 * rolls.ts` is the other half — the same maths, running in the browser against
 * these tables.
 *
 * The transcription this was checked against, and the reasoning about what a
 * reforge can and cannot change, is in `private/reforging_about.md`. When the
 * addon reorganises, every failure here is loud: an extractor that quietly
 * returned a default would ship a table of confidently wrong numbers.
 */
import type { RollTables } from '../../../packages/aow5-shared/src/types/rolls.ts';

/**
 * The script text out of a compiled Panorama resource.
 *
 * Source 2 wraps the bundle in a binary resource header, but the payload is
 * plain UTF-8 — so the source is simply the longest printable run in the file.
 */
export function scriptText(buf: Buffer): string {
  let best: [number, number] = [0, 0];
  let start = -1;
  for (let i = 0; i <= buf.length; i++) {
    const byte = i < buf.length ? (buf[i] as number) : 0;
    const printable = byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte !== 127);
    if (printable) {
      if (start < 0) start = i;
      continue;
    }
    if (start >= 0 && i - start > best[1] - best[0]) best = [start, i];
    start = -1;
  }
  return buf.subarray(best[0], best[1]).toString('utf8');
}

class MissingPattern extends Error {
  constructor(what: string) {
    super(
      `the HUD bundle no longer contains ${what} — the addon reorganised, and this extractor needs re-reading against it`,
    );
    this.name = 'MissingPattern';
  }
}

function match(source: string, pattern: RegExp, what: string): RegExpMatchArray {
  const found = pattern.exec(source);
  if (found === null) throw new MissingPattern(what);
  return found;
}

/** A capture group that must be there, as a number. */
function num(found: RegExpMatchArray, group: number, what: string): number {
  const raw = found[group];
  const value = raw === undefined ? NaN : Number(raw);
  if (!Number.isFinite(value)) throw new MissingPattern(`a number for ${what}`);
  return value;
}

/**
 * The object literal assigned to `name`, as a flat key -> number table.
 *
 * Scanned rather than evaluated: the bundle is somebody else's code and this
 * runs in the pipeline, so the scanner only ever accepts `identifier:number`
 * pairs and refuses anything it does not recognise.
 */
function numberTable(source: string, name: string, what: string): Record<string, number> {
  const at = source.indexOf(`${name}={`);
  if (at < 0) throw new MissingPattern(`the table ${what}`);

  const out: Record<string, number> = {};
  const entry = /([A-Za-z_][A-Za-z0-9_]*):(-?\d+(?:\.\d+)?)/y;
  let cursor = at + name.length + 2;
  for (;;) {
    entry.lastIndex = cursor;
    const found = entry.exec(source);
    if (found === null) throw new MissingPattern(`a readable entry in ${what} at offset ${cursor}`);
    out[found[1] as string] = Number(found[2]);
    cursor = entry.lastIndex;

    const next = source[cursor];
    if (next === ',') {
      cursor += 1;
      continue;
    }
    if (next === '}') return out;
    throw new MissingPattern(`the end of ${what} (found ${JSON.stringify(next ?? 'EOF')})`);
  }
}

/**
 * The constants a pak may have moved to the server, and where they came from.
 *
 * Pak 3011606331 stopped rolling the enhancement and the divine forge in the
 * client: both now arrive pre-decided in the `item_attributes` net table, and
 * the server Lua that draws them is encrypted. Their bounds are therefore not
 * in the bundle to read. `carried` is the last extraction that did read them —
 * the committed `rolls.json` — and every field taken from it is named in
 * `carriedFields`, so the step can say so rather than pass it off as fresh.
 */
export type CarriedRolls = Pick<RollTables, 'enhancedLevel' | 'enhancedBonusPct' | 'divine'>;

/**
 * Everything the browser needs to say what a stat can roll to.
 *
 * Each block below names the addon function it was read out of, in the readable
 * form `private/item-seed.mjs --refresh` dumps from an unminified pak. The
 * regexes match the minified form of exactly those functions.
 */
export function extractRollTables(
  source: string,
  generatedAt: string,
  carried?: CarriedRolls,
): RollTables & { carriedFields: string[] } {
  const carriedFields: string[] = [];
  // randomPctOf: `const pct = ATTR_RANDOM[key]; return pct ?? (isAbilityValueKey(key) ? 70 : undefined)`
  const random = match(
    source,
    /function [\w$]+\(([\w$]+)\)\{const ([\w$]+)=([\w$]+)\[\1\];return null!=\2\?\2:[\w$]+\(\1\)\?(\d+):void 0\}/,
    'the per-attribute random-percentage lookup',
  );
  const randomTable = numberTable(source, random[3] as string, 'ATTR_RANDOM');
  const abilityValuePct = num(random, 4, 'the default ability-value percentage');

  // The rounding helper: `const places = ATTR_RANDOM_DECIMALS[key] ?? 0`
  const decimals = match(
    source,
    /function [\w$]+\(([\w$]+),([\w$]+)\)\{var ([\w$]+);const ([\w$]+)=null!==\(\3=([\w$]+)\[\1\]\)&&void 0!==\3\?\3:0;if\(\4<=0\)return Math\.round\(\2\)/,
    'the attribute rounding helper',
  );
  const decimalsTable = numberTable(source, decimals[5] as string, 'ATTR_RANDOM_DECIMALS');

  /*
   * normal01 — the roll itself.
   *
   * `Math.round(value * 5) / 5 - 0.5` quantises the draw into six steps before
   * the iteration bonus shifts it and the cap trims it, which is why a rolled
   * stat has a handful of reachable values rather than a continuum. Both nines
   * are captured: one clamps the iteration count, one divides it, and they have
   * always been the same number — if a rebalance ever splits them, this refuses
   * to guess which one the site should use.
   */
  const roll = match(
    source,
    /normal01\([^)]*\)\{[\s\S]{0,600}?=([\d.]+)\*Math\.sqrt\(Math\.min\((\d+),this\.iterationCount\)\/(\d+)\)-([\d.]+);return Math\.min\(([\d.]+),Math\.round\((\d+)\*[\w$]+\)\/(\d+)-([\d.]+)\+[\w$]+\)\}/,
    "the roll's own quantiser (normal01)",
  );
  const bonusLevels = num(roll, 2, 'the iteration clamp');
  if (num(roll, 3, 'the iteration divisor') !== bonusLevels) {
    throw new MissingPattern('one iteration ceiling: the clamp and the divisor in normal01 have diverged');
  }
  const steps = num(roll, 6, 'the roll quantiser');
  if (num(roll, 7, 'the roll quantiser') !== steps) {
    throw new MissingPattern('one quantiser in normal01: the multiplier and the divisor disagree');
  }

  // getItemReforgeLevel: `min(9, floor(tail / 10) + tail % 10)`
  const level = match(
    source,
    /function [\w$]+\(([\w$]+)\)\{const ([\w$]+)=[\w$]+\(\1\);return Math\.min\((\d+),Math\.floor\(\2\/10\)\+\2%10\)\}/,
    'the reforge-level reader',
  );
  /*
   * Since pak 3462334284 the bundle also inlines the same arithmetic elsewhere
   * (a second reader that takes the raw seed number rather than an item). Every
   * copy has to agree on the ceiling, or this refuses to pick one.
   */
  const ceilings = [...source.matchAll(/Math\.min\((\d+),Math\.floor\(([\w$]+)\/10\)\+\2%10\)/g)].map((found) =>
    Number(found[1]),
  );
  if (ceilings.some((ceiling) => ceiling !== Number(level[3]))) {
    throw new MissingPattern(`one reforge ceiling: the bundle now uses ${[...new Set(ceilings)].join(', ')}`);
  }

  /*
   * The fixed affix: `round(key, 1.3 * (base + roll * base * pct * 0.01))`.
   *
   * Its 30% is the one bonus a reforge can never move — the initial seed picks
   * which attribute wears it, and nothing after that touches the choice.
   */
  const fixed = match(
    source,
    /\{return [\w$]+\([\w$]+,([\d.]+)\*\([\w$]+\+[\w$]+\*[\w$]+\*[\w$]+\*\.01\)\)\}/,
    'the fixed-attribute bonus',
  );

  /*
   * The enhancement: an attribute, a level that unlocks it, and a percentage,
   * all drawn from the initial seed. A plan can only ever name a band for the
   * last two, which is what these bounds are for.
   */
  const enhancedFound = /nextInt\((\d+),(\d+)\)[\s\S]{0,200}?bonusPct:[\w$]+\.nextInt\((\d+),(\d+)\)/.exec(source);
  let enhancedLevel: [number, number];
  let enhancedBonusPct: [number, number];
  if (enhancedFound !== null) {
    enhancedLevel = [
      num(enhancedFound, 1, 'the enhancement level floor'),
      num(enhancedFound, 2, 'the enhancement level ceiling'),
    ];
    enhancedBonusPct = [num(enhancedFound, 3, 'the enhancement floor'), num(enhancedFound, 4, 'the enhancement ceiling')];
  } else if (carried !== undefined) {
    enhancedLevel = carried.enhancedLevel;
    enhancedBonusPct = carried.enhancedBonusPct;
    carriedFields.push('enhancedLevel', 'enhancedBonusPct');
  } else {
    throw new MissingPattern('the enhancement bounds');
  }

  /*
   * The divine forge: a quality gate, a chance, a level and two bonuses.
   *
   * All five in one expression in the addon, so all five come out of one match
   * — which is also the honest way to read it: they are one roll made at the
   * item's creation, not five constants that happen to sit together.
   */
  const divineFound = (
    /if\(Number\([\s\S]{0,80}?itemQuality[\s\S]{0,60}?\)<(\d+)\)return;const [\w$]+=[\w$]+\(1e3\*[\w$]+\+\d+\),[\w$]+=[\w$]+\.next\(\)<\.(\d+);if\(![\w$]+\)return;const [\w$]+=[\w$]+\.next\(\),[\w$]+=[\w$]+<\.\d+\?(\d+):[\w$]+<\.\d+\?(\d+):(\d+);return\{hasDivineForged:[\w$]+,requiredReforgeLevel:[\w$]+,bonusPct:(\d+),abilityBonusPct:(\d+)/
  ).exec(source);
  let divine: RollTables['divine'];
  if (divineFound !== null) {
    divine = {
      minQuality: num(divineFound, 1, 'the divine quality gate'),
      chancePct: num(divineFound, 2, 'the divine chance'),
      // The roll picks one of three levels; the band is the outer two.
      level: [num(divineFound, 3, 'the divine level floor'), num(divineFound, 5, 'the divine level ceiling')],
      bonusPct: num(divineFound, 6, 'the divine bonus'),
      abilityBonusPct: num(divineFound, 7, 'the divine ability bonus'),
    };
  } else if (carried !== undefined) {
    divine = { ...carried.divine };
    carriedFields.push('divine');
    /*
     * What the client still says about the forge, checked against the carry.
     *
     * It keeps a quality gate (`itemQuality >= 5`) and the two bonuses as
     * display fallbacks. If either moved, the carried table is stale in a way
     * this step can see, and it refuses rather than ship both numbers.
     */
    const gate = /Number\(null!==\([\w$]+=[\w$]+\.itemQuality\)&&void 0!==[\w$]+\?[\w$]+:0\)>=(\d+)&&/.exec(source);
    if (gate !== null && Number(gate[1]) !== divine.minQuality) {
      throw new MissingPattern(`a divine quality gate matching the carried ${divine.minQuality} (the bundle says ${gate[1]})`);
    }
    const bonus =
      /startsWith\("ability_"\)\?null!==\([\w$]+=null==[\w$]+\?void 0:[\w$]+\.abilityBonusPct\)&&void 0!==[\w$]+\?[\w$]+:(\d+):null!==\([\w$]+=null==[\w$]+\?void 0:[\w$]+\.bonusPct\)&&void 0!==[\w$]+\?[\w$]+:(\d+)/.exec(
        source,
      );
    if (bonus !== null && (Number(bonus[1]) !== divine.abilityBonusPct || Number(bonus[2]) !== divine.bonusPct)) {
      throw new MissingPattern(
        `divine bonuses matching the carried +${divine.bonusPct}%/+${divine.abilityBonusPct}% (the bundle says +${bonus[2]}%/+${bonus[1]}%)`,
      );
    }
  } else {
    throw new MissingPattern('the divine forge roll');
  }

  /*
   * The stable seed's tail — `… % MOD * 100 + 20`.
   *
   * The fixed attribute and every `ability_value_*` roll from this rather than
   * from the item's own tail, so they are drawn at *this* iteration count
   * whatever the item's reforge level is. That is the reason the site can say a
   * fixed stat never improves with reforging: it is not an opinion, it is this
   * constant.
   */
  const stable = [...source.matchAll(/%[\w$]+\*100\+(\d+)\}\(/g)].map((found) => Number(found[1]));
  if (stable.length === 0) throw new MissingPattern("the stable attribute seed's tail");
  const stableTail = stable[0] as number;
  if (stable.some((tail) => tail !== stableTail)) {
    throw new MissingPattern(`one stable tail: the bundle now uses ${[...new Set(stable)].join(', ')}`);
  }

  return {
    schema: 1,
    generatedAt,
    maxReforgeLevel: num(level, 3, 'the reforge ceiling'),
    stableTail,
    fixedBonusPct: Math.round((num(fixed, 1, 'the fixed multiplier') - 1) * 100),
    enhancedLevel,
    enhancedBonusPct,
    roll: {
      steps,
      cap: num(roll, 5, 'the roll cap'),
      centre: num(roll, 8, "the roll's centre"),
      bonusScale: num(roll, 1, 'the iteration bonus scale'),
      bonusOffset: -num(roll, 4, 'the iteration bonus offset'),
      bonusLevels,
    },
    divine,
    abilityValuePct,
    random: randomTable,
    decimals: decimalsTable,
    reforgeCost: extractReforgeCost(source),
    carriedFields,
  };
}

/**
 * What a reforge costs, out of the two expressions that compute it.
 *
 * The addon prices a reforge from the item's own level and grade. Two helpers
 * do the work and both are short enough to read whole:
 *
 *   scale(value, level)  = floor(value * 1.15 ** max(0, level))
 *   withSurcharge(v, l)  = scale(v, l) + (l >= 6 ? 5 : 0)
 *
 * and the material table itself, which splits on grade:
 *
 *   quality >= 6 -> { M507: max(0, lvl - 3), M315: 3 * lvl }
 *   otherwise    -> { M315: ceil(2 * lvl * 1.5), M009: 5 * lvl }
 *
 * Anchored on structure rather than on names, like everything else in this
 * file — `1.15`, the `**`, the `Math.ceil(2*…*1.5)` and the two essence ids are
 * what the minifier cannot rewrite. A miss here is not fatal: the field is
 * optional and a run that cannot find it simply emits no cost table, because
 * the alternative is a page of confidently wrong prices.
 */
function extractReforgeCost(source: string): RollTables['reforgeCost'] {
  // `function bp(e,t){return Math.floor(e*1.15**Math.max(0,t))}`
  const scale = source.match(
    /function [\w$]+\(([\w$]+),([\w$]+)\)\{return Math\.floor\(\1\*([\d.]+)\*\*Math\.max\(0,\2\)\)\}/,
  );
  // `function Ap(e,t){const a=t>=6?5:0;return bp(e,t)+a}`
  const surcharge = source.match(/function [\w$]+\(([\w$]+),([\w$]+)\)\{const [\w$]+=\2>=(\d+)\?(\d+):0;return [\w$]+\(\1,\2\)\+[\w$]+\}/);
  /*
   * The material table. Both branches in one pattern, so a rebalance that
   * changes one of them and not the other fails rather than half-matching.
   */
  const materials = source.match(
    /\{item_M507:Math\.max\(0,([\w$]+)-(\d+)\),item_M315:(\d+)\*\1\}:\{item_M315:Math\.ceil\((\d+)\*\1\*([\d.]+)\),item_M009:(\d+)\*\1\}/,
  );
  // The grade the table splits on, and the gold: `bp((u=n,1e3*Math.max(1,u)),l)`
  const threshold = source.match(/const [\w$]+=Math\.max\(1,([\w$]+)\),[\w$]+=([\w$]+)>=(\d+)\?\{item_M507:/);
  const gold = source.match(/itemId:"item_gold",need:[\w$]+\(\([\w$]+=([\w$]+),(\d+e?\d*)\*Math\.max\(1,[\w$]+\)\)/);

  if (scale === null || surcharge === null || materials === null || threshold === null || gold === null) {
    return undefined;
  }

  const n = (m: RegExpMatchArray, at: number): number => Number(m[at]);
  return {
    levelScale: n(scale, 3),
    surcharge: n(surcharge, 4),
    surchargeFrom: n(surcharge, 3),
    goldPerLevel: Number(gold[2]),
    materials: {
      mythicThreshold: n(threshold, 3),
      mythic: {
        item_M507: { perLevel: 1, offset: -n(materials, 2) },
        item_M315: { perLevel: n(materials, 3) },
      },
      common: {
        item_M315: { perLevel: n(materials, 4) * n(materials, 5) },
        item_M009: { perLevel: n(materials, 6) },
      },
    },
  };
}
