/**
 * Reading a player's public profile.
 *
 * The OpenID exchange proves who somebody is and tells us nothing else — not
 * their name, not their avatar. Those come from Steam, and there are two ways
 * to ask.
 *
 * The Web API (`GetPlayerSummaries`) is the documented one and needs a key from
 * steamcommunity.com/dev/apikey. The community XML endpoint needs nothing at
 * all. Both are tried, in that order, because a site whose planner has always
 * worked with no setup should not greet its first visitor as "Player 7930"
 * merely because a key has not been issued yet.
 *
 * The key grants no write access to anything; it is a read credential for
 * public data, rate-limited per key.
 */

import { isValidResponse } from './openid.ts';

const SUMMARIES = 'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/';
const COMMUNITY = 'https://steamcommunity.com/profiles';

export interface SteamProfile {
  steamId: string;
  persona: string;
  avatarUrl: string;
  profileUrl: string;
  /** Only present on public profiles, and only from the Web API. */
  createdAt: number | null;
}

interface SummaryPlayer {
  steamid?: unknown;
  personaname?: unknown;
  avatarfull?: unknown;
  profileurl?: unknown;
  timecreated?: unknown;
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value !== '' ? value : fallback;
}

/** The name shown when Steam told us nothing. Recognisable so it can be retried. */
export function placeholderPersona(steamId: string): string {
  return `Player ${steamId.slice(-4)}`;
}

/**
 * Parsed separately from the request so the shape-handling is testable without
 * a network. Steam's response is loosely typed and a private profile simply
 * omits fields rather than nulling them.
 */
export function parseSummaries(body: unknown, steamId: string): SteamProfile | null {
  const players = (body as { response?: { players?: unknown } } | null)?.response?.players;
  if (!Array.isArray(players)) return null;

  const player = (players as SummaryPlayer[]).find((candidate) => candidate?.steamid === steamId);
  if (player === undefined) return null;

  return {
    steamId,
    persona: str(player.personaname, placeholderPersona(steamId)),
    avatarUrl: str(player.avatarfull, ''),
    profileUrl: str(player.profileurl, `${COMMUNITY}/${steamId}`),
    createdAt: typeof player.timecreated === 'number' ? player.timecreated : null,
  };
}

/**
 * Pulls one element out of Steam's profile XML.
 *
 * A regex and not a parser, deliberately: this reads four known fields from one
 * fixed endpoint, and adding an XML dependency to do it would be the kind of
 * weight this repository asks for an argument about. Values arrive wrapped in
 * CDATA, which is what the inner group handles.
 */
function xmlField(xml: string, tag: string): string | null {
  const pattern = new RegExp(`<${tag}>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*</${tag}>`);
  const match = pattern.exec(xml);
  return match?.[1]?.trim() ?? null;
}

/**
 * The community profile page, as XML.
 *
 * Needs no key, and answers for any profile that is not fully private. It does
 * not carry an account creation date, so `createdAt` stays null here — which
 * only means the not-yet-enforced new-account vote rule has nothing to go on
 * for these users.
 */
export function parseCommunityXml(xml: string, steamId: string): SteamProfile | null {
  // Confirms the document is about the person we asked about, rather than an
  // error page that happens to parse.
  if (xmlField(xml, 'steamID64') !== steamId) return null;

  const persona = xmlField(xml, 'steamID');
  if (persona === null || persona === '') return null;

  return {
    steamId,
    persona,
    avatarUrl: xmlField(xml, 'avatarFull') ?? '',
    profileUrl: `${COMMUNITY}/${steamId}`,
    createdAt: null,
  };
}

export type Fetch = typeof globalThis.fetch;

async function fromWebApi(steamId: string, apiKey: string, fetchImpl: Fetch): Promise<SteamProfile | null> {
  if (apiKey === '') return null;
  const url = `${SUMMARIES}?key=${encodeURIComponent(apiKey)}&steamids=${encodeURIComponent(steamId)}`;
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    return parseSummaries(await response.json(), steamId);
  } catch {
    return null;
  }
}

async function fromCommunity(steamId: string, fetchImpl: Fetch): Promise<SteamProfile | null> {
  try {
    const response = await fetchImpl(`${COMMUNITY}/${steamId}?xml=1`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    return parseCommunityXml(await response.text(), steamId);
  } catch {
    return null;
  }
}

export interface ProfileLookup {
  profile: SteamProfile | null;
  /** Which source answered, for a log line that explains a placeholder name. */
  source: 'web-api' | 'community' | 'none';
}

/**
 * Never throws, and never rejects.
 *
 * Steam having a bad day must not be a sign-in outage: the caller falls back to
 * whatever profile it already had, or to a placeholder for a first-time
 * visitor. `source` exists so that placeholder is explainable in a log rather
 * than a mystery in the header.
 */
export async function lookupProfile(
  steamId: string,
  apiKey: string,
  fetchImpl: Fetch = globalThis.fetch,
): Promise<ProfileLookup> {
  const viaApi = await fromWebApi(steamId, apiKey, fetchImpl);
  if (viaApi !== null) return { profile: viaApi, source: 'web-api' };

  const viaCommunity = await fromCommunity(steamId, fetchImpl);
  if (viaCommunity !== null) return { profile: viaCommunity, source: 'community' };

  return { profile: null, source: 'none' };
}

/** The older single-source form, kept because most callers only want the profile. */
export async function fetchProfile(
  steamId: string,
  apiKey: string,
  fetchImpl: Fetch = globalThis.fetch,
): Promise<SteamProfile | null> {
  return (await lookupProfile(steamId, apiKey, fetchImpl)).profile;
}

/**
 * Verifies a return with Steam.
 *
 * The one step that makes any of the rest mean anything: everything Steam sent
 * back arrived through the user's browser, so it is unverified input until
 * Steam confirms its own signature over it.
 */
export async function checkAuthentication(
  endpoint: string,
  verification: URLSearchParams,
  fetchImpl: Fetch = globalThis.fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: verification.toString(),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    return isValidResponse(await response.text());
  } catch {
    return false;
  }
}
