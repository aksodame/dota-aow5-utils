import { Controller, Get, Header, Headers, Inject, Param, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { SEO_STRINGS, oneLine, type MetaTarget } from 'aow5-shared/seo';
import { isSlug } from '../../core/builds/slug.ts';
import { matchPath } from '../../core/seo/routes.ts';
import { pickLang } from '../../core/seo/lang.ts';
import { renderPrerender } from '../../core/seo/html.ts';
import { renderRobots, renderSitemap } from '../../core/seo/sitemap.ts';
import { CONFIG, type AppConfig } from '../config.ts';
import { buildCardKey, itemCardKey, siteCardKey, trackerCardKey, type CardKey } from '../../core/seo/cache-key.ts';
import { CardService } from './card.service.ts';
import { SeoService } from './seo.service.ts';

/**
 * What a crawler gets, and the pictures it comes back for.
 *
 * Nothing here is reachable by a browser in the normal course of using the
 * site: Caddy matches a list of scraper user agents and routes only those to
 * `prerender` (see infra/Caddyfile). The card endpoints are the exception —
 * those *are* fetched by everyone, because they are the URL in `og:image`.
 *
 * All of it is anonymous and none of it reads a session. A card must render the
 * same for the scraper as for the person who pasted the link, or the preview in
 * the channel is not the page.
 */
@Controller()
export class SeoController {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly seo: SeoService,
    private readonly cards: CardService,
  ) {}

  /**
   * The prerendered document for one path.
   *
   * The path arrives in a header rather than the URL. Caddy rewrites the
   * request to this endpoint and puts the original URI in `X-Original-URI`,
   * which avoids having to URL-encode a path-with-query into a query parameter
   * and then decode it back — a round trip with two places to get the escaping
   * wrong and no way to notice.
   *
   * Untrusted, like any header: `matchPath` parses it against the same four
   * routes the client router knows and falls through to the browse page for
   * anything it does not recognise, exactly as `matchRoute` does.
   */
  @Get('seo/prerender')
  @Header('Content-Type', 'text/html; charset=utf-8')
  // Crawlers are polite and scrapers are not. This is generous for the former
  // and a ceiling for the latter; it renders no images and touches at most one
  // indexed row, so the cost of a hit is small.
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  prerender(
    @Headers('x-original-uri') uri: string | undefined,
    @Headers('accept-language') acceptLanguage: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): string {
    const match = matchPath(uri ?? '/');
    const lang = pickLang(match.lang, acceptLanguage);
    const strings = SEO_STRINGS[lang];

    if (match.route === 'build') {
      const build = this.seo.findPublic(match.slug);
      if (build === undefined) {
        // A 404 with a body, not a redirect. A shared link to a deleted build
        // should stop being indexed rather than start pointing at the front
        // page — see the `missing` case in `pageMeta`.
        response.status(404);
        const meta = this.seo.meta({ kind: 'missing', slug: match.slug }, lang);
        return renderPrerender({ meta, origin: this.origin, heading: meta.title });
      }

      const facts = this.seo.factsFor(build, lang);
      const meta = this.seo.meta({ kind: 'build', build: facts }, lang);
      return renderPrerender({
        meta,
        origin: this.origin,
        heading: oneLine(build.title) === '' ? strings.untitled : oneLine(build.title),
        // The same text the page shows, in the same order: the facts line under
        // the title, then the author's notes. This is what keeps the crawler's
        // copy a copy rather than a different page served to a different client.
        paragraphs: [meta.description, oneLine(build.body)],
      });
    }

    if (match.route === 'item') {
      const facts = this.seo.itemFacts(match.itemId, lang);
      if (facts === undefined) {
        // A 404 with a body and a canonical of its own, exactly as a deleted
        // build gets: an item that left the game should stop being indexed
        // rather than start pointing at the catalogue.
        response.status(404);
        const meta = this.seo.meta({ kind: 'missingItem', id: match.itemId }, lang);
        return renderPrerender({ meta, origin: this.origin, heading: meta.title });
      }

      const meta = this.seo.meta({ kind: 'item', item: facts, version: this.seo.dataVersion() }, lang);
      return renderPrerender({
        meta,
        origin: this.origin,
        heading: facts.name,
        paragraphs: [meta.description],
      });
    }

    // `match.route` is every route but `build` and `item`, which the branches
    // above returned for — and every one of those is a `MetaTarget` with no
    // other fields.
    const meta = this.seo.meta({ kind: match.route } satisfies MetaTarget, lang);
    return renderPrerender({
      meta,
      origin: this.origin,
      heading: meta.title,
      paragraphs: [meta.description],
      // Only the browse page lists anything. It is the one route whose content
      // is a set of links to pages a crawler cannot otherwise reach.
      links:
        match.route === 'browse'
          ? this.seo.recentLinks(lang)
          : /*
             * The catalogue lists every item page, which is the only way a
             * crawler reaches one: nothing else on the site links to them in
             * bulk, and the grid itself is rendered by JavaScript a crawler
             * does not run.
             */
            match.route === 'items'
            ? this.seo.itemLinks(lang)
            : undefined,
    });
  }

  /**
   * One build's card, at `<slug>.<updated_at>.<lang>.png`.
   *
   * Two older shapes still answer here, because both are in the wild and an
   * `og:image` that 404s is a broken preview wherever the link was ever
   * posted: `<slug>.<updated_at>.png` from before the language was in the
   * path, and a bare `<slug>.png` from before the version was.
   *
   * The `.png` is part of the last segment rather than a route of its own,
   * because that is how it appears in `og:image` — several scrapers will not
   * fetch an image URL that does not end in an image extension, and at least
   * one refuses to cache one.
   *
   * **The version is not checked against the build.** It is a cache-buster, not
   * an argument: whatever it says, this answers with the build's current card.
   * Refusing a stale one would turn every link shared before an edit into a
   * broken picture, which is the opposite of the point.
   *
   * The language in the path *is* honoured, and outranks `?lang=` and
   * `Accept-Language` both: it is the only one of the three a scraper reliably
   * carries, and the address claims to be `immutable`, so what it names has to
   * be what comes back every time.
   */
  @Get('og/builds/:slug')
  @Throttle({ default: { ttl: 60_000, limit: 240 } })
  async buildCard(
    @Param('slug') param: string,
    @Query('lang') lang: string | undefined,
    @Headers('accept-language') acceptLanguage: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const name = param.endsWith('.png') ? param.slice(0, -4) : param;
    /*
     * A slug is `[A-Za-z0-9]` — `isSlug` below is the authority — so it never
     * contains a dot, and splitting the whole name on dots is unambiguous:
     * the first field is the slug and whatever follows is the version, the
     * language, or neither.
     *
     * Read by shape rather than by position, so all three URL vintages parse
     * through one path: the all-digits field is the version wherever it is,
     * and anything else is the language. A name with neither is the oldest
     * form and is all slug.
     */
    const [first = '', ...rest] = name.split('.');
    const slug = first;
    const version = rest.find((part) => /^\d+$/.test(part));
    const pathLang = rest.find((part) => !/^\d+$/.test(part));
    const versioned = version !== undefined;
    // The path wins, then `?lang=`, then the header — see the note above.
    const chosen = pickLang(pathLang ?? lang, acceptLanguage);
    const build = isSlug(slug) ? this.seo.findPublic(slug) : undefined;

    if (build === undefined) {
      // The site card, not a 404. A scraper that gets an error for `og:image`
      // shows a preview with a broken picture in it, which is worse than one
      // with a generic picture — and this is reached by a link to a build its
      // author has since deleted, which is not a rare event.
      await this.sendCard(response, siteCardKey(chosen), () => this.seo.siteCard(chosen), false);
      return;
    }

    await this.sendCard(
      response,
      buildCardKey(build.slug, build.updatedAt, chosen),
      () => this.seo.cardFor(build, chosen),
      // Only a versioned URL may be called immutable. Without the version the
      // address outlives the picture at it, which is how an edited build kept
      // showing its old card wherever the link had already been posted.
      versioned,
    );
  }

  /**
   * One item's card, at `<id>.<data-version>.<lang>.png`.
   *
   * The same three shapes a build's card answers on, and for the same reason —
   * an `og:image` that 404s is a broken preview wherever the link was posted,
   * so a bare `<id>.png` and an unversioned `<id>.<lang>.png` both work.
   *
   * Read by *shape* rather than by position, exactly as `buildCard` does it:
   * an item id contains underscores and digits but never a dot, so splitting
   * the name on dots is unambiguous. The all-digits field is the data version
   * wherever it appears, and a two-letter field is the language.
   *
   * The version is a cache-buster, not an argument: whatever it says, this
   * answers with the item's current card. Refusing a stale one would break
   * every link shared before the last pak refresh.
   */
  @Get('og/items/:id')
  @Throttle({ default: { ttl: 60_000, limit: 240 } })
  async itemCard(
    @Param('id') param: string,
    @Query('lang') lang: string | undefined,
    @Headers('accept-language') acceptLanguage: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const name = param.endsWith('.png') ? param.slice(0, -4) : param;

    /*
     * An id is `item_` plus letters, digits and underscores, so the *first two*
     * dot-separated fields are never part of it — but the id itself contains no
     * dot, and neither does a version or a language, so one split does read it:
     * the first field is the id, and each field after it is a version if it is
     * all digits and a language if it is two letters.
     */
    const [id, ...rest] = name.split('.');
    let version: string | undefined;
    let named: string | undefined;
    for (const field of rest) {
      if (/^\d+$/.test(field)) version = field;
      else if (field.length === 2) named = field;
    }

    const chosen = pickLang(named ?? lang, acceptLanguage);
    const facts = id === undefined ? undefined : this.seo.itemFacts(id, chosen);

    if (facts === undefined) {
      // The site's own card rather than a 404, exactly as a deleted build gets:
      // a preview with a generic picture beats one with a broken picture.
      await this.sendCard(response, siteCardKey(chosen), () => this.seo.siteCard(chosen), false);
      return;
    }

    const current = this.seo.dataVersion();
    await this.sendCard(
      response,
      itemCardKey(facts.id, current, chosen),
      () => this.seo.cardForItem(facts, chosen),
      // Only a versioned address may be called immutable, and only when the
      // version asked for is the one being served.
      version === current,
    );
  }

  /**
   * The tracker page's card, at `tracker/<lang>.png` or bare at `tracker.png`.
   *
   * Two addresses for one picture, because two different things fetch it. What
   * `og:image` names is the path form — see `trackerCardPath` — since a scraper
   * sends no useful `Accept-Language` and a language left out of the URL is a
   * language its CDN then picks for everybody. The bare form is for anything
   * that asks without one, and it falls back to `?lang=` and then to the header
   * exactly as the site card does.
   *
   * Not `immutable`, for the same reason the site card is not: it is keyed by
   * nothing but its language, so its bytes are allowed to change when the
   * renderer or the session it draws does.
   */
  @Get(['og/tracker.png', 'og/tracker/:name'])
  @Throttle({ default: { ttl: 60_000, limit: 240 } })
  async trackerCard(
    @Param('name') param: string | undefined,
    @Query('lang') lang: string | undefined,
    @Headers('accept-language') acceptLanguage: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    // `pickLang` is the authority on what is a language and what is not, so an
    // unknown segment falls through to the next answer rather than 404ing: a
    // broken `og:image` is a broken preview wherever the link was posted.
    const fromPath = param === undefined ? undefined : param.replace(/\.png$/, '');
    const chosen = pickLang(fromPath ?? lang, acceptLanguage);
    await this.sendCard(response, trackerCardKey(chosen), () => this.seo.trackerCard(chosen), false);
  }

  /** The default card, for every route with no card of its own. */
  @Get('og/site.png')
  @Throttle({ default: { ttl: 60_000, limit: 240 } })
  async siteCard(
    @Query('lang') lang: string | undefined,
    @Headers('accept-language') acceptLanguage: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const chosen = pickLang(lang, acceptLanguage);
    await this.sendCard(response, siteCardKey(chosen), () => this.seo.siteCard(chosen), false);
  }

  @Get('seo/sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  // An hour. The sitemap is a full table scan of published builds, and no
  // crawler benefits from one that is fresher than that.
  @Header('Cache-Control', 'public, max-age=3600')
  sitemap(): string {
    return renderSitemap(this.origin, this.seo.sitemap());
  }

  @Get('seo/robots.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=86400')
  robots(): string {
    return renderRobots(this.origin);
  }

  private get origin(): string {
    // No trailing slash, ever: every path this joins to already starts with
    // one, and `https://site//builds/x` is a different URL to a crawler.
    return this.config.siteOrigin.replace(/\/+$/, '');
  }

  /**
   * Renders or serves a card.
   *
   * `immutable` is the difference between the two kinds, and it is a claim about
   * the **URL**, not about the cache key. A versioned build card can never
   * change at its own address, so a year is safe there. Everything else — the
   * site card, and a build card asked for without a version — has to be allowed
   * to go stale, so it gets a day.
   */
  private async sendCard(
    response: Response,
    key: CardKey,
    svg: () => Promise<string>,
    immutable: boolean,
  ): Promise<void> {
    const png = await this.cards.png(key, svg);
    response.setHeader('Content-Type', 'image/png');
    response.setHeader(
      'Cache-Control',
      immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=86400',
    );
    response.setHeader('Content-Length', String(png.length));
    response.end(png);
  }
}
