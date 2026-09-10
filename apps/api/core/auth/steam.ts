/**
 * Steam OpenID 2.0, minus the network.
 *
 * The flow has three moves and only the middle one needs a socket:
 *
 *   1. Send the visitor to `steamcommunity.com/openid/login` with a return URL.
 *   2. Steam sends them back with a bundle of `openid.*` parameters. Those
 *      parameters are **not** proof of anything on their own — anybody can type
 *      them into a URL bar — so they are echoed back to Steam with
 *      `openid.mode=check_authentication`, and Steam answers `is_valid:true`.
 *   3. The claimed identity is a URL ending in the 64-bit SteamID.
 *
 * Everything here is pure: URL construction, parameter shaping, and reading the
 * two replies. `AuthService` owns the two `fetch` calls, which is what lets this
 * be tested without one.
 *
 * OpenID 2.0 is dead everywhere except Steam, and Steam has never offered
 * anything else. There is no library dependency because the protocol surface
 * actually used here is one form post and one string parse.
 */

export const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login';

/** Steam's answer to check_authentication is a tiny key-value document. */
const VALID_RESPONSE = /is_valid\s*:\s*true/i;

/**
 * The claimed identity Steam issues, and the only shape accepted.
 *
 * Anchored, and `https` only. A loose match here is the difference between
 * reading an id out of Steam's answer and reading one out of an attacker's:
 * `https://evil.example/steamcommunity.com/openid/id/123` must not parse.
 */
const CLAIMED_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/([0-9]{2,20})$/;

/**
 * Builds the URL that sends somebody to Steam to sign in.
 *
 * `returnTo` must be an absolute URL on this site — it is where Steam sends
 * them back, and Steam checks it against `realm`. The realm is the origin, so
 * a return URL from anywhere else is refused by Steam rather than by us.
 */
export function buildAuthUrl(returnTo: string, realm: string): string {
  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': realm,
    // The two magic constants that mean "I do not know who this is yet; you
    // tell me". Anything else here asks Steam to confirm an identity we have
    // named, which is not the question being asked.
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });
  return `${STEAM_OPENID_ENDPOINT}?${params.toString()}`;
}

/**
 * Turns the callback's query into the body that asks Steam to vouch for it.
 *
 * Every `openid.*` parameter is echoed back verbatim except `mode`, which
 * becomes `check_authentication`. Verbatim matters: the signature Steam is
 * being asked about covers those exact values, so normalising, reordering or
 * dropping one turns a valid login into an invalid one.
 *
 * Returns null when the callback is not even shaped like an OpenID response,
 * which saves a pointless round trip to Steam for a hand-typed URL.
 */
export function buildVerificationBody(query: Record<string, string | undefined>): URLSearchParams | null {
  const signed = query['openid.signed'];
  if (typeof signed !== 'string' || signed === '') return null;
  if (typeof query['openid.sig'] !== 'string') return null;
  if (query['openid.mode'] !== 'id_res') return null;

  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (!key.startsWith('openid.')) continue;
    if (value === undefined) continue;
    body.set(key, value);
  }
  body.set('openid.mode', 'check_authentication');

  /*
   * `openid.signed` lists the fields the signature covers. Every one of them
   * has to be present, or we would be asking Steam about a different document
   * than the one it signed — and Steam, missing a field, answers about what it
   * was given rather than complaining.
   */
  for (const field of signed.split(',')) {
    if (!body.has(`openid.${field}`)) return null;
  }

  return body;
}

/** Whether Steam's check_authentication reply says the assertion was genuine. */
export function isVerified(responseBody: string): boolean {
  return VALID_RESPONSE.test(responseBody);
}

/**
 * The 64-bit SteamID a verified callback claims, or null.
 *
 * Kept as a string throughout: `76561198000000000` is past 2^53, so anything
 * that turns it into a number silently rounds distinct accounts together.
 */
export function steamIdFromClaim(claimedId: string | undefined): string | null {
  if (typeof claimedId !== 'string') return null;
  const match = CLAIMED_ID.exec(claimedId.trim());
  return match?.[1] ?? null;
}

/** Longest persona Steam will hand out, and what gets stored. */
export const MAX_PERSONA = 64;

/**
 * One entry of `ISteamUser/GetPlayerSummaries`, as much as is used.
 *
 * Deliberately not the whole shape: this is somebody else's JSON, and naming
 * only the three fields read is what keeps a change at their end from becoming
 * a type error at ours.
 */
export interface PlayerSummary {
  steamid?: unknown;
  personaname?: unknown;
  avatarfull?: unknown;
}

export interface SteamProfile {
  persona: string;
  avatar: string;
}

/**
 * Reads a profile out of the Web API's answer.
 *
 * Everything is treated as untrusted: the persona is trimmed and capped, the
 * avatar is only kept if it is an https URL, and a missing or malformed reply
 * yields a profile built from the SteamID rather than an error. Sign-in must
 * not fail because a display name was odd.
 */
export function readProfile(summary: PlayerSummary | undefined, steamId: string): SteamProfile {
  const persona = cleanPersona(typeof summary?.personaname === 'string' ? summary.personaname : '');
  const avatar = cleanAvatar(typeof summary?.avatarfull === 'string' ? summary.avatarfull : '');

  return {
    // Falling back to the id rather than to "Anonymous": two people with no
    // persona would otherwise be indistinguishable on a build card.
    persona: persona === '' ? fallbackPersona(steamId) : persona,
    avatar,
  };
}

/** The name a nameless account gets. The id, so two of them are still two. */
export function fallbackPersona(steamId: string): string {
  return `Player ${steamId.slice(-6)}`;
}

/**
 * A persona is free text on somebody else's service.
 *
 * Control and format characters are stripped because they render as nothing and
 * can hide the rest of a name; the cap is the column's.
 */
function cleanPersona(raw: string): string {
  return raw
    .trim()
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .slice(0, MAX_PERSONA)
    .trim();
}

/** An avatar URL, or nothing. `https` only — this ends up in an `<img src>`. */
function cleanAvatar(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.startsWith('https://') ? trimmed : '';
}

/**
 * Where a profile can be read **without an API key**.
 *
 * Steam has served this since before the Web API existed: the community profile
 * with `?xml=1` is public, unauthenticated, and carries the two fields this site
 * wants. It exists here because `STEAM_API_KEY` is optional — a deployment
 * without one used to give every visitor a name derived from their SteamID and
 * no picture at all, which reads as a broken sign-in rather than as a missing
 * setting.
 *
 * The keyed call stays the first choice: it is the documented interface, it
 * answers JSON, and it does not depend on a profile being public.
 */
export function profileXmlUrl(steamId: string): string {
  return `https://steamcommunity.com/profiles/${encodeURIComponent(steamId)}?xml=1`;
}

/**
 * Reads that XML, and refuses to guess.
 *
 * Deliberately two regular expressions rather than a parser: the document is
 * somebody else's and only two of its fields are wanted, so the cost of being
 * wrong is a missing name — where a parser dependency would be a permanent one.
 * Both fields are CDATA in every response Steam sends, and both shapes are
 * accepted anyway because nothing here should depend on that staying true.
 *
 * A private profile answers with `<privacyState>private</privacyState>` and no
 * persona, which comes back as `undefined` — the caller keeps the SteamID-based
 * name rather than inventing one.
 */
export function readProfileXml(xml: string, steamId: string): SteamProfile | undefined {
  const persona = cleanPersona(firstOf(PERSONA_XML, xml));
  const avatar = cleanAvatar(firstOf(AVATAR_XML, xml));
  if (persona === '' && avatar === '') return undefined;

  return { persona: persona === '' ? fallbackPersona(steamId) : persona, avatar };
}

/*
 * The two fields, as literals rather than as a name interpolated into a
 * `RegExp` — a template literal eats the backslashes, which is a mistake that
 * compiles and then matches nothing. `<steamID>` cannot catch `<steamID64>`:
 * the closing bracket is part of the pattern.
 */
const PERSONA_XML = /<steamID>\s*(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))\s*<\/steamID>/i;
const AVATAR_XML = /<avatarFull>\s*(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))\s*<\/avatarFull>/i;

/** Whichever branch matched — CDATA or bare text — or an empty string. */
function firstOf(pattern: RegExp, xml: string): string {
  const match = pattern.exec(xml);
  return (match?.[1] ?? match?.[2] ?? '').trim();
}
