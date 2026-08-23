/**
 * Reading the Cookie header.
 *
 * Six lines rather than `cookie-parser`, which would be a runtime dependency
 * and a piece of middleware to wire for something express can already write and
 * only this cannot read. Writing is `res.cookie()`, which express does natively.
 */

/**
 * Parses a Cookie header into a map.
 *
 * Tolerant on purpose: a header this malformed is a browser extension or a
 * proxy, and losing one unparseable pair is better than losing the session
 * cookie sitting next to it.
 */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;

  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    if (name === '') continue;
    let value = part.slice(eq + 1).trim();
    // A quoted cookie-value is legal per RFC 6265 and browsers send it back
    // exactly as it was set.
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      // A stray percent is not a reason to drop the whole header.
      out[name] = value;
    }
  }
  return out;
}
