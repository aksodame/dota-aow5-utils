import { braceMatch } from './jsonScan.ts';

/**
 * Reads a `__AK_PANORAMA_PUBLISH_DATA__` payload out of a compiled Panorama
 * script.
 *
 * Despite the `.vjs_c` extension these files are plain UTF-8: the Panorama
 * build embeds a literal
 * `__AK_PANORAMA_PUBLISH_DATA__("@/json/<name>.json", {…})` call whose second
 * argument is the fully merged, type-normalized table. Reading it is one parse
 * instead of reconciling a pile of `#base`-included KV files, and the same
 * trick works for items, heroes, abilities and professions alike — which is why
 * this lives here rather than inline in step 02.
 */
export function extractPublishData(buf: Buffer, jsonName: string, source: string): unknown {
  const marker = `__AK_PANORAMA_PUBLISH_DATA__("${jsonName}",`;
  const markerAt = buf.indexOf(marker, 0, 'utf8');
  if (markerAt < 0) {
    throw new Error(
      `publish-data marker ${JSON.stringify(jsonName)} not found in ${source}. ` +
        'The addon may have changed its Panorama build.',
    );
  }

  const tail = buf.subarray(markerAt + Buffer.byteLength(marker, 'utf8')).toString('utf8');
  const objStart = tail.search(/[{[]/);
  if (objStart < 0) throw new Error(`${source}: no object or array after the ${jsonName} marker`);

  const objEnd = braceMatch(tail, objStart);
  // Guard against a brace matcher that stopped early: the very next non-space
  // character must be the closing paren of the publish call.
  if (!/^\s*\)/.test(tail.slice(objEnd))) {
    throw new Error(`${source}: ${jsonName} payload does not close at the publish call`);
  }

  return JSON.parse(tail.slice(objStart, objEnd));
}
