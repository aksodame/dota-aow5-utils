# syntax=docker/dockerfile:1
#
# The site, baked into its own Caddy image.
#
# Baked rather than mounted as a volume, deliberately: a build container writing
# into a directory a running Caddy is serving leaves a window where index.html is
# new and the fingerprinted assets it names are not there yet. An image swap has
# no such window — the container starts with a complete filesystem or not at all,
# and a rollback is repinning a tag.

FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /repo

# Manifests first. This is the layer that makes the install cacheable across
# every change that is not a dependency change — which is nearly all of them.
#
# .npmrc comes along because virtual-store-dir-max-length applies here too. It
# is a Windows MAX_PATH workaround and irrelevant on Linux, but a silent
# divergence between what CI resolves and what the image resolves is not worth
# the saved line.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/webapp/package.json apps/webapp/
COPY apps/tracker/package.json apps/tracker/
COPY packages/aow5-shared/package.json packages/aow5-shared/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter aow5-utils-webapp...

COPY . .

# No VITE_BASE. The VPS serves from the domain root, so Vite's default base of
# `/` is correct; a subpath build is `VITE_BASE=/sub/ pnpm build` and is not
# something this image has any reason to do. `build` runs `tsc --noEmit` first,
# so a type error fails here rather than shipping.
RUN pnpm --filter aow5-utils-webapp build

# Pinned to the major only: a Caddy 2.x bump is routine, a Caddy 3 would be a
# decision. Same reasoning as the node tag above.
FROM caddy:2-alpine

COPY --from=build /repo/apps/webapp/dist /srv/www
COPY infra/Caddyfile /etc/caddy/Caddyfile
