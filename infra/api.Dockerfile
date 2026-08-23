# syntax=docker/dockerfile:1
#
# The guides API.
#
# Two stages on the *same* Debian base, deliberately. better-sqlite3 ships a
# prebuilt binding and normally just downloads it, but it falls back to
# compiling from source whenever one is missing for the running ABI — so the
# build stage needs a toolchain. The runtime stage must then be the same distro,
# because that compiled .node is linked against this glibc and would not load on
# Alpine's musl.

FROM node:22-bookworm AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/webapp/package.json apps/webapp/
COPY apps/tracker/package.json apps/tracker/
COPY packages/aow5-shared/package.json packages/aow5-shared/
COPY packages/aow5-api-contract/package.json packages/aow5-api-contract/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter aow5-utils-api...

COPY . .

# Typechecks, bundles, then asserts the bundle only requires things that will
# exist in the runtime stage. That last step is the one that catches a workspace
# package escaping the bundle — a mistake which runs fine in a checkout and
# fails only here. See apps/api/scripts/verify-bundle.ts.
RUN pnpm --filter aow5-utils-api build

# Prunes to production dependencies with their real directories, not symlinks.
RUN pnpm deploy --filter aow5-utils-api --prod /out

# Both workspace packages are compiled *into* dist/main.cjs, so the copies
# pnpm deploy just made are dead weight — and aow5-shared carries ~22 MB of
# icons the API has no use for. Dropping them is worth doing explicitly:
# verify-bundle is what guarantees nothing still reaches for them.
RUN rm -rf /out/node_modules/aow5-shared /out/node_modules/aow5-api-contract

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
# Applied at boot by the migrator, and resolved relative to the working
# directory — which is why this sits beside dist/ rather than inside it.
COPY --from=build /repo/apps/api/drizzle ./drizzle

# The image ships no shell tooling of its own; the database lives on a bind
# mount owned by uid 1000 on the host (see infra/README.md).
USER node

EXPOSE 3000
CMD ["node", "dist/main.cjs"]
