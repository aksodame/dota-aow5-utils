import { readFile, mkdir, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Resvg } from '@resvg/resvg-js';
import { CARD_WIDTH, renderCard, type CardModel } from '../../core/seo/card.ts';
import { stale, type CardKey } from '../../core/seo/cache-key.ts';
import { CONFIG, type AppConfig } from '../config.ts';

/**
 * Turns a card model into PNG bytes, and does it as rarely as possible.
 *
 * Two caches, for two different costs:
 *
 *   * **The icons**, in memory. A card draws up to nine PNGs and eight of them
 *     — the gold coin, the common boots, the item everybody runs — are on most
 *     other cards too. They are read once and kept as the `data:` URI the SVG
 *     wants, so the encode happens once as well.
 *   * **The finished card**, on disk. Rasterizing 1200×630 is tens of
 *     milliseconds and a popular build's link gets scraped by every client in
 *     the channel it was pasted into. The file is keyed by slug *and*
 *     `updated_at`, so an edit produces a new key rather than a stale hit, and
 *     the previous key is deleted on the way past.
 *
 * Nothing here throws for a missing picture. A card is a decoration on somebody
 * else's message; the failure mode worth designing out is the one where a
 * broken icon path turns a shared link into a 500.
 */
@Injectable()
export class CardService {
  private readonly log = new Logger(CardService.name);

  /** `data:` URIs by path relative to the assets root. `null` marks one that is not there. */
  private readonly icons = new Map<string, string | null>();

  /**
   * Whether the cache directory has been created.
   *
   * A promise rather than a boolean, so concurrent first requests await one
   * `mkdir` instead of racing several.
   */
  private ready: Promise<void> | null = null;

  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  /**
   * A PNG for the given key, rendered if it is not already on disk.
   *
   * The key says both what the file is called and what it replaces. See
   * `buildCardKey` and `siteCardKey`.
   */
  async png(key: CardKey, model: () => Promise<CardModel>): Promise<Buffer> {
    const cached = await this.readCached(key.name);
    if (cached !== null) return cached;

    const bytes = await this.rasterize(await model());
    await this.writeCached(key, bytes);
    return bytes;
  }

  private async rasterize(model: CardModel): Promise<Buffer> {
    const svg = renderCard(model);
    /*
     * Rendered at the card's own size rather than scaled, and with system fonts
     * loaded: the image is fonts-noto-cjk from the runtime image, which is the
     * one family that carries Latin, Cyrillic and Simplified Chinese together.
     * See the note on FONT_STACK, and the apt line in infra/api.Dockerfile.
     */
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: CARD_WIDTH },
      background: '#14120f',
      font: {
        /*
         * **`fontDirs` is what actually finds the fonts.** `loadSystemFonts`
         * alone does not, and that is the bug this pair exists to fix: it asks
         * *fontconfig* where the fonts are, and `node:22-bookworm-slim` — the
         * runtime image — ships `fonts-noto-cjk` without shipping fontconfig. So
         * the font files were right there on disk, the database came up empty,
         * and every card rendered its pictures and dropped every line of text:
         * no title, no tier, no price, in production and nowhere else. resvg
         * said so twice per render ("No match for … font-family"), into a log
         * level that was switched off.
         *
         * Naming the directory instead asks nobody: fontdb walks it and reads
         * what is there. A path that does not exist is skipped, which is what
         * makes the same list correct on a developer's macOS machine, where
         * `loadSystemFonts` is the one that works and these three are absent.
         * Both are on for that reason — neither is sufficient alone.
         */
        loadSystemFonts: true,
        fontDirs: ['/usr/share/fonts', '/usr/local/share/fonts', '/usr/share/fonts/opentype/noto'],
        defaultFontFamily: 'Noto Sans CJK SC',
        sansSerifFamily: 'Noto Sans CJK SC',
      },
      // Every `<image>` in the SVG is already a data: URI — see `renderCard`,
      // which takes its pictures pre-encoded — so the renderer resolves no
      // paths and needs no resources directory to resolve them against.
      //
      // `warn` rather than `off`. Off is what made a card with no text on it a
      // silent success for as long as it took somebody to paste a link in
      // Discord and look at the picture; resvg's warnings are the only thing
      // that says a font-family matched nothing, and they cost one line on a
      // render that is already wrong.
      logLevel: 'warn',
    });
    return Buffer.from(resvg.render().asPng());
  }

  /**
   * One icon as a `data:` URI, or null when it is not on disk.
   *
   * `relative` is a path under the assets root — `icons/heroes/axe.png`. It is
   * never built from anything a client sent: the filenames come out of the
   * extracted data tables, which is what makes the join below safe.
   */
  async icon(relative: string | null): Promise<string | null> {
    return this.encode(this.config.assetsDir, relative);
  }

  /** The site's own artwork, from the other root. See `AppConfig.brandDir`. */
  async brand(relative: string): Promise<string | null> {
    return this.encode(this.config.brandDir, relative);
  }

  /**
   * The wordmark's width ÷ height, read out of the file itself.
   *
   * A PNG says its size in the first chunk: an 8-byte signature, then `IHDR`,
   * then width and height as big-endian 32-bit integers at bytes 16 and 20. No
   * decoder needed, and nothing else in this file wants one.
   *
   * Null when the image is missing or is not a PNG — the card then falls back
   * to the ratio it used to hardcode, which is the closest thing to a right
   * answer available without the file.
   */
  async brandAspect(relative: string): Promise<number | null> {
    const uri = await this.brand(relative);
    if (uri === null) return null;
    const base64 = uri.slice(uri.indexOf(',') + 1);
    // 24 bytes is the signature plus the IHDR length, type, width and height.
    const head = Buffer.from(base64.slice(0, 40), 'base64');
    if (head.length < 24 || head.toString('ascii', 12, 16) !== 'IHDR') return null;
    const width = head.readUInt32BE(16);
    const height = head.readUInt32BE(20);
    return height === 0 ? null : width / height;
  }

  private async encode(root: string, relative: string | null): Promise<string | null> {
    if (relative === null) return null;

    // Keyed by the joined path, so the two roots cannot collide on a shared
    // filename — `logotype.png` under either would otherwise be one entry.
    const path = join(root, relative);
    const known = this.icons.get(path);
    if (known !== undefined) return known;

    let encoded: string | null = null;
    try {
      const bytes = await readFile(path);
      encoded = `data:image/png;base64,${bytes.toString('base64')}`;
    } catch {
      // Logged once per missing path rather than per request, because the
      // negative is cached below alongside the hits.
      this.log.warn(`No image at ${path}; drawing the card without it.`);
    }
    this.icons.set(path, encoded);
    return encoded;
  }

  private async ensureDir(): Promise<void> {
    this.ready ??= mkdir(this.config.cardCacheDir, { recursive: true }).then(() => undefined);
    await this.ready;
  }

  private async readCached(key: string): Promise<Buffer | null> {
    try {
      return await readFile(join(this.config.cardCacheDir, `${key}.png`));
    } catch {
      return null;
    }
  }

  /**
   * Writes through a temporary name.
   *
   * A rename is atomic within a filesystem, so a second request that arrives
   * mid-write reads either the whole previous file or the whole new one — never
   * the half of a PNG that has been flushed so far. Two requests racing to
   * render the same missing card both write, and the second rename wins; they
   * produced identical bytes, so which one wins does not matter.
   */
  private async writeCached(key: CardKey, bytes: Buffer): Promise<void> {
    try {
      await this.ensureDir();
      const final = join(this.config.cardCacheDir, `${key.name}.png`);
      const temporary = `${final}.${process.pid}.tmp`;
      await writeFile(temporary, bytes);
      await rename(temporary, final);
      await this.evictOlder(key);
    } catch (error) {
      // A full or read-only disk costs the cache, not the response: the bytes
      // are already rendered and are about to be sent either way.
      this.log.warn(`Could not cache card ${key.name}: ${String(error)}`);
    }
  }

  /**
   * Drops the cards this one replaces.
   *
   * Which those are is `stale` — every card for an older version of the same
   * build, and nothing else. Without it the directory grows by one file per
   * edit per language, forever.
   */
  private async evictOlder(key: CardKey): Promise<void> {
    const gone = stale(await readdir(this.config.cardCacheDir), key);
    await Promise.all(
      gone.map((name) =>
        unlink(join(this.config.cardCacheDir, name)).catch(() => {
          // Somebody else already removed it, which is the outcome wanted.
        }),
      ),
    );
  }
}
