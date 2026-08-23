#!/usr/bin/env bash
#
# Manual deploy. On the server, as the `deploy` user:
#
#   cd /srv/aow5/repo && git pull && infra/deploy.sh
#
# Updating the checkout is deliberately *not* this script's job. A `git reset
# --hard` buried in a deploy script is a foot-gun the one time somebody runs it
# in the wrong directory; instead this refuses to run on a dirty tree and prints
# the commit it is shipping, so what went out is still unambiguous.
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

if [ -z "${AOW5_ALLOW_DIRTY:-}" ] && [ -n "$(git status --porcelain)" ]; then
  die "Working tree is dirty. Commit, stash, or set AOW5_ALLOW_DIRTY=1."
fi

compose() { docker compose --env-file "$ENV_FILE" -f infra/docker-compose.yml "$@"; }

echo "Deploying $(git rev-parse --short HEAD) ($(git rev-parse --abbrev-ref HEAD)) to $SITE_DOMAIN"

# Before the build, not after: a migration is the likeliest thing to go wrong,
# and a snapshot taken afterwards is a snapshot of the damage. Non-fatal,
# because there is nothing to back up until the API ships.
infra/backup.sh || echo "warning: pre-deploy backup did not run" >&2

compose build
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
