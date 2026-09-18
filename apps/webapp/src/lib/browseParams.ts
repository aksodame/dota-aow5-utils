import type { BuildSort } from 'aow5-api-contract';
import { LATEST_SEASON, isTierKey, parseSeason, type SeasonKey, type TierKey } from 'aow5-shared/data';

/**
 * The browse query, in the URL.
 *
 * It used to live in `Shell`'s React state, which survived navigating to a
 * build and back and nothing else: a reload dropped it, the address bar never
 * described what was on screen, and a filtered list could not be sent to
 * anybody. The URL is where that state belongs — it is the one place a browser
 * already persists, shares and steps backwards through.
 *
 * The *whole* query, not only the search text. Persisting `?q=` alone would
 * mean a reload that kept what you typed and forgot which rooms you picked,
 * which is more confusing than forgetting both.
 *
 * Pure, and separately tested: this is the boundary between a URL somebody may
 * have typed and the state that drives a request, and every field arrives as
 * `string | null`.
 */
export interface BrowseQueryState {
  /**
   * Always one season. The current one, S2, unless the URL says otherwise —
   * so it is also what an absent `?season=` and a cleared filter mean.
   */
  season: SeasonKey;
  hero?: string;
  /** Tiers to include. Empty means every tier. `OR`ed with `maps`, not intersected. */
  tiers: TierKey[];
  /** Selected rooms. Empty means every room. */
  maps: string[];
  sort: BuildSort;
  /** Free text: title, notes, an author's name, or a build's code. */
  q: string;
}

/**
 * `top` is what the sidebar opens on, so it is also what an absent or
 * unrecognised `sort` means rather than an error.
 */
const SORTS: readonly BuildSort[] = ['top', 'new', 'discussed', 'cheap', 'costly'];

export const DEFAULT_BROWSE: BrowseQueryState = { season: LATEST_SEASON, tiers: [], maps: [], sort: 'top', q: '' };

/**
 * Reads a browse query out of `location.search`.
 *
 * Forgiving throughout: this parses a URL somebody may have edited, or one
 * written by an older version of the site, and the honest response to a value
 * that makes no sense is the default rather than an empty list.
 */
export function readBrowseParams(search: string): BrowseQueryState {
  const params = new URLSearchParams(search);

  const sort = params.get('sort');
  const hero = params.get('hero')?.trim() ?? '';
  return {
    // Anything that is not a season is the current one: a stale link still
    // lands on a list rather than on nothing.
    season: parseSeason(params.get('season')) ?? LATEST_SEASON,
    // One comma-separated parameter, exactly as the rooms are: they are one
    // control in the sidebar and one question to the server, so they travel
    // the same way. Keys the site does not have are dropped rather than
    // coerced — `?tier=0` asked for something that does not exist.
    tiers: (params.get('tier') ?? '')
      .split(',')
      .map((key) => key.trim())
      .filter(isTierKey),
    // Absent and empty are the same answer — "any hero" — so the field is
    // omitted rather than set to `''`, which is what `FilterState` means by it.
    ...(hero !== '' ? { hero } : {}),
    maps: (params.get('map') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id !== ''),
    sort: SORTS.includes(sort as BuildSort) ? (sort as BuildSort) : 'top',
    q: params.get('q') ?? '',
  };
}

/**
 * The query string for a browse state, defaults omitted.
 *
 * A default left out rather than spelled out, so the plain list is `/` and not
 * `/?sort=top&q=`. That keeps the address bar readable, keeps a shared link
 * short, and means "is this the default view" is answerable by looking at it.
 *
 * The leading `?` is included when there is anything at all, so the result can
 * be appended to a path directly.
 */
export function browseSearch(state: BrowseQueryState): string {
  const params = new URLSearchParams();

  if (state.q.trim() !== '') params.set('q', state.q.trim());
  // The default is left out, like `sort=top`: the plain list stays `/`.
  if (state.season !== LATEST_SEASON) params.set('season', String(state.season));
  if (state.hero !== undefined && state.hero !== '') params.set('hero', state.hero);
  if (state.tiers.length > 0) params.set('tier', state.tiers.join(','));
  // One parameter carrying the list, matching what the API takes: a repeated
  // key would need a different reader on both sides.
  if (state.maps.length > 0) params.set('map', state.maps.join(','));
  if (state.sort !== 'top') params.set('sort', state.sort);

  const encoded = params.toString();
  return encoded === '' ? '' : `?${encoded}`;
}
