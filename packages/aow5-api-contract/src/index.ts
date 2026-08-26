/**
 * What the site and the API agree on.
 *
 * Types and numbers only — no runtime dependency, nothing imported, consumed as
 * raw TypeScript exactly like `aow5-shared`. It is a separate package rather
 * than a subpath of that one because `aow5-shared` is about the *map*: the
 * extracted data, the icons, the frozen tables and the codec over them. A build
 * DTO is about this deployment.
 *
 * The tracker was excluded here on the grounds that it would never call this
 * API. It does now, for exactly one thing: sound search, which cannot be local
 * because the catalogue is not. It carries `sounds.ts` and nothing else — the
 * build DTOs are still none of its business.
 */
export * from './limits.ts';
export * from './dto.ts';
export * from './sounds.ts';
