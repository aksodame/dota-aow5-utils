/**
 * Steam sign-in, which is OpenID 2.0 and not OAuth.
 *
 * There is no client secret, no access token, no scopes and no `state`
 * parameter. Steam asserts exactly one fact — "the browser you just redirected
 * controls SteamID 7656…" — and signs it. Everything else about the player
 * comes from the Web API afterwards.
 *
 * Written out by hand rather than through `passport-steam`, which would pull in
 * `passport` and the long-unmaintained `openid` package to speak two HTTP
 * requests to one fixed provider. The version below is pure enough to test with
 * `node --test`, which a Passport strategy is not.
 *
 * The security of the whole thing rests on one step: `check_authentication`.
 * Everything Steam sends back arrives in a query string the user's browser
 * could have written, so none of it means anything until Steam has confirmed
 * its own signature over it.
 */

const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';

export const STEAM_LOGIN_ENDPOINT = 'https://steamcommunity.com/openid/login';
export const RETURN_PATH = '/api/auth/steam/return';

/** A SteamID64 is always 17 digits, and is kept as text — it exceeds 2^53. */
const CLAIMED_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

export type ReturnFailure =
  | 'not-id-res'
  | 'bad-nonce'
  | 'bad-return-to'
  | 'bad-claimed-id'
  | 'not-verified';

export type ReturnCheck =
  | { ok: true; steamId: string; verification: URLSearchParams }
  | { ok: false; reason: ReturnFailure };

/**
 * Where Steam sends the browser back.
 *
 * Steam signs this value, so an attacker cannot alter the nonce in flight
 * without the signature failing at Steam's end — which makes comparing it to
 * the cookie a stronger check than a bare `state` parameter would be.
 */
export function buildReturnTo(siteOrigin: string, nonce: string): string {
  return `${siteOrigin}${RETURN_PATH}?n=${encodeURIComponent(nonce)}`;
}

export function buildLoginUrl(siteOrigin: string, nonce: string): string {
  const params = new URLSearchParams({
    'openid.ns': OPENID_NS,
    'openid.mode': 'checkid_setup',
    'openid.return_to': buildReturnTo(siteOrigin, nonce),
    // The realm is what Steam shows the player on the consent screen, so it is
    // the site's own origin and nothing longer.
    'openid.realm': siteOrigin,
    // "You tell us who they are" — we are not claiming to already know.
    'openid.identity': IDENTIFIER_SELECT,
    'openid.claimed_id': IDENTIFIER_SELECT,
  });
  return `${STEAM_LOGIN_ENDPOINT}?${params.toString()}`;
}

/** The SteamID a claimed_id names, or null if it does not name one. */
export function steamIdFromClaimedId(claimedId: string | null): string | null {
  if (claimedId === null) return null;
  return CLAIMED_ID.exec(claimedId)?.[1] ?? null;
}

/**
 * The body that asks Steam whether it really signed this.
 *
 * Every received `openid.*` parameter goes back verbatim with only the mode
 * swapped — dropping or reordering any of them changes what the signature
 * covers and the answer becomes a meaningless `is_valid:false`.
 */
export function checkAuthenticationBody(params: URLSearchParams): URLSearchParams {
  const body = new URLSearchParams();
  for (const [key, value] of params) {
    if (key.startsWith('openid.')) body.set(key, value);
  }
  body.set('openid.mode', 'check_authentication');
  return body;
}

/**
 * Steam answers key-value form, not JSON.
 *
 * Matched on its own line so a value that merely contains the text cannot pass
 * — `is_valid:false` must never be read as valid because something else in the
 * body happened to say otherwise.
 */
export function isValidResponse(body: string): boolean {
  return body.split(/\r?\n/).some((line) => line.trim() === 'is_valid:true');
}

/**
 * Everything that can be decided about a return before talking to Steam.
 *
 * Split out from the request so the interesting half is a pure function: this
 * is where a forged nonce, a tampered return_to or a claimed_id pointing at
 * somewhere that is not Steam gets rejected.
 */
export function parseReturn(
  params: URLSearchParams,
  options: { siteOrigin: string; expectedNonce: string },
): ReturnCheck {
  if (params.get('openid.mode') !== 'id_res') return { ok: false, reason: 'not-id-res' };

  const nonce = params.get('n');
  // Length-independent comparison is not warranted here: the nonce is not a
  // secret being guessed, it is a value the same browser must present twice.
  if (nonce === null || nonce === '' || nonce !== options.expectedNonce) {
    return { ok: false, reason: 'bad-nonce' };
  }

  // Exact string equality against what we would have built. Steam signs
  // return_to, so this pins the whole redirect target rather than trusting that
  // its pieces look reasonable.
  if (params.get('openid.return_to') !== buildReturnTo(options.siteOrigin, options.expectedNonce)) {
    return { ok: false, reason: 'bad-return-to' };
  }

  const steamId = steamIdFromClaimedId(params.get('openid.claimed_id'));
  if (steamId === null) return { ok: false, reason: 'bad-claimed-id' };

  return { ok: true, steamId, verification: checkAuthenticationBody(params) };
}

/**
 * Whether a post-login redirect target is somewhere on this site.
 *
 * The one genuine vulnerability in this flow is an open redirect: a link that
 * signs somebody in and lands them on an attacker's page wearing the site's
 * name. Only a path is ever accepted — never a full URL, and never a
 * protocol-relative `//host` one, which a browser reads as another origin.
 */
export function isSafeReturnPath(path: string): boolean {
  if (!path.startsWith('/')) return false;
  if (path.startsWith('//')) return false;
  // A backslash is a path separator to some browsers and not to some parsers,
  // which is exactly the disagreement these bugs live in.
  if (path.includes('\\')) return false;
  // Control characters, because a newline in a Location header is a response splitter.
  if (/[\u0000-\u001f\u007f]/.test(path)) return false;
  return path.length <= 512;
}
