import { createRequire } from 'node:module';
import { defineConfig } from 'tsup';

const pkg = createRequire(import.meta.url)('./package.json') as { version: string };

/**
 * One file out, with the workspace packages inside it.
 *
 * The API imports `aow5-shared/codec` so that the decoder validating a
 * submitted board is the same one the planner renders it with. Both workspace
 * packages are shipped as raw TypeScript — that is their whole design, and
 * nothing about it changes here — so something has to compile them, and that
 * something is `noExternal` below.
 *
 * Why it cannot be left to Node: `pnpm deploy --prod` materialises workspace
 * dependencies into the image as real directories under `node_modules`, and
 * Node's type stripping deliberately does not apply there. A build that
 * externalised them would produce an image that dies on its first import.
 *
 * Why that is invisible in development: in the checkout, pnpm links those
 * packages as symlinks and Node resolves them to their real path under
 * `packages/`, which is *not* under node_modules — so the same externalised
 * bundle runs perfectly on this machine and only fails once deployed. Which is
 * precisely why this is pinned by a build assertion (`pnpm verify-bundle`)
 * rather than by having run it once.
 *
 * The tracker made the same call for the same shape of reason — see the
 * `externalizeDepsPlugin` exclusion in its electron.vite.config.ts.
 */
export default defineConfig({
  entry: ['src/main.ts'],
  outDir: 'dist',
  // CJS, and named .cjs so the extension says so regardless of what
  // package.json's "type" is. Nest's ESM support still has sharp edges around
  // reflect-metadata and its optional-dependency probing, and none of that is
  // worth re-litigating on a server nobody imports from.
  format: ['cjs'],
  target: 'node22',
  platform: 'node',
  sourcemap: true,
  clean: true,
  // esbuild alone cannot emit decorator metadata — it has no type checker, and
  // `design:paramtypes` is type information. tsup routes decorated files
  // through SWC when it sees emitDecoratorMetadata in the tsconfig, and SWC
  // can. That is the entire reason @swc/core is a dependency.
  tsconfig: './tsconfig.json',
  // Substituted into src/version.ts, so /api/health can say what is deployed
  // without the bundle having to read a package.json that is not shipped.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // Compiled into the bundle rather than required at runtime. See above.
  noExternal: ['aow5-shared', 'aow5-api-contract'],
  external: [
    // Native: it has to stay a real file on disk next to the bundle.
    'better-sqlite3',
    // Nest `require`s these inside try/catch to discover optional features it
    // was not asked for. Left in the bundle they resolve to nothing and fail
    // the build; listed here they stay a runtime require that never runs.
    '@nestjs/microservices',
    '@nestjs/websockets',
    '@nestjs/platform-socket.io',
    'cache-manager',
    'class-transformer',
    'class-transformer/storage',
    'class-validator',
    '@fastify/static',
    '@fastify/view',
  ],
});
