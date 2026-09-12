/**
 * Renders the social card to PNG files you can actually look at.
 *
 * `pnpm --filter aow5-utils-api card-preview [outDir]`
 *
 * The card is laid out by hand over an SVG with no flow layout — every line is
 * positioned from a width *estimate*, because there are no font metrics on this
 * side of the renderer. That makes it the one piece of this codebase where
 * reading the source tells you much less than looking at the output, and where
 * "the title overflows in Russian" is not a thing a unit test will notice.
 *
 * Three samples, chosen for the three ways the layout can come apart: a full
 * English card, a Chinese one (double-width glyphs, a wrapped title, the Event
 * pill at its widest), and a card for a build whose author filled in almost
 * nothing.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { CARD_WIDTH, renderCard, type CardModel } from '../core/seo/card.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const assets = join(repo, 'packages', 'aow5-shared', 'public');
const brand = join(repo, 'apps', 'webapp', 'src', 'assets');
const out = process.argv[2] ?? join(here, '..', 'card-preview');

/** A picture as the `data:` URI the card wants, or null when it is not there. */
function encode(root: string, relative: string): string | null {
  try {
    return `data:image/png;base64,${readFileSync(join(root, relative)).toString('base64')}`;
  } catch {
    return null;
  }
}

const uri = (relative: string) => encode(assets, relative);
const item = (name: string) => uri(`icons/items/${name}`);
const ability = (name: string) => uri(`icons/abilities/${name}`);
const LOGO = encode(brand, 'logotype.png');

/**
 * The wordmark's shape, measured the way `CardService.brandAspect` measures it.
 *
 * Read rather than assumed for the reason this script exists: a preview that
 * draws the logo at a ratio the real card does not use is a preview that hides
 * the one thing it is meant to show. Width and height are big-endian 32-bit
 * integers at bytes 16 and 20 of a PNG.
 */
const LOGO_ASPECT = ((): number | null => {
  try {
    const head = readFileSync(join(brand, 'logotype.png')).subarray(0, 24);
    if (head.toString('ascii', 12, 16) !== 'IHDR') return null;
    return head.readUInt32BE(16) / head.readUInt32BE(20);
  } catch {
    return null;
  }
})();

const SAMPLES: Array<{ name: string; model: CardModel }> = [
  {
    name: 'en-full',
    model: {
      lang: 'en',
      logo: LOGO,
      logoAspect: LOGO_ASPECT,
      brand: 'AOW5 Builds',
      title: 'Frost-lock Axe, a 40k clear for the deep tiers',
      spell: "Berserker's Call",
      spellIcon: ability('axe_berserkers_call.png'),
      tier: 'T6',
      facts: 'Axe \u00b7 Frozen Plain',
      price: '12.4k gold',
      portrait: uri('icons/heroes/axe.png'),
      background: uri('icons/maps/M003.png'),
      items: [
        item('occult_bracelet.png'),
        item('icon_xz_73.png'),
        null,
        item('occult_bracelet.png'),
        item('icon_xz_73.png'),
        item('occult_bracelet.png'),
      ],
      gold: uri('icons/ui/gold.png'),
    },
  },
  {
    name: 'zh-wrapped',
    model: {
      lang: 'zh',
      logo: LOGO,
      logoAspect: LOGO_ASPECT,
      brand: 'AOW5 \u914d\u88c5',
      title: '\u51b0\u971c\u9501\u5b9a\u65a7\u738b\uff0c\u6df1\u5c42\u901a\u5173\u914d\u88c5\u4e0e\u88c5\u5907\u642d\u914d\u5b8c\u6574\u6307\u5357',
      spell: '\u72c2\u6218\u58eb\u4e4b\u543c',
      spellIcon: ability('axe_berserkers_call.png'),
      tier: '\u6d3b\u52a8',
      facts: '\u65a7\u738b\u00b7\u51b0\u971c\u5e73\u539f',
      price: '12.4k \u91d1\u5e01',
      portrait: uri('icons/heroes/lina.png'),
      background: uri('icons/maps/M002.png'),
      items: [item('occult_bracelet.png'), null, null, item('icon_xz_73.png'), null, null],
      gold: uri('icons/ui/gold.png'),
    },
  },
  {
    name: 'ru-bare',
    model: {
      lang: 'ru',
      logo: LOGO,
      logoAspect: LOGO_ASPECT,
      brand: '\u0421\u0431\u043e\u0440\u043a\u0438 AOW5',
      title: '\u0421\u0431\u043e\u0440\u043a\u0430 \u0431\u0435\u0437 \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u044f',
      spell: null,
      tier: null,
      facts: '',
      price: null,
      portrait: null,
      background: null,
      items: [null, null, null, null, null, null],
      gold: null,
    },
  },
];

mkdirSync(out, { recursive: true });
for (const { name, model } of SAMPLES) {
  const png = new Resvg(renderCard(model), {
    fitTo: { mode: 'width', value: CARD_WIDTH },
    background: '#14120f',
    font: { loadSystemFonts: true, defaultFontFamily: 'Noto Sans CJK SC' },
    logLevel: 'off',
  })
    .render()
    .asPng();
  const file = join(out, `${name}.png`);
  writeFileSync(file, png);
  console.log(`${file}  ${(png.length / 1024).toFixed(0)} kB`);
}
