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
import { buildCardKey, siteCardKey, type CardKey } from '../../core/seo/cache-key.ts';
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

    // `match.route` is every route but `build`, which the branch above returned
    // for — and every one of those is a `MetaTarget` with no other fields.
    const meta = this.seo.meta({ kind: match.route } satisfies MetaTarget, lang);
    return renderPrerender({
      meta,
      origin: this.origin,
      heading: meta.title,
      paragraphs: [meta.description],
      // Only the browse page lists anything. It is the one route whose content
      // is a set of links to pages a crawler cannot otherwise reach.
      links: match.route === 'browse' ? this.seo.recentLinks(lang) : undefined,
    });
  }

  /**
   * One build's card.
   *
   * The `.png` is part of the last segment rather than a route of its own,
   * because that is how it appears in `og:image` — several scrapers will not
   * fetch an image URL that does not end in an image extension, and at least
   * one refuses to cache one.
   */
  @Get('og/builds/:slug')
  @Throttle({ default: { ttl: 60_000, limit: 240 } })
  async buildCard(
    @Param('slug') param: string,
    @Query('lang') lang: string | undefined,
    @Headers('accept-language') acceptLanguage: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const slug = param.endsWith('.png') ? param.slice(0, -4) : param;
    const chosen = pickLang(lang, acceptLanguage);
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
      true,
    );
  }

  /** The default card, for every route that is not a build. */
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
   * `immutable` is the difference between the two kinds. A build's card is
   * keyed by `updated_at`, so that URL's bytes can never change and a year is
   * safe; the site card is keyed by nothing and has to be allowed to go stale
   * eventually, so it gets a day.
   */
  private async sendCard(
    response: Response,
    key: CardKey,
    model: () => Promise<Awaited<ReturnType<SeoService['siteCard']>>>,
    immutable: boolean,
  ): Promise<void> {
    const png = await this.cards.png(key, model);
    response.setHeader('Content-Type', 'image/png');
    response.setHeader(
      'Cache-Control',
      immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=86400',
    );
    response.setHeader('Content-Length', String(png.length));
    response.end(png);
  }
}
