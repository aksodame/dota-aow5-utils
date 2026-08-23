/**
 * The frozen tables, as the codec wants them.
 *
 * The only file on the server that imports the extracted data. Everything else
 * in core/ takes an `IdTable`/`HeroTable` as an argument, exactly the way
 * `buildCodec.test.ts` does — so a test can build its own table and nothing has
 * to reach for a global.
 *
 * These are bundled into the image at build time (see tsup.config.ts), which
 * has one consequence worth knowing: a `parser/` run that appends new items
 * needs the API image rebuilt, or an index only the newer table knows about is
 * recorded as unknown in a build's derived facets. The stored payload is
 * unaffected — it is never rewritten — so this costs a filter, not a build.
 */
import { makeIdTable, type HeroTable, type IdTable } from 'aow5-shared/codec';
import abilityTable from 'aow5-shared/ability-table.json' with { type: 'json' };
import idTableJson from 'aow5-shared/id-table.json' with { type: 'json' };
import heroes from 'aow5-shared/public/data/heroes.json' with { type: 'json' };
import meta from 'aow5-shared/public/data/meta.json' with { type: 'json' };

/**
 * Built from the frozen table rather than rebuilt from `items.index.json` the
 * way the browser does it.
 *
 * The browser only ships playable items, so its rebuilt table has holes where
 * hidden or disabled ones were; the frozen table has every id including
 * tombstones. The server is therefore slightly *more* knowledgeable than the
 * client — it resolves an index the planner would draw as `?` — which is the
 * harmless direction for that to differ, since nothing here re-encodes.
 */
export const ID_TABLE: IdTable = makeIdTable(idTableJson.ids, meta.idTableHash);

export const HERO_TABLE: HeroTable = {
  abilityIds: abilityTable.ids,
  // A hero's byte is its position in this roster plus one, so config order is
  // load-bearing and heroes.json is the thing that preserves it.
  heroIds: heroes.heroes.map((hero) => hero.id),
};

/**
 * Deliberately absent: `kinds`.
 *
 * The slot-kind masks live in `items.index.json` (95 kB) and the codec needs
 * them for exactly one thing — re-homing the flat slots of a pre-v3 link into
 * typed ones. Skipping them means a v1 or v2 payload's *derived facets* (hero,
 * item count) may not match what the planner shows; the payload itself still
 * round-trips untouched, and links written since v3 are unaffected. Revisit if
 * the browse filters ever look wrong on an old build.
 */
export const HAS_SLOT_KINDS = false;
