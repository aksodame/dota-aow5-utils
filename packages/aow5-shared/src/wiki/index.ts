/**
 * The wiki's data: the types its files are emitted against, and the loaders.
 *
 * Each domain — monsters, progression, sky, … — has its own module here with
 * its types and any pure logic over them (drop chances, roll maths), so the
 * webapp, the API's prerenderer and the tests share one implementation.
 */

export { loadWikiFile, loadWikiLocale, wikiDataUrl } from './load.ts';
