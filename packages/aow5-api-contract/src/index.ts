/**
 * What the site and the API agree on.
 *
 * Types and numbers only — no runtime dependency, nothing imported, consumed as
 * raw TypeScript exactly like `aow5-shared`. It is a separate package rather
 * than a subpath of that one because `aow5-shared` is about the *map*: the
 * extracted data, the icons, the frozen tables and the codec over them. A build
 * DTO is about this deployment, and the tracker — which will never call this
 * API — has no business carrying it.
 */
export * from './limits.ts';
export * from './dto.ts';
