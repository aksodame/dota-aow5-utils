/**
 * The heroes section's pages for the prerenderer: `/wiki/heroes/<short>`, one
 * per hero with a profession (`axe`, `dragon_knight`).
 *
 * The sentence each page says is `heroPageFacts` in `aow5-shared/wiki`, which
 * the page in the browser calls too. The card's portrait is the builder's hero
 * art and its icons are the hero's first abilities that ship art of their own.
 * A hero outside the builder's roster would have no portrait and draw the
 * wiki-extracted icons by path; Dragon Knight was that until he joined it in S3.
 */

import { wikiPagePath, type SeoLang } from 'aow5-shared/seo';
import { heroByShort, heroPageFacts, type HeroesWikiFile, type HeroesWikiLocale, type WikiHero } from 'aow5-shared/wiki';
import heroesJson from 'aow5-shared/public/data/wiki/heroes-wiki.json' with { type: 'json' };
import heroesEn from 'aow5-shared/public/data/wiki/locale.en.heroes-wiki.json' with { type: 'json' };
import heroesRu from 'aow5-shared/public/data/wiki/locale.ru.heroes-wiki.json' with { type: 'json' };
import heroesZh from 'aow5-shared/public/data/wiki/locale.zh.heroes-wiki.json' with { type: 'json' };
import { heroIconPath, heroName } from '../names.ts';
import { registerWikiSection } from '../wiki-pages.ts';

const HEROES = heroesJson as unknown as HeroesWikiFile;
const LOCALE: Record<SeoLang, HeroesWikiLocale> = {
  en: heroesEn as unknown as HeroesWikiLocale,
  ru: heroesRu as unknown as HeroesWikiLocale,
  zh: heroesZh as unknown as HeroesWikiLocale,
};

function factsOf(hero: WikiHero, lang: SeoLang) {
  return heroPageFacts(hero, LOCALE[lang].heroes[hero.id], heroName(hero.id, lang) ?? undefined, lang);
}

/**
 * The ability icons, as asset paths under `icons/`. `WikiAbility.icon` is
 * already relative to that folder (`abilities/…` or `abilities-wiki/…`); an
 * ability whose art is only on Valve's CDN has none the card can read.
 */
function iconsOf(hero: WikiHero): string[] {
  return hero.abilities.flatMap((ability) => (ability.icon === undefined ? [] : [`icons/${ability.icon}`])).slice(0, 6);
}

registerWikiSection('heroes', {
  page(path, lang) {
    const [short, ...rest] = path;
    if (short === undefined || rest.length > 0) return undefined;
    const hero = heroByShort(HEROES, short);
    if (hero === undefined) return undefined;
    return {
      facts: { section: 'heroes', path, ...factsOf(hero, lang) },
      scene: null,
      portrait: heroIconPath(hero.id),
      icons: iconsOf(hero),
    };
  },
  links(lang) {
    return HEROES.heroes.map((hero) => {
      const facts = factsOf(hero, lang);
      return { href: wikiPagePath('heroes', [hero.short]), text: `${facts.name} — ${facts.facts}` };
    });
  },
});
