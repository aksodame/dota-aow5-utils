#!/usr/bin/env bash
#
# The deploy, as it runs **on the server**. Two ways to reach it:
#
#   infra/remote-deploy.sh                     from your machine, over SSH
#   cd /srv/aow5/repo && git pull && infra/deploy.sh    on the box, by hand
#
# Updating the code is deliberately *not* this script's job. A `git reset
# --hard` buried in a deploy script is a foot-gun the one time somebody runs it
# in the wrong directory; instead this refuses to run on a dirty checkout and
# prints what it is shipping, so what went out is unambiguous either way.
#
# A tree that arrived over SSH is not a checkout — `remote-deploy.sh` ships an
# archive, so there is no `.git` to ask. It leaves `.deployed-version` behind
# instead, and that is what gets printed.
#
# Set AOW5_ALLOW_DIRTY=1 to deploy uncommitted work anyway — useful when you are
# bisecting a production-only problem, and noisy enough that you will not do it
# by accident.

set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE="${AOW5_ENV_FILE:-/srv/aow5/.env}"

die() { printf '%s\n' "$*" >&2; exit 1; }

[ -f "$ENV_FILE" ] || die "No env file at $ENV_FILE. Copy infra/.env.example there and fill it in."

# Read SITE_DOMAIN for the smoke test below. `set -a` exports what the file
# defines; the subshell keeps the rest of it out of this script's environment.
SITE_DOMAIN="$(set -a; . "$ENV_FILE"; printf '%s' "${SITE_DOMAIN:-}")"
[ -n "$SITE_DOMAIN" ] || die "SITE_DOMAIN is not set in $ENV_FILE."

# What is being shipped, from whichever of the two sources is here.
if git rev-parse --git-dir >/dev/null 2>&1; then
  if [ -z "${AOW5_ALLOW_DIRTY:-}" ] && [ -n "$(git status --porcelain)" ]; then
    die "Working tree is dirty. Commit, stash, or set AOW5_ALLOW_DIRTY=1."
  fi
  VERSION="$(git rev-parse --short HEAD) ($(git rev-parse --abbrev-ref HEAD))"
elif [ -f .deployed-version ]; then
  VERSION="$(cat .deployed-version)"
else
  VERSION="an unlabelled tree"
fi

compose() { docker compose --env-file "$ENV_FILE" -f infra/docker-compose.yml "$@"; }

echo "Deploying $VERSION to $SITE_DOMAIN"

# Before the build, not after: a migration is the likeliest thing to go wrong,
# and a snapshot taken afterwards is a snapshot of the damage. Non-fatal,
# because there is nothing to back up until the API ships.
infra/backup.sh || echo "warning: pre-deploy backup did not run" >&2

# AOW5_SKIP_BUILD is set by `remote-deploy.sh` when it built the images on the
# operator's machine and streamed them here — the reason a 1 GB VPS can host
# this at all, since only the *build* wants 2 GB and the build happened
# elsewhere.
#
# Checked rather than trusted: `compose up` silently builds an image it cannot
# find, which on a box this size is the OOM this flag exists to avoid, reached
# by the one path nobody is watching for it.
if [ -n "${AOW5_SKIP_BUILD:-}" ]; then
  for image in aow5-utils-webapp:latest aow5-utils-api:latest; do
    docker image inspect "$image" >/dev/null 2>&1 \
      || die "AOW5_SKIP_BUILD is set but $image is not here. Deploy with infra/remote-deploy.sh, or unset it to build."
  done
  echo "Using the images already loaded here"
else
  compose build
fi
compose up -d --remove-orphans

# Caddy has to obtain or load a certificate before it serves anything, so the
# first deploy on a fresh machine is the slow one.
#
# /api/health rather than / because it exercises the whole stack — Caddy's TLS,
# its proxy to the API, and an API that got far enough to apply its migrations.
# A static file being served proves much less.
echo -n "Waiting for https://$SITE_DOMAIN/api/health "
for _ in $(seq 1 45); do
  if curl -fsS --max-time 5 "https://$SITE_DOMAIN/api/health" >/dev/null 2>&1; then
    echo "- healthy"
    docker image prune -f >/dev/null
    exit 0
  fi
  echo -n "."
  sleep 2
done

echo " - still failing after 90s. Last 100 lines:" >&2
compose logs --tail=100 web >&2
exit 1
