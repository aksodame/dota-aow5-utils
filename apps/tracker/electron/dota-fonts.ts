import { net, protocol } from 'electron';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Radiance, Dota's own UI face, borrowed from the player's install.
 *
 * The Dota style is meant to look like one of the game's panels, and half of
 * that is the type. The font is Valve's and does not ship in this installer —
 * but everybody running a tracker for a Dota custom game has Dota on disk, and
 * the face sits there as plain OTF files. So the renderer asks for
 * `dotafont://fonts/radiance-bold.otf` and this serves it out of the game's
 * directory.
 *
 * Every step fails quietly. No Steam, no Dota, a file renamed by a patch: the
 * request 404s, `@font-face` moves on, and the style is drawn in Segoe UI —
 * the right colours in the wrong face, which is a cosmetic loss and not a
 * broken overlay.
 *
 * No hyphen in the scheme, deliberately: Vite only recognises `letters://` as
 * an external URL, and a `url()` it does not recognise is one it tries to
 * resolve as a file at build time.
 */

export const DOTA_FONT_SCHEME = 'dotafont';

/** Only the Radiance files, by name. The handler never reads anything the renderer names freely. */
const FONT_FILE = /^radiance-[a-z]+\.otf$/;

/** Dota's app id, which is how `libraryfolders.vdf` says which library holds it. */
const DOTA_APP_ID = '570';

/** Must run before `app.whenReady`: Chromium fixes a scheme's privileges at startup. */
export function registerDotaFontScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: DOTA_FONT_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  ]);
}

/** Inside `whenReady`. Looks for Dota once, and answers every font request from that. */
export function serveDotaFonts(): void {
  const dir = findFontDir();
  if (dir === null) console.log('[fonts] Dota not found; the Dota style falls back to Segoe UI');

  protocol.handle(DOTA_FONT_SCHEME, async (request) => {
    const name = path.posix.basename(new URL(request.url).pathname);
    if (dir === null || !FONT_FILE.test(name)) return new Response(null, { status: 404 });
    try {
      const file = await net.fetch(pathToFileURL(path.join(dir, name)).href);
      // Fonts are fetched in CORS mode, and the page's origin is file: or the
      // dev server — never this scheme.
      return new Response(file.body, {
        status: file.status,
        headers: { 'content-type': 'font/otf', 'access-control-allow-origin': '*' },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}

function findFontDir(): string | null {
  for (const library of steamLibraries()) {
    const dir = path.join(library, 'steamapps', 'common', 'dota 2 beta', 'game', 'dota', 'panorama', 'fonts');
    if (fs.existsSync(path.join(dir, 'radiance-regular.otf'))) return dir;
  }
  return null;
}

/**
 * Every Steam library on the machine, the one holding Dota first.
 *
 * Steam's own install is found through the registry and the default path;
 * the other libraries come out of its `libraryfolders.vdf`, which is small
 * enough that reading the `"path"` lines is the whole parser it needs.
 */
function steamLibraries(): string[] {
  const roots = new Set<string>();
  const registry = steamFromRegistry();
  if (registry) roots.add(path.normalize(registry));
  const x86 = process.env['ProgramFiles(x86)'];
  if (x86) roots.add(path.join(x86, 'Steam'));

  const withDota: string[] = [];
  const others: string[] = [];
  for (const root of roots) {
    others.push(root);
    let vdf: string;
    try {
      vdf = fs.readFileSync(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    } catch {
      continue;
    }
    // One block per library: its path, then the apps installed in it.
    for (const block of vdf.split(/"path"/).slice(1)) {
      const found = /^\s*"((?:[^"\\]|\\.)*)"/.exec(block);
      if (!found) continue;
      const library = path.normalize(found[1]!.replace(/\\\\/g, '\\'));
      (new RegExp(`"${DOTA_APP_ID}"\\s+"`).test(block) ? withDota : others).push(library);
    }
  }
  return [...new Set([...withDota, ...others])];
}

function steamFromRegistry(): string | null {
  if (process.platform !== 'win32') return null;
  try {
    const out = execFileSync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    return /SteamPath\s+REG_SZ\s+(.+)/.exec(out)?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}
