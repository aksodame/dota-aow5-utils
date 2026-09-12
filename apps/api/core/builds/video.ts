import type { FieldErrors } from './validate.ts';

/**
 * A link to a YouTube video, reduced to the two facts a page needs.
 *
 * **The URL is not stored.** What comes back is an id and an offset, because
 * the alternative is keeping a string somebody typed and putting it in an
 * `iframe src` later — and "user text that becomes a URL the browser loads" is
 * a shape worth not having, whatever the CSP says. Reduced here, once, at the
 * only point where it arrives.
 *
 * It also means the render side parses nothing: the embed is built from an
 * eleven-character id that has already been checked against the alphabet
 * YouTube uses.
 */
export interface VideoRef {
  /** YouTube's eleven-character id. */
  id: string;
  /** Where to start, in seconds. `0` for the beginning. */
  start: number;
}

/**
 * Ids are eleven characters of base64url. Not documented as a promise by
 * YouTube, but it has held for the life of the format, and the alternative is
 * accepting arbitrary text into a URL.
 */
const ID = /^[A-Za-z0-9_-]{11}$/;

/** The hosts a YouTube link actually arrives from, including the share domain. */
const HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
  'www.youtu.be',
]);

/** `/embed/ID`, `/shorts/ID`, `/live/ID`, `/v/ID` — every path that names one. */
const PATH_PREFIXES = ['embed', 'shorts', 'live', 'v'];

/**
 * A day. Anything past it is not a timestamp anybody meant, and a start beyond
 * the end of a video is the same as no start at all.
 */
const MAX_START = 86_400;

/**
 * YouTube's own `t=` grammar: bare seconds, or `1h2m3s` in any combination.
 *
 * Both shapes are produced by its share dialog depending on where you click,
 * so both have to be read.
 */
function parseStart(raw: string | null): number {
  if (raw === null || raw === '') return 0;

  if (/^\d+$/.test(raw)) return Math.min(Number(raw), MAX_START);

  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
  if (match === null) return 0;
  const [, h = '0', m = '0', s = '0'] = match;
  const total = Number(h) * 3600 + Number(m) * 60 + Number(s);
  return Math.min(total, MAX_START);
}

/**
 * A pasted link, as it gets stored.
 *
 * Forgiving about the shape and strict about the result. A person copies
 * whatever their browser had — `youtu.be/…`, a `watch?v=` with a playlist and
 * three tracking parameters, a Shorts link, sometimes just the id — and every
 * one of those names the same video. What comes out is the id, or a refusal.
 *
 * Absent and empty both mean "no video", which is also what clearing the field
 * sends. There is no third state to tell apart.
 */
export function parseVideoLink(
  input: unknown,
): { ok: true; video: VideoRef | null } | { ok: false; errors: FieldErrors } {
  if (input === undefined || input === null) return { ok: true, video: null };
  if (typeof input !== 'string') return { ok: false, errors: { video: 'That is not a link.' } };

  const raw = input.trim();
  if (raw === '') return { ok: true, video: null };

  // A bare id, for anyone who pasted the eleven characters rather than a URL.
  if (ID.test(raw)) return { ok: true, video: { id: raw, start: 0 } };

  // `youtube.com/watch?v=…` with no scheme is what a browser's address bar
  // shows and what people copy out of it, so it is worth accepting.
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, errors: { video: 'That does not look like a link.' } };
  }

  if (!HOSTS.has(url.hostname.toLowerCase())) {
    return { ok: false, errors: { video: 'Only YouTube links can be embedded here.' } };
  }

  const segments = url.pathname.split('/').filter((part) => part !== '');
  const id =
    url.hostname.toLowerCase().endsWith('youtu.be') && segments.length > 0
      ? segments[0]
      : segments.length > 1 && PATH_PREFIXES.includes(segments[0]!.toLowerCase())
        ? segments[1]
        : (url.searchParams.get('v') ?? '');

  if (id === undefined || !ID.test(id)) {
    return { ok: false, errors: { video: 'That link does not name a video.' } };
  }

  // `t` is what the share dialog writes; `start` is what an embed URL carries.
  const start = parseStart(url.searchParams.get('t') ?? url.searchParams.get('start'));
  return { ok: true, video: { id, start } };
}

/**
 * The canonical link back to YouTube, for a "watch there" affordance.
 *
 * Built from the stored id rather than kept alongside it, so there is one
 * source of truth about which video this is.
 */
export function videoWatchUrl({ id, start }: VideoRef): string {
  const suffix = start > 0 ? `&t=${start}` : '';
  return `https://www.youtube.com/watch?v=${id}${suffix}`;
}
