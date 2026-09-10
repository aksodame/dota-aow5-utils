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
# pnpm deploy just made are dead weight. Dropping them is worth doing
# explicitly: verify-bundle is what guarantees nothing still reaches for them.
#
# The icons that used to be dropped along with them are now copied back in
# below, under ./assets. They stopped being "art the API has no use for" when
# the social-card renderer started composing hero portraits and item tiles
# server-side — see apps/api/core/seo/card.ts. What is copied is the picture
# tree only, not the package.
RUN rm -rf /out/node_modules/aow5-shared /out/node_modules/aow5-api-contract

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Fonts, for the social-card renderer.
#
# resvg rasterizes text with whatever is in the system font database, and this
# image would otherwise have nothing at all in it — every card would come out as
# a row of empty boxes, in production and nowhere else, because a developer's
# machine always has fonts.
#
# `fonts-noto-cjk` is the whole answer on its own and is the reason for the
# ~55 MB: the family carries Latin, Cyrillic *and* Simplified Chinese, which is
# all three languages the site speaks in one fallback. It has to, because a build
# title is written by its author — a Chinese title can turn up on a card rendered
# for an English reader at any time. DejaVu is a small insurance policy behind it
# for anything Noto's coverage misses.
RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-noto-cjk fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist

# The pictures a card is composed from, at the path `ASSETS_DIR` defaults to in
# production. Only the icon tree: the JSON beside it in the shared package is
# either bundled into main.cjs already or not needed here at all, and
# items.full.json alone is 1.3 MB of text nothing on a card reads.
COPY --from=build /repo/packages/aow5-shared/public/icons ./assets/icons

# The site's wordmark, which is the webapp's rather than the shared package's —
# it is branding, not extracted game data, and it lives with the component that
# draws it everywhere else. Its own directory because `BRAND_DIR` is its own
# setting, for exactly that reason. See apps/api/src/config.ts.
COPY --from=build /repo/apps/webapp/src/assets/logotype.png ./assets-brand/logotype.png
# Applied at boot by the migrator, and resolved relative to the working
# directory — which is why this sits beside dist/ rather than inside it.
COPY --from=build /repo/apps/api/drizzle ./drizzle

# The image ships no shell tooling of its own; the database lives on a bind
# mount owned by uid 1000 on the host (see infra/README.md).
USER node

EXPOSE 3000
CMD ["node", "dist/main.cjs"]
