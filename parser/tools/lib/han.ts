/**
 * Is there Chinese in this string?
 *
 * The addon is Chinese-authored and ships the original text into every locale
 * file it has not translated yet — so an English or Russian string with Han
 * characters in it is not a translation, it is the fallback. That is the whole
 * test, and it lives here rather than inline because writing the ranges out by
 * hand twice is how one of them ends up subtly different from the other.
 *
 * CJK Unified Ideographs and its Extension A, plus the compatibility block. Not
 * kana and not Hangul: the addon ships neither, and widening this would start
 * calling a legitimately transliterated name untranslated.
 */
export const HAS_HAN = /[㐀-鿿豈-﫿]/u;

export function hasHan(value: string | undefined): boolean {
  return value !== undefined && HAS_HAN.test(value);
}
