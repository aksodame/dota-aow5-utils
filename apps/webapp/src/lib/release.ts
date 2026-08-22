import { useEffect, useState } from 'react';
import { REPO } from './links';

/**
 * The latest tracker build, from GitHub's own API.
 *
 * A landing that says "Download" should say *what* — the version, how big it
 * is, and when it appeared — and none of that can be baked into a static page
 * that is deployed independently of the releases it links to. So it is fetched
 * at runtime from the one endpoint that always knows.
 *
 * Unauthenticated, which is what makes it possible from a page with no backend:
 * the public REST API sends CORS headers, and the cost is a 60-request hourly
 * budget per IP. Every failure — offline, rate limited, no release yet — lands
 * on a state the button can still render as a working link to the releases
 * page, so the page is never worse than a plain hyperlink.
 */

const API = `https://api.github.com/repos/${REPO}/releases/latest`;

export interface ReleaseAsset {
  name: string;
  /** The direct download, already counted by GitHub's download stats. */
  url: string;
  sizeBytes: number;
}

export interface Release {
  tag: string;
  /** The release page, for notes and the other assets. */
  url: string;
  publishedAt: string | null;
  /** Null when a release exists but carries no downloadable file. */
  asset: ReleaseAsset | null;
}

export type ReleaseState =
  | { status: 'loading' }
  | { status: 'ready'; release: Release }
  /** The repo has no published release yet — a 404 from the endpoint. */
  | { status: 'none' }
  /** Offline, rate limited, or anything else. */
  | { status: 'error' };

interface ApiAsset {
  name?: unknown;
  browser_download_url?: unknown;
  size?: unknown;
}

interface ApiRelease {
  tag_name?: unknown;
  html_url?: unknown;
  published_at?: unknown;
  assets?: unknown;
}

/**
 * The installer, out of everything attached to the release.
 *
 * Ordered rather than filtered: a release may carry an installer, a portable
 * archive, checksums and blockmaps side by side, and the button wants the one
 * a visitor should click. Anything unrecognised still beats offering nothing,
 * so the last resort is simply the first asset.
 */
function pickAsset(assets: ApiAsset[]): ReleaseAsset | null {
  const usable = assets.filter(
    (a): a is { name: string; browser_download_url: string; size: number } =>
      typeof a.name === 'string' && typeof a.browser_download_url === 'string' && typeof a.size === 'number',
  );
  if (usable.length === 0) return null;

  // Blockmaps and metadata sit next to the installer and are never the answer.
  const candidates = usable.filter((a) => !/\.(blockmap|yml|yaml|sha256|sha512|txt)$/i.test(a.name));
  const pool = candidates.length > 0 ? candidates : usable;

  const found =
    pool.find((a) => /setup.*\.exe$/i.test(a.name)) ??
    pool.find((a) => /\.exe$/i.test(a.name)) ??
    pool.find((a) => /\.(zip|7z)$/i.test(a.name)) ??
    pool[0]!;

  return { name: found.name, url: found.browser_download_url, sizeBytes: found.size };
}

function parse(body: ApiRelease): Release | null {
  if (typeof body.tag_name !== 'string' || typeof body.html_url !== 'string') return null;
  return {
    tag: body.tag_name,
    url: body.html_url,
    publishedAt: typeof body.published_at === 'string' ? body.published_at : null,
    asset: Array.isArray(body.assets) ? pickAsset(body.assets as ApiAsset[]) : null,
  };
}

/**
 * Asked once per page load, not once per mount.
 *
 * `/tracker` is a route, so the button mounts again every time you navigate
 * back to it — and without this it would drop to `loading` and blink through
 * the whole sequence again on each visit, for an answer that cannot have
 * changed since the tab was opened.
 *
 * The settled answer is kept at module scope, and the in-flight promise is
 * shared so two mounts in the same tick make one request (which is also what
 * StrictMode's double-invoked effect does in development).
 *
 * Failures are deliberately *not* cached: offline and rate-limited are states
 * that pass, and the next visit should be allowed to ask again. Only a real
 * answer — a release, or a definite 404 — is worth remembering.
 */
let cached: ReleaseState | null = null;
let inFlight: Promise<ReleaseState> | null = null;

async function fetchLatest(): Promise<ReleaseState> {
  try {
    const res = await fetch(API, { headers: { Accept: 'application/vnd.github+json' } });
    // 404 is the documented answer for "this repo has no releases", which is a
    // state worth telling the truth about rather than an error.
    if (res.status === 404) return { status: 'none' };
    if (!res.ok) return { status: 'error' };
    const release = parse((await res.json()) as ApiRelease);
    return release ? { status: 'ready', release } : { status: 'error' };
  } catch {
    // Offline, or blocked. The fallback link still works.
    return { status: 'error' };
  }
}

export function useLatestRelease(): ReleaseState {
  const [state, setState] = useState<ReleaseState>(() => cached ?? { status: 'loading' });

  useEffect(() => {
    if (cached) return;
    let alive = true;

    // Not aborted on unmount: the request is shared, and one navigation away
    // must not cancel the answer another mount is waiting on.
    inFlight ??= fetchLatest();
    void inFlight.then((result) => {
      if (result.status !== 'error') cached = result;
      inFlight = null;
      if (alive) setState(result);
    });

    return () => {
      alive = false;
    };
  }, []);

  return state;
}

/** Bytes as the megabytes a download dialog would show. */
export function megabytes(bytes: number): string {
  return (bytes / 1_000_000).toFixed(1);
}

/** The publish date in the visitor's language, or null if it will not parse. */
export function formatDate(iso: string, lang: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(lang, { year: 'numeric', month: 'long', day: 'numeric' });
}
