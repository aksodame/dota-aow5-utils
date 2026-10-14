/**
 * The wiki's sections as the server sees them: one `registerWikiSection` per
 * section whose pages have records, reading the emitted tables under
 * `aow5-shared/public/data/wiki/`.
 *
 * Imported for its side effect by `SeoService`, so every source is registered
 * before the first request. A section with no source here still prerenders —
 * its own landing page, with no links — and every page under it is a 404.
 */

export {};
