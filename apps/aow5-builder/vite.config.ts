import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

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

// `base` only needs setting if the site is served from a subpath rather than
// a domain root. Build with: VITE_BASE=/aow5-builder/ pnpm build
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss()],
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
          if (id.includes('radix-ui') || id.includes('@floating-ui')) return 'radix';
          return undefined;
        },
      },
    },
  },
});
