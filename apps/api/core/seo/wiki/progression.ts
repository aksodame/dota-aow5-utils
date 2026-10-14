/**
 * The progression section's pages for the prerenderer: a page per talent tree
 * (`/wiki/progression/<tree>`), per profession (`/wiki/progression/heroes/<hero>`),
 * per node (`/wiki/progression/<tree>/<node>`, or under the hero for a
 * profession tree), and the profession tab itself.
 *
 * Which addresses exist is `resolveProgressionPath` and what each says is
 * `progressionPageFacts`, both in `aow5-shared/wiki` and both called by the
 * page in the browser, so the tab and the card agree.
 */

import { wikiPagePath, type SeoLang } from 'aow5-shared/seo';
import {
  PROGRESSION_HERO_TAB,
  progressionPageFacts,
  progressionPathOf,
  resolveProgressionPath,
  shownTrees,
  totalCost,
  type HeroesWikiLocale,
  type ProgressionFile,
  type ProgressionLocale,
  type ProgressionNames,
  type ProgressionView,
  type TalentNode,
} from 'aow5-shared/wiki';
import progJson from 'aow5-shared/public/data/wiki/progression.json' with { type: 'json' };
import progEn from 'aow5-shared/public/data/wiki/locale.en.progression.json' with { type: 'json' };
import progRu from 'aow5-shared/public/data/wiki/locale.ru.progression.json' with { type: 'json' };
import progZh from 'aow5-shared/public/data/wiki/locale.zh.progression.json' with { type: 'json' };
import heroesEn from 'aow5-shared/public/data/wiki/locale.en.heroes-wiki.json' with { type: 'json' };
import heroesRu from 'aow5-shared/public/data/wiki/locale.ru.heroes-wiki.json' with { type: 'json' };
import heroesZh from 'aow5-shared/public/data/wiki/locale.zh.heroes-wiki.json' with { type: 'json' };
import { heroIconPath, itemFacts, itemIconPath } from '../names.ts';
import { registerWikiSection } from '../wiki-pages.ts';

const PROG = progJson as unknown as ProgressionFile;
const LOCALE: Record<SeoLang, ProgressionLocale> = {
  en: progEn as unknown as ProgressionLocale,
  ru: progRu as unknown as ProgressionLocale,
  zh: progZh as unknown as ProgressionLocale,
};
const HEROES: Record<SeoLang, HeroesWikiLocale> = {
  en: heroesEn as unknown as HeroesWikiLocale,
  ru: heroesRu as unknown as HeroesWikiLocale,
  zh: heroesZh as unknown as HeroesWikiLocale,
};

function namesFor(lang: SeoLang): ProgressionNames {
  return { locale: LOCALE[lang], heroes: HEROES[lang].heroes, item: (id) => itemFacts(id, lang)?.name };
}

const talentIcon = (node: TalentNode) => `icons/talents/${node.icon}`;

/** The most-needed cost items of a set of nodes, as icon paths. */
function costIcons(nodes: readonly TalentNode[], limit: number): (string | null)[] {
  return [...totalCost(nodes).items]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => itemIconPath(id))
    .filter((path) => path !== null)
    .slice(0, limit);
}

/** The node and its price; a tree its root and its dearest materials; a hero his portrait first. */
function iconsOf(view: ProgressionView): (string | null)[] {
  if (view.node !== undefined) return [talentIcon(view.node), ...costIcons([view.node], 5)];
  const tree = view.tree;
  const root = tree?.nodes.find((n) => n.root === true) ?? tree?.nodes[0];
  const lead = [
    ...(view.kind === 'hero' && view.tabOnly !== true ? [heroIconPath(view.hero.hero)] : []),
    ...(root === undefined ? [] : [talentIcon(root)]),
  ];
  return [...lead, ...costIcons(tree?.nodes ?? [], 6 - lead.length)];
}

/** Every address the section has, canonical form: tabs, the hero tab, heroes, and every node. */
function allViews(): ProgressionView[] {
  const out: ProgressionView[] = [];
  const add = (path: string[]) => {
    const view = resolveProgressionPath(PROG, path);
    if (view !== null) out.push(view);
  };
  for (const tab of PROG.tabs) add([tab]);
  add([PROGRESSION_HERO_TAB]);
  for (const p of PROG.professions) add([PROGRESSION_HERO_TAB, p.profession]);
  for (const tree of shownTrees(PROG)) {
    const hero = PROG.professions.find((p) => p.tree === tree.id);
    for (const n of tree.nodes) add(hero === undefined ? [tree.id, n.id] : [PROGRESSION_HERO_TAB, hero.profession, n.id]);
  }
  return out;
}

let views: ProgressionView[] | null = null;

registerWikiSection('progression', {
  page(path, lang) {
    if (path.length === 0) return undefined;
    const view = resolveProgressionPath(PROG, path);
    if (view === null) return undefined;
    const facts = progressionPageFacts(PROG, view, namesFor(lang), lang);
    return {
      facts: { section: 'progression', path, ...facts },
      scene: null,
      icons: iconsOf(view),
    };
  },
  links(lang) {
    views ??= allViews();
    const names = namesFor(lang);
    return views.map((view) => {
      const facts = progressionPageFacts(PROG, view, names, lang);
      return { href: wikiPagePath('progression', progressionPathOf(view)), text: `${facts.name} — ${facts.facts}` };
    });
  },
});
