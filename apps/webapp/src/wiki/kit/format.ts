import type { Lang } from '@/i18n/strings';

/**
 * Numbers in the reader's language.
 *
 * The wiki's original wrote Russian conventions by hand — a space between
 * thousands, a space before `%`, Russian collation — which is right in one of
 * the three languages. `Intl` gets all three right, and every number in the
 * wiki goes through here so they agree with each other.
 */

const LOCALE: Record<Lang, string> = { en: 'en-US', ru: 'ru-RU', zh: 'zh-CN' };

const numberFormats = new Map<string, Intl.NumberFormat>();

function format(lang: Lang, digits: number): Intl.NumberFormat {
  const key = `${lang}:${digits}`;
  let found = numberFormats.get(key);
  if (found === undefined) {
    found = new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: digits });
    numberFormats.set(key, found);
  }
  return found;
}

/** `12 400`, `12,400`; at most `digits` decimals, trailing zeros dropped. */
export function num(value: number | null | undefined, lang: Lang, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return format(lang, digits).format(value);
}

/**
 * A share as a percentage: `0.125` → `12.5%`.
 *
 * Two decimals below one percent and one above, which is the precision a drop
 * chance is worth reading at; anything under a hundredth of a percent is
 * `<0.01%` rather than a row of zeros.
 */
export function pct(share: number | null | undefined, lang: Lang): string {
  if (share == null || !Number.isFinite(share)) return '—';
  const value = share * 100;
  if (value > 0 && value < 0.01) return `<${format(lang, 2).format(0.01)}%`;
  return `${format(lang, value < 1 ? 2 : 1).format(value)}%`;
}

/** A number that is already a percentage: `12.5` → `12.5%`. */
export function pctOf(value: number | null | undefined, lang: Lang, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${format(lang, digits).format(value)}%`;
}

const pluralRules = new Map<Lang, Intl.PluralRules>();

/**
 * Picks a word form for `n` in the reader's language:
 * `plural(5, 'ru', { one: 'монстр', few: 'монстра', many: 'монстров', other: 'монстра' })`.
 */
export function plural(n: number, lang: Lang, forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }): string {
  let rules = pluralRules.get(lang);
  if (rules === undefined) {
    rules = new Intl.PluralRules(LOCALE[lang]);
    pluralRules.set(lang, rules);
  }
  return forms[rules.select(n)] ?? forms.other;
}

const collators = new Map<Lang, Intl.Collator>();

/** Name order for the reader's language, as a comparator. */
export function collate(lang: Lang): (a: string, b: string) => number {
  let collator = collators.get(lang);
  if (collator === undefined) {
    collator = new Intl.Collator(LOCALE[lang]);
    collators.set(lang, collator);
  }
  const c = collator;
  return (a, b) => c.compare(a, b);
}

/** `1 h 20 min`, `45 min`, `30 s`, from seconds. */
export function duration(seconds: number, lang: Lang, units: { hours: string; minutes: string; seconds: string }): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  if (seconds < 60) return `${num(seconds, lang, 0)} ${units.seconds}`;
  const minutes = Math.round(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} ${units.minutes}`;
  return m === 0 ? `${h} ${units.hours}` : `${h} ${units.hours} ${m} ${units.minutes}`;
}

/** A date from the data (`2026-10-14…`) in the reader's own short form. */
export function day(iso: string, lang: Lang): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return iso;
  return new Intl.DateTimeFormat(LOCALE[lang], { year: 'numeric', month: 'short', day: 'numeric' }).format(at);
}
