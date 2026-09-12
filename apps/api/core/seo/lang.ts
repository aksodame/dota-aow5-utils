/**
 * Which language to render a crawler's copy of a page in.
 *
 * Mirrors `detectLang` in the webapp, minus the middle source. The browser has
 * three: `?lang=`, the choice in localStorage, then `navigator.languages`. A
 * crawler has no localStorage and no preference of its own, so it has two —
 * and the second is the `Accept-Language` header, which is the same question
 * `navigator.languages` answers.
 *
 * **`?lang=` winning is what makes a shared link work.** Every internal
 * navigation on the site carries the reader's language forward in the query
 * (see `withLang` in the router), so a link copied out of a Russian session
 * already says `?lang=ru` — and the preview that appears when it is pasted into
 * a Russian channel should be Russian. That is the entire reason this is not
 * simply hardcoded to English.
 *
 * Pure: no request object, no framework. It takes the two strings it needs.
 */

import { SEO_LANGS, isSeoLang, type SeoLang } from 'aow5-shared/seo';

export const DEFAULT_LANG: SeoLang = 'en';

/**
 * The languages a client asked for, best first.
 *
 * `Accept-Language: ru-RU,ru;q=0.9,en;q=0.8` is a weighted list, and reading it
 * left to right without the weights gets the common cases right and the
 * deliberate ones wrong — a client that ranks English above its own locale is
 * saying something, and it says it with `q`. Entries with `q=0` are a refusal
 * and are dropped rather than ranked last.
 *
 * Malformed input yields an empty list rather than throwing. This parses a
 * header from an anonymous client; the correct response to nonsense in it is
 * the default language, not a 500.
 */
export function parseAcceptLanguage(header: string | undefined): string[] {
  if (header === undefined || header === '') return [];
  return header
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params
        .map((param) => /^\s*q\s*=\s*([0-9.]+)\s*$/i.exec(param))
        .find((match) => match !== null);
      const weight = q === undefined || q === null ? 1 : Number.parseFloat(q[1] ?? '1');
      return {
        tag: tag.trim().toLowerCase(),
        // NaN from a malformed `q` is treated as "no preference stated", not as
        // a refusal — the alternative silently discards the tag.
        weight: Number.isFinite(weight) ? weight : 1,
        // Ties keep the order they were sent in, which is the only signal left.
        index,
      };
    })
    .filter((entry) => entry.tag !== '' && entry.weight > 0)
    .sort((a, b) => (b.weight === a.weight ? a.index - b.index : b.weight - a.weight))
    .map((entry) => entry.tag);
}

/**
 * The language for one request: the query first, then the header, then English.
 *
 * A tag is matched on its primary subtag, so `ru-RU`, `ru` and `RU` all reach
 * Russian, and `zh-Hans-CN` reaches the Simplified Chinese the addon ships —
 * the site has no second Chinese to confuse it with. `*` is ignored: it means
 * "anything", and anything is the default.
 */
export function pickLang(query: string | undefined, acceptLanguage: string | undefined): SeoLang {
  if (isSeoLang(query)) return query;

  for (const tag of parseAcceptLanguage(acceptLanguage)) {
    const primary = tag.split('-')[0] ?? '';
    if (isSeoLang(primary)) return primary;
  }
  return DEFAULT_LANG;
}

/** The other two languages, for `og:locale:alternate` and `hreflang`. */
export function otherLangs(lang: SeoLang): SeoLang[] {
  return SEO_LANGS.filter((other) => other !== lang);
}
