export const REFERRAL_STORAGE_KEY = 'aow5.referral';
/** Query parameter, not a hash segment: the fragment belongs to the build codec. */
export const REFERRAL_PARAM = 'ref';

/**
 * The player's referral code.
 *
 * Held in two places, deliberately. `localStorage` is what makes it survive a
 * visit, and `?ref=` is what makes it survive being shared — a build link
 * pasted into chat carries the sender's code with it. Neither touches the build
 * codec, so adding this changed no share format and broke no existing link.
 */
export const MAX_REFERRAL_CODE = 32;

/** Prefilled for a first-time visitor, until they enter one of their own. */
export const DEFAULT_REFERRAL = '00EJT3T3';

/**
 * Trims, uppercases and caps.
 *
 * Uppercasing is applied to the value rather than left to CSS so that what the
 * field shows is exactly what the copy button puts on the clipboard. The game's
 * code format is not documented beyond that, so nothing else is assumed.
 */
export function normalizeReferral(value: string): string {
  return value.trim().toUpperCase().slice(0, MAX_REFERRAL_CODE);
}

/** The code in the current URL, or null when the parameter is absent. */
export function readReferralFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get(REFERRAL_PARAM);
  return raw === null ? null : normalizeReferral(raw);
}

export function getStoredReferral(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(REFERRAL_STORAGE_KEY);
    // Absent means never touched. An empty string is a deliberate erase and
    // stays erased, which is why the key is written rather than removed.
    return stored === null ? null : normalizeReferral(stored);
  } catch {
    return null;
  }
}

/**
 * What the field starts with.
 *
 * A code in the URL wins, so opening someone's link shows *their* code. It is
 * not written to storage on arrival — that would quietly overwrite the
 * visitor's own code just for following a link. Only an edit does that.
 */
export function getInitialReferral(): string {
  return readReferralFromUrl() ?? getStoredReferral() ?? DEFAULT_REFERRAL;
}

export function storeReferral(code: string): void {
  try {
    window.localStorage.setItem(REFERRAL_STORAGE_KEY, normalizeReferral(code));
  } catch {
    // Private mode; the code just will not persist between visits.
  }
}

/**
 * Mirrors the code into `?ref=`.
 *
 * `replaceState` rather than `pushState`, matching the build sync: the Back
 * button should not step through edits. The hash is carried across untouched so
 * this never disturbs the build payload living there.
 */
export function writeReferralToUrl(code: string): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const normalized = normalizeReferral(code);
  if (normalized === '') url.searchParams.delete(REFERRAL_PARAM);
  else url.searchParams.set(REFERRAL_PARAM, normalized);
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}
