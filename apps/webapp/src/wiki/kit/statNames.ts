import { useMemo } from 'react';
import type { LocaleDetail } from 'aow5-shared/types';
import { type ProgressionLocale } from 'aow5-shared/wiki';
import { isPercentKey, prettifyKey } from '@/lib/itemStats';
import { useApp } from '@/data/AppData';
import { useItemDetailsStore } from '@/data/ItemDetailsProvider';
import { STAT_NAMES } from '../i18n/statNames';
import { useWikiData } from './useWikiData';

/** A stat's name, and whether the number it labels is a percentage. */
export interface StatName {
  text: string;
  /** Printed with `%` after the number. */
  percent: boolean;
}

const unionCache = new WeakMap<object, Map<string, string>>();

/** Every label any item's locale gives a stat key — most items carry none of their own. */
function labelUnion(detail: Record<string, LocaleDetail>): Map<string, string> {
  let hit = unionCache.get(detail);
  if (hit === undefined) {
    hit = new Map();
    for (const d of Object.values(detail)) for (const [k, v] of Object.entries(d.values ?? {})) if (!hit.has(k)) hit.set(k, v);
    unionCache.set(detail, hit);
  }
  return hit;
}

/**
 * Names a stat: the item's own label, any item's label for the key, the
 * character panel's label, the wiki's own table for the keys the game leaves
 * unnamed, and the key made readable as the last resort. The game marks a
 * percentage by starting the label with `%`; a key ending in `_pct` /
 * `_percent` says the same.
 *
 * **One namer for both views.** The calculator and the card's plain stat list
 * draw the same stats of the same item, so they must not name them two ways —
 * a reader who switches between them (or between an item that rolls and one
 * that does not) would see the vocabulary change under them.
 *
 * It lives in the kit rather than beside the calculator because of that: the
 * plain list needs it, and the calculator's own strings — three languages of
 * roll explanations — must not be pulled in for a name.
 */
export function useStatNamer(): (key: string, itemId?: string) => StatName {
  const { lang } = useApp();
  const names = STAT_NAMES[lang];
  const store = useItemDetailsStore();
  const detail = store?.detail ?? null;
  // The character panel's own labels (`AK_Attr_*`), for keys no item labels.
  const { data } = useWikiData<[ProgressionLocale]>(['locale.{lang}.progression.json']);
  const panel = data?.[0].panel ?? null;
  return useMemo(() => {
    const union = detail !== null ? labelUnion(detail) : null;
    return (key: string, itemId?: string): StatName => {
      /*
       * The wiki's own table first, then the game's own labels.
       *
       * The order is deliberate and is the one thing this hook decides: the
       * game names a stat inside the tooltip of whichever item grants it, and
       * those labels are sentence fragments — `+Дополнительная мана` for what
       * every reader calls mana. The wiki's table is the original wiki's
       * wording, one word per stat, and a stat has to be called the same thing
       * on every item and in both views.
       */
      const raw = names[key] ?? (itemId !== undefined ? detail?.[itemId]?.values?.[key] : undefined) ?? union?.get(key) ?? panel?.[key];
      const percentKey = isPercentKey(key);
      if (raw === undefined) return { text: prettifyKey(key), percent: percentKey };
      const percent = raw.trim().startsWith('%') || percentKey;
      return { text: raw.replace(/^[\s%+]+/, '').trim() || prettifyKey(key), percent };
    };
  }, [detail, panel, names]);
}
