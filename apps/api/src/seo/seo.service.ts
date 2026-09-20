import { Inject, Injectable } from '@nestjs/common';
import { groupsInPanel } from 'aow5-shared/codec';
import { PREVIEW_LOOT, PREVIEW_ROOM, previewReadout } from 'aow5-shared/overlay';
import {
  SEO_STRINGS,
  buildFactLine,
  formatGold,
  itemFactLine,
  itemPagePath,
  oneLine,
  pageMeta,
  type BuildFacts,
  type ItemFacts,
  type MetaTarget,
  type PageMeta,
  type SeoLang,
} from 'aow5-shared/seo';
import { seasonLabel, tierLabel } from 'aow5-shared/data';
import type { BuildRow } from '../../core/db/builds.ts';
import {
  SITEMAP_LIMIT,
  findBuildBySlug,
  isVisible,
  listPublishedBuilds,
  mapsOfBuild,
  mapsOfBuilds,
} from '../../core/db/builds.ts';
import { findUserById } from '../../core/db/users.ts';
import type { Db } from '../../core/db/open.ts';
import {
  decodeStored,
  heroIconPath,
  heroName,
  itemIconPath,
  abilityIconPath,
  headlineSoul,
  mainSpellId,
  mainSpellName,
  mapName,
  mapNames,
  mapScenePath,
  previewItem,
  itemFacts,
  qualityColour,
} from '../../core/seo/names.ts';
import { renderCard, type CardModel } from '../../core/seo/card.ts';
import { renderItemCard } from '../../core/seo/item-card.ts';
import { cardStats, itemDetail, useAssetsDir } from '../../core/seo/item-data.ts';
import { renderTrackerCard } from '../../core/seo/tracker-card.ts';
import type { SitemapEntry } from '../../core/seo/sitemap.ts';
import { CONFIG, type AppConfig } from '../config.ts';
import { DB } from '../db/tokens.ts';
/*
 * The emitted data's own stamp, for `dataVersion`. The same file the shared
 * package ships to the browser, imported here for one field — `generatedAt`,
 * which is written from the pak's mtime and therefore moves on a refresh and
 * on nothing else.
 */
import meta from 'aow5-shared/public/data/meta.json' with { type: 'json' };
import itemsIndex from 'aow5-shared/public/data/items.index.json' with { type: 'json' };
import { CardService } from './card.service.ts';

/**
 * The slots a card's gear row draws.
 *
 * Taken from the shared layout rather than hardcoded, exactly as
 * `lib/preview.ts` does it in the webapp — `panel: 'gear'` is the worn
 * equipment, so when the neutral and backpack slots moved to their own panel
 * this followed them without anyone editing it.
 */
const GEAR_SLOTS: number[] = groupsInPanel('gear')
  .filter((group) => group.hidden !== true)
  .flatMap((group) => Array.from({ length: group.count }, (_, index) => group.start + index));

/**
 * The site's wordmark, relative to the brand root.
 *
 * The same file the top bar draws — see `TopBar.tsx`. Named here rather than
 * inlined because two cards reach for it.
 */
const LOGOTYPE = 'logotype.png';

/** The game's own coin, beside a price. A constant: it is chrome, not a record in any table. */
const GOLD_COIN = 'icons/ui/gold.png';

/**
 * The room behind the default card.
 *
 * Fixed, because that card is cached under one key per language and must not
 * change between two scrapes of the same URL. Resolved through the map table
 * like any other scene, so renaming the file in a parser run cannot leave this
 * pointing at nothing.
 */
const SITE_CARD_ROOM = 'M003';

/**
 * The room whose painted scene a card uses as its background.
 *
 * The first room the build names, and only when it ships art — most do; the
 * ones that do not fall back to the plain gradient rather than to a broken
 * image.
 */
function sceneOf(mapIds: readonly string[]): string | null {
  return mapScenePath(mapIds[0]);
}

/**
 * Everything a crawler is told about a page, assembled from the database.
 *
 * The counterpart of what `AppData` plus a `/builds/:slug` response give the
 * browser. Both end up calling the same `pageMeta`, which is the point: the tab
 * a reader sees and the card a scraper sees are generated from one function
 * over the same facts, so they cannot drift apart in one language and not
 * another.
 */
@Injectable()
export class SeoService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly cards: CardService,
    @Inject(CONFIG) config: AppConfig,
  ) {
    /*
     * Where the heavy item tables live, handed to the module that reads them.
     *
     * `item-data.ts` is plain functions rather than a provider — it is a cache
     * over four files that never change while the process runs — so it is told
     * the directory once instead of being injected everywhere it is called.
     */
    useAssetsDir(config.assetsDir);
  }

  /** A published build by slug, or undefined. Drafts and deleted builds are both "no". */
  findPublic(slug: string): BuildRow | undefined {
    const build = findBuildBySlug(this.db, slug);
    if (build === undefined || build.deletedAt !== null || !isVisible(build)) return undefined;
    return build;
  }

  /**
   * The facts about one build, in one language.
   *
   * The hero, rooms and ability come out of the extracted locale tables; the
   * rest is the row. The ability is the only one that needs the payload
   * decoded, because `main_spell` stores a *slot* and a name needs what is in
   * it — see `mainSpellName`.
   */
  factsFor(build: BuildRow, lang: SeoLang): BuildFacts {
    const author = findUserById(this.db, build.userId);
    const maps = mapsOfBuild(this.db, build.id);
    return {
      slug: build.slug,
      title: build.title,
      body: build.body,
      hero: heroName(build.heroId, lang),
      maps: mapNames(maps, lang),
      tier: build.tier,
      price: build.price,
      spell: mainSpellName(decodeStored(build.payload), build.mainSpell, lang),
      // A build always has an author row; the fallback is for the window between
      // an account being deleted and its builds being purged with it.
      author: author?.nickname ?? '',
      likeCount: build.likeCount,
      commentCount: build.commentCount,
      publishedAt: build.publishedAt,
      updatedAt: build.updatedAt,
    };
  }

  meta(target: MetaTarget, lang: SeoLang): PageMeta {
    return pageMeta(target, lang);
  }

  /**
   * One item's facts, or undefined for an id this deployment has never heard of.
   *
   * A thin pass-through to `names.ts`, which owns the imported tables — here so
   * the controller talks to one service rather than reaching around it, the
   * same way `factsFor` fronts the build tables.
   */
  itemFacts(id: string, lang: SeoLang): ItemFacts | undefined {
    return itemFacts(id, lang);
  }

  /**
   * The version of the emitted data, for an item card's address.
   *
   * The pak's own mtime, which `generatedAt` is written from. Mirrors
   * `dataVersion` in the webapp's `lib/meta.ts`; the two must agree, or a card
   * cached under the address the browser wrote is not the address the server
   * answers on.
   */
  dataVersion(): string {
    const at = Date.parse(meta.generatedAt);
    return Number.isFinite(at) ? String(at) : '0';
  }

  /**
   * Every item, as links, for the catalogue's prerendered copy.
   *
   * The grid a person sees is built by JavaScript from a fetched index, which a
   * crawler does not run — so without this, 1,885 item pages exist and nothing
   * links to them. Unlimited on purpose, unlike `recentLinks`: this is the page
   * whose entire job is to be that list.
   */
  itemLinks(lang: SeoLang): Array<{ href: string; text: string }> {
    return itemsIndex.rows.flatMap((row) => {
      const facts = itemFacts(row[1] as string, lang);
      if (facts === undefined) return [];
      const line = itemFactLine(facts, lang);
      return [
        {
          href: itemPagePath(facts.id),
          text: line === '' ? facts.name : `${facts.name} — ${line}`,
        },
      ];
    });
  }

  /** One item's card, as SVG, with every picture already encoded. */
  async cardForItem(facts: ItemFacts, lang: SeoLang): Promise<string> {
    const strings = SEO_STRINGS[lang];

    const [logo, logoAspect, art, gold] = await Promise.all([
      this.cards.brand(LOGOTYPE),
      this.cards.brandAspect(LOGOTYPE),
      this.cards.icon(itemIconPath(facts.id)),
      this.cards.icon(facts.cost > 0 ? GOLD_COIN : null),
    ]);

    /*
     * Stats or a sentence, by what the item is.
     *
     * Equipment and the things reforged like it are their numbers; everything
     * else — a material, a chest, a consumable — is its description. Asking for
     * the stats of a chest would get an empty list and fall through to the
     * sentence anyway, but deciding it here says which is intended.
     */
    const worn = facts.type === 'equip' || facts.type === 'stone';
    const stats = worn ? cardStats(facts.id, lang) : [];
    const description = worn ? '' : (itemDetail(facts.id, lang)?.descPlain ?? '');

    return renderItemCard({
      lang,
      logo,
      logoAspect,
      brand: strings.brand,
      title: facts.name,
      art,
      rarity: qualityColour(facts.quality),
      // The grade by name — `Mythic`, not `Quality 6`. The page says the name,
      // so the picture of the page has to as well.
      rarityLabel: strings.rarities[facts.quality] ?? null,
      tier: facts.level > 0 ? `T${facts.level}` : null,
      // The category alone: the tier, the grade and the price all have places of
      // their own on this card, so repeating them in the line would be the card
      // saying everything twice.
      facts: strings.itemTypes[facts.type] ?? facts.type,
      price: facts.cost > 0 ? `${formatGold(facts.cost)} ${strings.gold}` : null,
      gold,
      description,
      stats,
    });
  }


  /**
   * One build's card, as SVG, with every picture already encoded.
   *
   * Awaits the icons in parallel: they are nearly always memory hits, and on a
   * cold process the nine reads should not be nine round trips to the disk one
   * after another.
   *
   * Returns the drawn SVG rather than the model, because there are two card
   * layouts now and `CardService` rasterizes whatever it is handed — see its
   * `png`. Which renderer a card wants is knowledge this service has and that
   * one should not.
   */
  async cardFor(build: BuildRow, lang: SeoLang): Promise<string> {
    const strings = SEO_STRINGS[lang];
    const facts = this.factsFor(build, lang);
    const state = decodeStored(build.payload);
    const mapIds = mapsOfBuild(this.db, build.id);

    const slots = GEAR_SLOTS.map((slot) => {
      const value = state?.slots[slot];
      // An `unknown` index has no icon to draw — it is an item this deployment's
      // tables do not know — so it reads as an empty slot rather than as a
      // question mark on a picture nobody can ask a question about.
      return value?.k === 'id' ? itemIconPath(value.id) : null;
    });

    // The ability the author called the headline, as a picture. The *id* rather
    // than the name, which is why `mainSpellId` exists beside `mainSpellName`.
    //
    // Unless a Life Soul has taken that key over, in which case the picture is
    // the soul — the same substitution `mainSpellName` makes for the line of
    // text beside it, so the card's words and its icon agree.
    const soulId = headlineSoul(state, build.mainSpell);
    const spellId = mainSpellId(state, build.mainSpell);
    const headlineIcon = soulId !== null ? itemIconPath(soulId) : spellId === null ? null : abilityIconPath(spellId);

    const [logo, logoAspect, portrait, background, gold, spellIcon, ...items] = await Promise.all([
      this.cards.brand(LOGOTYPE),
      this.cards.brandAspect(LOGOTYPE),
      this.cards.icon(heroIconPath(build.heroId)),
      this.cards.icon(sceneOf(mapIds)),
      this.cards.icon(build.price > 0 ? GOLD_COIN : null),
      this.cards.icon(headlineIcon),
      ...slots.map((path) => this.cards.icon(path)),
    ]);

    const model: CardModel = {
      lang,
      logo,
      logoAspect,
      brand: strings.brand,
      title: oneLine(build.title) === '' ? strings.untitled : oneLine(build.title),
      spell: facts.spell,
      spellIcon,
      season: seasonLabel(build.season),
      tier: build.tier === null ? null : tierLabel(build.tier, strings.event),
      /*
       * The rooms, and the hero only when there is no portrait.
       *
       * Everything else on this line is drawn somewhere else on the card — the
       * tier is the chip beside it, the price is bottom right, the ability is
       * the line above with its own icon — so including any of them here prints
       * it twice. The hero is the same argument one step further: a 384-pixel
       * portrait of Phantom Assassin is already the loudest thing on the card,
       * and "T8 · Phantom Assassin" spends the fact line naming the picture.
       *
       * `portrait` rather than `heroId` is the condition, because the question
       * is whether the reader can *see* the hero. A hero whose art is missing
       * from this deployment draws no portrait, and then the name is the only
       * thing that says who the build is for.
       *
       * Rebuilt by zeroing fields rather than by cutting the finished string
       * apart, which would depend on how the separator is spelled and break the
       * moment a language chose a different one.
       */
      facts: buildFactLine(
        { ...facts, hero: portrait === null ? facts.hero : null, tier: null, price: 0, spell: null },
        lang,
      ),
      price: build.price > 0 ? `${formatGold(build.price)} ${strings.gold}` : null,
      portrait,
      background,
      items,
      gold,
    };
    return renderCard(model);
  }

  /** The site's own card, for every route that is neither a build nor the tracker. */
  async siteCard(lang: SeoLang): Promise<string> {
    const strings = SEO_STRINGS[lang];
    const [logo, logoAspect, background] = await Promise.all([
      this.cards.brand(LOGOTYPE),
      this.cards.brandAspect(LOGOTYPE),
      // A room scene as the backdrop, so the default card is not a bare
      // gradient. A fixed one: this image is cached under a single key and must
      // not change between two scrapes of the same URL.
      this.cards.icon(mapScenePath(SITE_CARD_ROOM)),
    ]);
    return renderCard({
      lang,
      logo,
      logoAspect,
      brand: strings.brand,
      title: strings.routes.browse.title,
      spell: null,
      tier: null,
      facts: strings.routes.browse.description,
      price: null,
      portrait: null,
      background,
      items: [],
      gold: null,
    });
  }

  /**
   * The tracker page's card: the farm overlay, in both of its states.
   *
   * Nothing here comes out of the database, because the page has no row —
   * the session is the constant in `aow5-shared/overlay` that the web app's own
   * `/tracker` preview draws from, so the card and the page quote the same gold.
   * What this method does is the part the renderer cannot: resolve the items and
   * the room out of the extracted tables in the reader's language, and read the
   * art off disk.
   */
  async trackerCard(lang: SeoLang): Promise<string> {
    const strings = SEO_STRINGS[lang];
    const readout = previewReadout((id) => previewItem(id, lang));

    /*
     * The art, in one pass over the session rather than per row.
     *
     * Keyed by item id and handed to the renderer as a map, because the panel
     * draws the same item twice — once as the headline's own picture and once in
     * the loot list — and a renderer that took an array beside the rows would
     * have to be told which one the headline is a second time.
     */
    const [logo, logoAspect, ...art] = await Promise.all([
      this.cards.brand(LOGOTYPE),
      this.cards.brandAspect(LOGOTYPE),
      ...PREVIEW_LOOT.map((pile) => this.cards.icon(itemIconPath(pile.id))),
    ]);

    return renderTrackerCard({
      lang,
      logo,
      logoAspect,
      brand: strings.brand,
      title: strings.routes.tracker.title,
      overlay: {
        ...strings.overlay,
        // The id when this deployment cannot name the room, which is the same
        // fallback every other name on a card takes.
        room: mapName(PREVIEW_ROOM, lang) ?? PREVIEW_ROOM,
      },
      readout,
      art: Object.fromEntries(PREVIEW_LOOT.map((pile, index) => [pile.id, art[index] ?? null])),
    });
  }

  /**
   * The recent published builds, as links for the crawler's copy of the browse
   * page.
   *
   * The reason this exists: a build page is reachable from a client-rendered
   * list and from the sitemap, and a sitemap is a hint rather than a crawl
   * path. Twenty real links are the path. Ordered by recency rather than by
   * likes so the set turns over — a crawler that returns weekly should find
   * something new, not the same twenty forever.
   */
  recentLinks(lang: SeoLang, limit = 20): Array<{ href: string; text: string }> {
    const rows = listPublishedBuilds(this.db, limit);
    // One query for the whole page's rooms, the way the browse list does it for
    // authors. Twenty builds is twenty round trips otherwise — and this runs on
    // a request from a crawler, which is the traffic least worth spending them
    // on.
    const maps = mapsOfBuilds(
      this.db,
      rows.map((row) => row.id),
    );

    return rows.map((build) => {
      /*
       * Built from the row and the batched rooms rather than through
       * `factsFor`, which would decode the payload and look up an author per
       * build for two facts a link's text does not show. The tier and price are
       * dropped for a different reason: a list of twenty lines is scanned, and
       * the hero, room and spell are what distinguish one line from the next.
       */
      const facts = buildFactLine(
        {
          hero: heroName(build.heroId, lang),
          maps: mapNames(maps.get(build.id) ?? [], lang),
          tier: build.tier,
          spell: null,
          price: 0,
        },
        lang,
      );
      const title = oneLine(build.title) === '' ? SEO_STRINGS[lang].untitled : oneLine(build.title);
      return {
        href: `/builds/${build.slug}`,
        text: facts === '' ? title : `${title} — ${facts}`,
      };
    });
  }

  /**
   * Every page worth crawling.
   *
   * The two indexable static routes, then every published build. `priority` is
   * relative within this file only and says nothing to any other site; it is
   * here to tell a crawler that the root is the page to come back to.
   */
  sitemap(): SitemapEntry[] {
    const entries: SitemapEntry[] = [
      { path: '/', changefreq: 'daily', priority: '1.0' },
      { path: '/items', changefreq: 'monthly', priority: '0.6' },
      { path: '/tracker', changefreq: 'monthly', priority: '0.5' },
    ];
    /*
     * The catalogue itself, and not the 1,885 pages under it.
     *
     * A sitemap naming every item would be most of a megabyte of XML that says
     * the same `changefreq` on every line, and the pages are already reachable:
     * `/items` prerenders as a list of links to all of them, which is the route
     * a crawler takes anyway. If an item page ever gains something worth a
     * `lastmod` of its own, that is the moment to reconsider.
     */
    for (const build of listPublishedBuilds(this.db, SITEMAP_LIMIT)) {
      entries.push({
        path: `/builds/${build.slug}`,
        lastmod: build.updatedAt,
        changefreq: 'weekly',
        priority: '0.8',
      });
    }
    return entries;
  }
}
