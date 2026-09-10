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
import mapTable from 'aow5-shared/map-table.json' with { type: 'json' };
import idTableJson from 'aow5-shared/id-table.json' with { type: 'json' };
import heroes from 'aow5-shared/public/data/heroes.json' with { type: 'json' };
import maps from 'aow5-shared/public/data/maps.json' with { type: 'json' };
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
  /*
   * The frozen table with a hole pushed onto the front, because map indices are
   * 1-based: 0 means "no map chosen". Built from `map-table.json` rather than
   * from `maps.json` for the same reason the item table is — the frozen file
   * keeps the tombstone of a room the addon has retired, where the emitted one
   * has dropped it, and a link pointing at that position must stay pointing at
   * it rather than shift onto its neighbour.
   */
  mapIds: ['', ...mapTable.ids],
};

/**
 * Tier per map id, for the facet a browse query filters on.
 *
 * Denormalised onto each build at write time; this is where that copy comes
 * from. A build whose map this deployment cannot name gets a null tier rather
 * than a guess.
 */
/**
 * Every room by id, for the one question the API asks of the map table: which
 * tier is this room filed under.
 *
 * The *answer* comes from `categoryOfMap` in the shared package rather than
 * from `map.tier` directly — a handful of rooms are curated onto a different
 * tier than the game's own name claims, and three are Event content the data
 * has no word for. Both sides read that one table, so the API cannot refuse a
 * pair the editor offered.
 */
export const MAP_BY_ID: ReadonlyMap<string, { id: string; tier: number }> = new Map(
  maps.maps.map((map) => [map.id, { id: map.id, tier: map.tier }]),
);
