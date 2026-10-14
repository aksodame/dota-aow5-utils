/**
 * The monsters section's pages for the prerenderer: one per listed unit,
 * `/wiki/monsters/<unitId>`, and one per room's loot, `/wiki/monsters/loc/<room>`.
 *
 * Which units are listed is `monsterTypeGroup` (summons and traps are not), and
 * the sentence each page says is `monsterPageFacts` / `locationPageFacts` over
 * `monsterFactsInput` / `locationFactsInput`, all in `aow5-shared/wiki` — the
 * page in the browser calls the same ones with the same room names and levels,
 * which here come from `maps.json` and the map locale `names.ts` already holds.
 *
 * The tables are imported, as `names.ts` imports its own: `monsters.json` is a
 * few hundred kilobytes and every request here needs it. The spawn table
 * (`locations.json`) is not: nothing on a card depends on where a unit stands.
 *
 * A card's background is the unit's easiest room (or the room itself), and
 * its icons are the six items most likely to drop from one kill on Hard — the
 * difficulty the section opens on.
 */

import { wikiPagePath, type SeoLang } from 'aow5-shared/seo';
import {
  locationFactsInput,
  locationPageFacts,
  monsterFactsInput,
  monsterInSeason,
  monsterPageFacts,
  monsterTypeGroup,
  topMonsterDrops,
  type Monster,
  type MonstersFile,
  type MonstersLocale,
} from 'aow5-shared/wiki';
import monstersJson from 'aow5-shared/public/data/wiki/monsters.json' with { type: 'json' };
import monstersEn from 'aow5-shared/public/data/wiki/locale.en.monsters.json' with { type: 'json' };
import monstersRu from 'aow5-shared/public/data/wiki/locale.ru.monsters.json' with { type: 'json' };
import monstersZh from 'aow5-shared/public/data/wiki/locale.zh.monsters.json' with { type: 'json' };
import maps from 'aow5-shared/public/data/maps.json' with { type: 'json' };
import { itemIconPath, mapName } from '../names.ts';
import { registerWikiSection } from '../wiki-pages.ts';

const FILE = monstersJson as unknown as MonstersFile;
const LOCALE: Record<SeoLang, MonstersLocale> = {
  en: monstersEn as unknown as MonstersLocale,
  ru: monstersRu as unknown as MonstersLocale,
  zh: monstersZh as unknown as MonstersLocale,
};
const HARD = FILE.difficulties.find((d) => d.key === 'hard');

/** The listed units, as the S2 season sees them — what the section's list shows. */
const MONSTERS: Monster[] = FILE.monsters.map((m) => monsterInSeason(m)).filter((m) => monsterTypeGroup(m.type) !== undefined);
const BY_ID = new Map(MONSTERS.map((m) => [m.id, m]));

/** Room level (the tier players see) and bosses, by room code. */
const ROOMS = new Map(maps.maps.map((map) => [map.id, { level: map.tier, bosses: map.bosses as readonly string[] }]));

function room(code: string, lang: SeoLang): { name: string; level: number; bosses: readonly string[] } | undefined {
  const info = ROOMS.get(code);
  const name = mapName(code, lang);
  return info === undefined || name === null ? undefined : { name, ...info };
}

/** Rooms a listed unit lives in, lowest level first — the location select's rooms. */
const LISTED_ROOMS: string[] = [...new Set(MONSTERS.flatMap((m) => m.locations))]
  .filter((code) => ROOMS.has(code))
  .sort((a, b) => ROOMS.get(a)!.level - ROOMS.get(b)!.level || (a < b ? -1 : 1));

function easiestRoom(m: Monster): string | null {
  const rooms = m.locations.filter((code) => ROOMS.has(code)).sort((a, b) => ROOMS.get(a)!.level - ROOMS.get(b)!.level);
  return rooms[0] ?? null;
}

function monsterFacts(m: Monster, lang: SeoLang) {
  return monsterPageFacts(monsterFactsInput(m, LOCALE[lang].names, (code) => room(code, lang)), lang);
}

function locationFacts(code: string, lang: SeoLang) {
  const r = room(code, lang);
  return r === undefined ? undefined : locationPageFacts(locationFactsInput(MONSTERS, code, LOCALE[lang].names, r), lang);
}

const icons = (units: readonly Monster[]) => topMonsterDrops(units, HARD, 6).map((id) => itemIconPath(id));

registerWikiSection('monsters', {
  page(path, lang) {
    if (path[0] === 'loc') {
      const code = path[1];
      if (path.length !== 2 || code === undefined || !LISTED_ROOMS.includes(code)) return undefined;
      const facts = locationFacts(code, lang);
      if (facts === undefined) return undefined;
      return {
        facts: { section: 'monsters', path, ...facts },
        scene: code,
        icons: icons(MONSTERS.filter((m) => m.locations.includes(code))),
        tier: `T${ROOMS.get(code)!.level}`,
      };
    }
    const m = path.length === 1 && path[0] !== undefined ? BY_ID.get(path[0]) : undefined;
    if (m === undefined) return undefined;
    return {
      facts: { section: 'monsters', path, ...monsterFacts(m, lang) },
      scene: easiestRoom(m),
      icons: icons([m]),
      tier: null,
    };
  },
  links(lang) {
    const units = MONSTERS.map((m) => {
      const facts = monsterFacts(m, lang);
      return { href: wikiPagePath('monsters', [m.id]), text: `${facts.name} — ${facts.facts}` };
    });
    const rooms = LISTED_ROOMS.flatMap((code) => {
      const facts = locationFacts(code, lang);
      return facts === undefined ? [] : [{ href: wikiPagePath('monsters', ['loc', code]), text: `${facts.name} — ${facts.facts}` }];
    });
    return [...rooms, ...units];
  },
});
