/**
 * The extracted tables, typed where they are imported from.
 *
 * They are imported rather than fetched. A packaged overlay loads its renderer
 * from `file://`, where a relative `fetch` is blocked by the origin, so the
 * previous fetch-with-a-remote-fallback quietly meant "always download the
 * tables". Bundling them makes the overlay work offline and removes the copy
 * step that used to keep a duplicate of them in this app.
 *
 * Declared here rather than switched on with `resolveJsonModule` on purpose:
 * that would have TypeScript infer a literal type for all 1,749 rows of
 * `items.index.json` on every check, which is slow and buys nothing — the
 * shipped shape is already described by `aow5-shared/types`.
 */

declare module 'aow5-shared/public/data/items.index.json' {
  import type { ItemsIndex } from 'aow5-shared/types';
  const value: ItemsIndex;
  export default value;
}

/*
 * One per extracted language. Three modules rather than a wildcard, because a
 * wildcard would also type `locale.fr.names.json` — a file that does not exist
 * — as a valid import, and the point of declaring these at all is that a
 * language the extraction has not emitted fails at the build rather than at
 * launch.
 */
declare module 'aow5-shared/public/data/locale.en.names.json' {
  import type { LocaleNames } from 'aow5-shared/types';
  const value: LocaleNames;
  export default value;
}

declare module 'aow5-shared/public/data/locale.ru.names.json' {
  import type { LocaleNames } from 'aow5-shared/types';
  const value: LocaleNames;
  export default value;
}

declare module 'aow5-shared/public/data/locale.zh.names.json' {
  import type { LocaleNames } from 'aow5-shared/types';
  const value: LocaleNames;
  export default value;
}

/**
 * The full item table, recipes included.
 *
 * 1.2 MB against `items.index.json`'s slim rows, which is why nothing imports
 * it at the top level: the recipe panel loads it with a dynamic `import()` the
 * first time a target is picked, so a session that never opens a recipe never
 * pays for one. Keyed by item id, with a stray non-item key or two from the
 * addon's own KV files — read it with a lookup, never by iterating.
 */
declare module 'aow5-shared/public/data/items.full.json' {
  import type { ItemFull } from 'aow5-shared/types';
  const value: Record<string, ItemFull | undefined>;
  export default value;
}
