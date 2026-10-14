import fs from 'node:fs';
import path from 'node:path';
import { DIRS, ensureDirs } from './lib/paths.ts';
import { extractRollTables, type CarriedRolls } from './lib/hudScript.ts';
import { writeJsonPretty } from './lib/writeJson.ts';
import { check, exitIfFailed, fail, info, ok, step, warn } from './lib/log.ts';

/**
 * Step 04d — the arithmetic behind a rolled stat.
 *
 * Every other step turns a *table* into data. This one turns the addon's own
 * code into data, because the numbers a guide needs are not in any table: the
 * item list gives one value per stat, and the game rolls each of them within a
 * per-attribute band that widens or tightens with the item's reforge level.
 * Without these, a build page can say "this item has +120 attack damage" and
 * cannot say that the same item ranges from 96 to 145, which is the difference
 * between describing an item and describing the one you actually want.
 *
 * Read out of `cache/raw/hud_script.js` — see `lib/hudScript.ts` for what each
 * pattern is anchored on, and `private/reforging_about.md` for why only some of
 * a reforge is predictable at all.
 *
 * Failures here are loud and stop the pipeline. A silently defaulted table
 * would be worse than no table: the site would keep drawing ranges, and they
 * would be wrong in a way nobody could see.
 */

ensureDirs();
step('04d · roll tables');

const source = path.join(DIRS.cacheRaw, 'hud_script.js');
if (!fs.existsSync(source)) {
  fail('cache/raw/hud_script.js is missing — run step 02 first');
  exitIfFailed();
}

const text = fs.readFileSync(source, 'utf8');
info(`reading ${(text.length / 1024 / 1024).toFixed(1)} MB of client source`);

/*
 * The last extraction, for what the bundle no longer holds.
 *
 * Read from the *committed* table rather than the cache: it is the value the
 * site already ships and a reviewer can see, and the cache is whatever the last
 * failed run left behind. See `CarriedRolls` for why anything is carried.
 */
const committed = path.join(DIRS.publicData, 'rolls.json');
const carried: CarriedRolls | undefined = fs.existsSync(committed)
  ? (JSON.parse(fs.readFileSync(committed, 'utf8')) as CarriedRolls)
  : undefined;

try {
  const { carriedFields, ...tables } = extractRollTables(text, new Date().toISOString(), carried);
  if (carriedFields.length > 0) {
    warn(
      `the bundle no longer rolls ${carriedFields.join(', ')} (the server does); ` +
        'carried forward from the committed rolls.json',
    );
  }

  /*
   * Sanity, not arithmetic.
   *
   * These are the shapes the maths depends on rather than the values it uses:
   * a `steps` of zero would divide by zero in the browser, and an empty random
   * table would make every stat look unrollable rather than announce that the
   * extraction had failed.
   */
  check(Object.keys(tables.random).length > 50, `random table has ${Object.keys(tables.random).length} attributes`);
  check(Object.keys(tables.decimals).length > 0, `decimals table has ${Object.keys(tables.decimals).length} entries`);
  check(tables.roll.steps > 0, `roll quantiser is ${tables.roll.steps}`);
  check(tables.roll.cap > 0, `roll cap is ${tables.roll.cap}`);
  check(tables.maxReforgeLevel > 0, `reforge ceiling is ${tables.maxReforgeLevel}`);
  check(
    tables.enhancedBonusPct[0] <= tables.enhancedBonusPct[1],
    `enhancement band is ${tables.enhancedBonusPct.join('–')}%`,
  );

  check(tables.divine.bonusPct > 0, `divine forge is +${tables.divine.bonusPct}%`);
  check(
    tables.divine.minQuality > 0 && tables.divine.level[0] > 0,
    `divine forge needs quality ${tables.divine.minQuality} and level ${tables.divine.level.join('–')}`,
  );

  /*
   * The reforge cost, which is the one table here that is allowed to go
   * missing — it is optional on `RollTables` and a run without it emits a page
   * with no cost table rather than a page of guessed prices. Still said out
   * loud either way, because "quietly absent" is how it would stay absent.
   */
  if (tables.reforgeCost === undefined) {
    warn('no reforge cost table: the pricing expressions have moved, and the item pages will show none');
  } else {
    const c = tables.reforgeCost;
    check(
      c.levelScale > 1 && c.goldPerLevel > 0 && c.materials.mythicThreshold > 0,
      `reforge cost: x${c.levelScale}/level, ${c.goldPerLevel} gold/level, mythic from quality ${c.materials.mythicThreshold}`,
    );
  }

  writeJsonPretty(path.join(DIRS.cache, 'rolls.normalized.json'), tables);
  ok(
    `fixed +${tables.fixedBonusPct}%, enhancement +${tables.enhancedBonusPct.join('–')}% ` +
      `from level ${tables.enhancedLevel.join('–')}, ceiling ${tables.maxReforgeLevel}`,
  );
  ok(`wrote cache/rolls.normalized.json (${Object.keys(tables.random).length} random attributes)`);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

exitIfFailed();
