/**
 * The share-link codec and the build state it encodes.
 *
 * Pure and DOM-free: the app wraps it in a React hook (useUrlSync), and
 * `node --test` exercises it directly against the committed id tables.
 *
 * buildCodec re-exports MAX_SECTIONS and createSection from buildState, so the
 * codec's own surface is listed explicitly here rather than star-exported —
 * two `export *` lines would collide on those names.
 */
export * from './buildState.ts';
export {
  CODEC_VERSION,
  SUPPORTED_VERSIONS,
  MAX_ENCODABLE_INDEX,
  makeIdTable,
  encodeBuild,
  decodeBuild,
  type IdTable,
  type HeroTable,
  type DecodeWarning,
  type DecodeResult,
} from './buildCodec.ts';
