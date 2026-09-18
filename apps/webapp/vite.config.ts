import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/**
 * The extracted data and icons are the shared package's, not the app's.
 *
 * They are served at / verbatim — fetched at runtime, never imported — so the
 * package's public/ directory *is* this app's publicDir. Resolved through the
 * exports map rather than a ../../ path so the workspace can be rearranged
 * without breaking the build.
 */
const sharedPublicDir = path.join(path.dirname(require.resolve('aow5-shared/package.json')), 'public');

/**
 * A version for the data files, so a deploy that changes them is fetched fresh.
 *
 * `/data/*` is cached for an hour under one URL while the bundle that reads it
 * is content-hashed — so new code could run against old data until the cache
 * expired. This hashes `meta.json`, which carries every table's hash and the
 * time the data was generated, and `loadData` puts it on each data URL. Same
 * data, same URL, and the hour of caching still applies between deploys.
 */
const dataVersion = crypto
  .createHash('sha256')
  .update(fs.readFileSync(path.join(sharedPublicDir, 'data', 'meta.json')))
  .digest('hex')
  .slice(0, 12);

/**
 * The two files a static host needs and a bundler does not produce.
 *
 * `404.html` is what makes path routing work on GitHub Pages. The site has
 * three real paths and only one real file; a request for `/builder` would
 * otherwise 404 with GitHub's own page instead of booting the app. Serving a
 * copy of `index.html` as the not-found page hands those requests to the
 * router, and — unlike the redirect trick that bounces through a query string
 * — it leaves the URL untouched, which matters here because a planner link
 * carries the whole board in its fragment.
 *
 * `.nojekyll` cannot live in `public/`, because `public/` belongs to the
 * shared package rather than to this app.
 */
function staticHostFiles(): Plugin {
  return {
    name: 'aow5-static-host-files',
    apply: 'build',
    closeBundle() {
      const out = path.join(root, 'dist');
      fs.copyFileSync(path.join(out, 'index.html'), path.join(out, '404.html'));
      fs.writeFileSync(path.join(out, '.nojekyll'), '');
    },
  };
}

/**
 * The CSP hashes for the two inline scripts in `index.html`, checked against the
 * policy that will be in front of them.
 *
 * Both scripts have to be inline — they decide the theme and the skeleton's
 * shape before the first paint, and an external file is a round trip before that
 * paint, which is the entire thing they exist to avoid. `script-src 'self'`
 * blocks an inline script outright, whatever origin it came from, so the policy
 * in `infra/Caddyfile` names each one by SHA-256.
 *
 * A hash that is out of date is indistinguishable from a missing one: the
 * browser blocks the script, the page paints the wrong theme or no skeleton at
 * all, and nothing in the build says so. So this **fails the build** rather than
 * warning — the image the deploy script builds cannot ship a script the server
 * in front of it will refuse to run — and prints the line to paste.
 *
 * Only for a root-base build. `VITE_BASE=/sub/` is the GitHub Pages build, whose
 * boot script hashes differently because `%BASE_URL%` is substituted into it, and
 * which has no Caddy and no policy in front of it.
 */
function cspScriptHashes(): Plugin {
  return {
    name: 'aow5-csp-script-hashes',
    apply: 'build',
    closeBundle() {
      if ((process.env.VITE_BASE ?? '/') !== '/') return;

      const html = fs.readFileSync(path.join(root, 'dist', 'index.html'), 'utf8');
      // Inline only: a `<script src=…>` is covered by `'self'` and has no body
      // to hash.
      const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
      const hashes = inline.map((body) => `'sha256-${crypto.createHash('sha256').update(body, 'utf8').digest('base64')}'`);

      const caddyfile = path.join(root, '..', '..', 'infra', 'Caddyfile');
      const policy = fs.readFileSync(caddyfile, 'utf8');
      const missing = hashes.filter((hash) => !policy.includes(hash));
      if (missing.length === 0) return;

      throw new Error(
        [
          `infra/Caddyfile does not allow ${missing.length} of this build's ${hashes.length} inline scripts.`,
          'Content-Security-Policy blocks an inline script it has no hash for, so the theme snippet or the',
          'boot skeleton would silently not run in production. Put these in `script-src`:',
          '',
          `  script-src 'self' ${hashes.join(' ')}`,
          '',
        ].join('\n'),
      );
    },
  };
}

// `base` only needs setting if the site is served from a subpath rather than
// a domain root — which GitHub Pages for a project repo is. The router reads
// the same value, so the routes move with it.
// Build with: VITE_BASE=/dota-aow5-utils/ pnpm build
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  define: {
    'import.meta.env.VITE_AOW5_DATA_VERSION': JSON.stringify(dataVersion),
  },
  /**
   * The API, on this origin.
   *
   * In production Caddy serves this bundle and proxies /api to the server, so
   * the site and the API share an origin — which is what lets the session be a
   * plain first-party cookie with no CORS and no CSRF token. Development has to
   * reproduce that, or a cookie set in dev would behave nothing like the one in
   * production. Run the API alongside with `pnpm --filter aow5-utils-api dev`.
   */
  server: {
    proxy: {
      '/api': { target: process.env.VITE_API_TARGET ?? 'http://127.0.0.1:3000', changeOrigin: false },
    },
  },
  plugins: [react(), staticHostFiles(), cspScriptHashes()],
  publicDir: sharedPublicDir,
  resolve: {
    alias: { '@': path.resolve(root, 'src') },
  },
  build: {
    outDir: 'dist',
    // No source maps in production: the bundle is the deliverable, and maps
    // would ship the whole readable source alongside it.
    sourcemap: false,
    target: 'es2022',
    // esbuild is Vite's default and is much faster, but terser squeezes out
    // meaningfully more here and this build runs once per deploy.
    minify: 'terser',
    terserOptions: {
      compress: {
        // The app surfaces failures in the UI (error alerts, toasts) rather
        // than the console, so dropping these costs no diagnostics.
        drop_console: true,
        drop_debugger: true,
        passes: 2,
      },
      format: { comments: false },
    },
    // Warn only for genuinely large chunks; React alone clears the 500 kB default.
    chunkSizeWarningLimit: 250,
    rollupOptions: {
      output: {
        /**
         * Split the dependencies that change far less often than the app, so
         * returning visitors keep them cached across deploys.
         *
         * Matched on the resolved module path rather than a package-name list:
         * `react-dom/client` and `scheduler` never match a bare 'react-dom'
         * entry, which quietly left most of React in the app chunk.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules[\/](react|react-dom|scheduler)[\/]/.test(id)) return 'react';
          // React is the only dependency left. The UI kit, the icons and the
          // class-name helper are all first-party now, so there is no second
          // vendor chunk to split out.
          return undefined;
        },
      },
    },
  },
});
