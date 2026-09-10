import { Inject, Injectable } from '@nestjs/common';
import { groupsInPanel } from 'aow5-shared/codec';
import {
  SEO_STRINGS,
  buildFactLine,
  formatGold,
  oneLine,
  pageMeta,
  type BuildFacts,
  type MetaTarget,
  type PageMeta,
  type SeoLang,
} from 'aow5-shared/seo';
import { tierLabel } from 'aow5-shared/data';
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
  mainSpellName,
  mapNames,
  mapScenePath,
} from '../../core/seo/names.ts';
import type { CardModel } from '../../core/seo/card.ts';
import type { SitemapEntry } from '../../core/seo/sitemap.ts';
import { DB } from '../db/tokens.ts';
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
  ) {}

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
   * The card model for one build, with every picture already encoded.
   *
   * Awaits the icons in parallel: they are nearly always memory hits, and on a
   * cold process the nine reads should not be nine round trips to the disk one
   * after another.
   */
  async cardFor(build: BuildRow, lang: SeoLang): Promise<CardModel> {
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

    const [logo, portrait, background, gold, ...items] = await Promise.all([
      this.cards.brand(LOGOTYPE),
      this.cards.icon(heroIconPath(build.heroId)),
      this.cards.icon(sceneOf(mapIds)),
      this.cards.icon(build.price > 0 ? GOLD_COIN : null),
      ...slots.map((path) => this.cards.icon(path)),
    ]);

    return {
      lang,
      logo,
      brand: strings.brand,
      title: oneLine(build.title) === '' ? strings.untitled : oneLine(build.title),
      spell: facts.spell,
      tier: build.tier === null ? null : tierLabel(build.tier, strings.event),
      /*
       * The hero and the rooms, and nothing else.
       *
       * The tier, the price and the headline ability are all drawn in their own
       * places on the card, so including them here would print each of them
       * twice. Rebuilt by zeroing those fields rather than by cutting the
       * finished string apart, which would depend on how the separator is
       * spelled and break the moment a language chose a different one.
       */
      facts: buildFactLine({ ...facts, tier: null, price: 0, spell: null }, lang),
      price: build.price > 0 ? `${formatGold(build.price)} ${strings.gold}` : null,
      portrait,
      background,
      items,
      gold,
    };
  }

  /** The site's own card, for every route that is not a build. */
  async siteCard(lang: SeoLang): Promise<CardModel> {
    const strings = SEO_STRINGS[lang];
    const [logo, background] = await Promise.all([
      this.cards.brand(LOGOTYPE),
      // A room scene as the backdrop, so the default card is not a bare
      // gradient. A fixed one: this image is cached under a single key and must
      // not change between two scrapes of the same URL.
      this.cards.icon(mapScenePath(SITE_CARD_ROOM)),
    ]);
    return {
      lang,
      logo,
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
    };
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
      { path: '/tracker', changefreq: 'monthly', priority: '0.5' },
    ];
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
