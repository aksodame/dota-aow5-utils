/**
 * The wiki's sections as the server sees them: one `registerWikiSection` per
 * section whose pages have records, reading the emitted tables under
 * `aow5-shared/public/data/wiki/`.
 *
 * Imported for its side effect by `SeoService`, so every source is registered
 * before the first request. A section with no source here still prerenders —
 * its own landing page, with no links — and every page under it is a 404.
 */

import './wiki/consumables.ts';
import './wiki/faq.ts';
import './wiki/heroes.ts';
import './wiki/vendors.ts';
import './wiki/sky.ts';
import './wiki/progression.ts';
import './wiki/monsters.ts';
import './wiki/craft.ts';
