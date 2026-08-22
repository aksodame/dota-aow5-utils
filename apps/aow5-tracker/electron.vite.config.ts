import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * electron-vite defaults `minify` to false for every bundle — main, preload
 * and renderer alike — and it does so in production too, which is where it
 * parts company with plain Vite. Left at the default, `pnpm release` packs the
 * entire readable source, explanatory comments and all, into the asar, and an
 * asar is not an archive format: `npx asar extract` opens it.
 *
 * esbuild rather than terser: it is already in the toolchain, so it costs no
 * new dependency, and for a bundle that is downloaded once and read from disk
 * the last few percent terser would squeeze out do not pay for the build time.
 * (The webapp makes the opposite call for the opposite reason — it ships over
 * the wire on every visit.)
 *
 * Both minifiers leave *property* names alone by default, which is what the
 * item and room tables rely on when they read `.name` off the extracted data.
 * Only locals get mangled, and nothing here reaches for `constructor.name`.
 */
const minify = 'esbuild' as const;

/**
 * Three bundles: main (Node), preload (isolated), renderer (browser).
 *
 * `core/` is shared by all three, so it is deliberately free of any Electron
 * import — only `core/sources/console.ts` touches `node:fs`, and only main
 * imports that one. Each bundle also type-checks under its own tsconfig, which
 * is what keeps the three environments honest: `document` does not exist in
 * main, and `node:fs` does not exist in the renderer.
 *
 * The renderer bundles the extracted item tables straight out of `aow5-shared`.
 * They are resolved through the package's exports map rather than a `../../`
 * path, so the workspace can be rearranged without breaking the build.
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { minify, rollupOptions: { input: path.join(root, 'electron/main.ts') } },
    resolve: { alias: { '@core': path.join(root, 'core') } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { minify, rollupOptions: { input: path.join(root, 'electron/preload.ts') } },
    resolve: { alias: { '@core': path.join(root, 'core') } },
  },
  renderer: {
    root: path.join(root, 'src'),
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.join(root, 'src'),
        '@core': path.join(root, 'core'),
      },
    },
    build: {
      minify,
      outDir: path.join(root, 'out/renderer'),
      rollupOptions: { input: path.join(root, 'src/index.html') },
    },
  },
});
