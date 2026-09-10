#!/usr/bin/env bash
#
# Deploy from here to a VPS, in one command, asking for whatever it is missing.
#
#   infra/remote-deploy.sh
#
# `deploy.sh` next to this runs *on the server* and always has: build the two
# images, swap the containers, smoke-test, prune. This is the half that was a
# page of README — the server it goes to, the domain it answers on, the
# certificate, the secrets file, and getting the code there. It exists because
# the site is moving to a different machine and a different domain, and "the
# deploy" should not be a sequence somebody has to remember correctly.
#
# ## It asks, once
#
# Every value it needs is read from `infra/deploy.env`, then from the
# environment, and anything still missing is **asked for** — with a default
# where there is an obvious one — and written back to that file. The second run
# asks nothing. A one-off target needs no edit at all, because the environment
# wins over the file:
#
#   SITE_DOMAIN=staging.example.com infra/remote-deploy.sh
#
# With no terminal attached (CI, a cron) it never prompts: a missing value is an
# error naming the variable, which is the only honest thing a script can do when
# there is nobody to ask.
#
# ## TLS is free, and this is where that is arranged
#
# Caddy asks Let's Encrypt for a certificate for `SITE_DOMAIN` the first time it
# serves it and renews it forever — no certbot, no cron job, no key to rotate.
# What that needs from us is DNS: the ACME challenge arrives over the public
# name, so this checks the record before shipping anything. For a DuckDNS name
# it can do better than check — it updates the record and offers to install the
# refresh timer, which is the whole of "free TLS on a machine with no DNS of
# its own".
#
# ## What it will not do
#
# Nothing here provisions a machine or touches the database. It assumes a user
# who can run `docker`, and it treats `/srv/aow5/data` as somebody else's. See
# infra/README.md for the twenty minutes of first-time server setup.

set -euo pipefail

cd "$(dirname "$0")/.."

CONFIG="${AOW5_DEPLOY_CONFIG:-infra/deploy.env}"
STEPS=6

die() { printf '\nerror: %s\n' "$*" >&2; exit 1; }
say() { printf '\n== %s\n' "$*"; }
step() { printf '\n[%s/%s] %s\n' "$1" "$STEPS" "$2"; }
note() { printf '   %s\n' "$*"; }

interactive() { [ -t 0 ] && [ -t 1 ]; }

# Whitespace around a typed or pasted answer is always an accident: a hostname
# copied out of a control panel arrives with a leading space, and `ssh` then
# rejects " root@host" with a message about invalid characters that names
# neither the space nor the field it came from.
trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

# --- configuration ------------------------------------------------------------

# The file first, the environment second: a value already exported wins, so a
# one-off deploy at another domain is a prefix rather than an edit somebody has
# to remember to undo.
if [ -f "$CONFIG" ]; then
  while IFS= read -r line; do
    case "$line" in ''|\#*) continue ;; esac
    name="${line%%=*}"
    [ -n "${!name:-}" ] || export "${line?}"
  done < "$CONFIG"
fi

CONFIG_DIRTY=0

# Asks for one value and remembers it. Already set — from the file, from the
# environment, from an earlier question — and it asks nothing.
ask() {
  local var="$1" prompt="$2" default="${3:-}" answer=''
  [ -n "${!var:-}" ] && return 0

  interactive || die "$var is not set. Put it in $CONFIG, or export it."

  if [ -n "$default" ]; then
    read -r -p "   $prompt [$default]: " answer
    answer="$(trim "$answer")"
    answer="${answer:-$default}"
  else
    while [ -z "$answer" ]; do
      read -r -p "   $prompt: " answer
      answer="$(trim "$answer")"
    done
  fi

  export "$var=$answer"
  CONFIG_DIRTY=1
}

# The same, for something that must not end up in a file next to the code.
ask_secret() {
  local var="$1" prompt="$2" answer=''
  [ -n "${!var:-}" ] && return 0
  interactive || die "$var is not set. Export it for this run."

  read -r -s -p "   $prompt: " answer
  printf '\n'
  # Trimmed for the same reason, and more so: a token is always pasted, and a
  # trailing space in one is a rejection with no explanation attached.
  export "$var=$(trim "$answer")"
}

yes_no() {
  local prompt="$1" default="${2:-y}" answer='' hint='Y/n'
  [ "$default" = y ] || hint='y/N'
  interactive || { [ "$default" = y ]; return; }

  read -r -p "   $prompt [$hint]: " answer
  answer="${answer:-$default}"
  case "$answer" in [Yy]*) return 0 ;; *) return 1 ;; esac
}

# Only the targeting — a host, a domain, an email, a path. No credential is
# written here: the DuckDNS token and the API keys go into the runtime env file
# on the server, which is `chmod 600` and never leaves it.
save_config() {
  [ "$CONFIG_DIRTY" = 1 ] || return 0
  {
    echo "# Written by infra/remote-deploy.sh. Safe to edit; see deploy.env.example."
    echo "AOW5_SSH=$AOW5_SSH"
    echo "AOW5_SSH_PORT=$SSH_PORT"
    # Written even when blank: that is an answer, and re-asking a question
    # already answered is how a script that "asks once" stops being one.
    echo "AOW5_SSH_KEY=${AOW5_SSH_KEY:-}"
    echo "AOW5_REMOTE_DIR=$REMOTE_DIR"
    echo "AOW5_BUILD=${AOW5_BUILD:-remote}"
    echo "SITE_DOMAIN=$SITE_DOMAIN"
    echo "ACME_EMAIL=$ACME_EMAIL"
    echo "AOW5_DNS=$AOW5_DNS"
    [ -n "${DUCKDNS_SUBDOMAIN:-}" ] && echo "DUCKDNS_SUBDOMAIN=$DUCKDNS_SUBDOMAIN"
  } > "$CONFIG"
  chmod 600 "$CONFIG"
  note "saved to $CONFIG — the next run will not ask"
}

# --- 1. the server ------------------------------------------------------------

step 1 "Where this is going"

ask AOW5_SSH "VPS login, as ssh reaches it (user@host)"
ask AOW5_SSH_PORT "SSH port" "22"
ask AOW5_REMOTE_DIR "Directory on the server for the code, the env file and the database" "/srv/aow5"

SSH_PORT="$AOW5_SSH_PORT"
REMOTE_DIR="$AOW5_REMOTE_DIR"
REMOTE_ENV="$REMOTE_DIR/.env"
REMOTE_REPO="$REMOTE_DIR/repo"

# Which key opens this server.
#
# `ssh` finds one unaided in exactly two cases: it is named `id_ed25519` (or
# `id_rsa`, or `id_ecdsa`) in `~/.ssh`, or `~/.ssh/config` has a `Host` block
# matching what is being connected to. A per-provider key under its own name,
# reached by address because the box is a day old, is neither — and the failure
# mode is a password prompt in the middle of a `tar` pipe, which is not a thing
# anybody can answer. So the key is a configured value, like the host is.
#
# Blank is a real answer and often the right one: it means "whatever ssh would
# have done", which is correct wherever `~/.ssh/config` already answers this.
# Hence `+set` rather than `:-` — a blank saved in the config file is a decision
# already made, not a question still open.
if [ -z "${AOW5_SSH_KEY+set}" ]; then
  if interactive; then
    keys=''
    for candidate in "$HOME"/.ssh/*.pub; do
      [ -f "$candidate" ] && [ -f "${candidate%.pub}" ] || continue
      name="${candidate##*/}"
      keys="${keys:+$keys }${name%.pub}"
    done
    [ -n "$keys" ] && note "keys in ~/.ssh: $keys"
    note "blank is fine — it means whatever ssh already does for this host"
    read -r -p "   SSH key for this server (a ~/.ssh name or a path, blank for none): " answer
    AOW5_SSH_KEY="$(trim "$answer")"
  else
    AOW5_SSH_KEY=''
  fi
  export AOW5_SSH_KEY
  CONFIG_DIRTY=1
fi

# A bare name means `~/.ssh`, because that is where it is and typing the rest of
# the path is one more chance to typo it.
case "$AOW5_SSH_KEY" in
  '' | /* | ./* | ../*) ;;
  '~/'*) AOW5_SSH_KEY="$HOME/${AOW5_SSH_KEY#\~/}" ;;
  *) AOW5_SSH_KEY="$HOME/.ssh/$AOW5_SSH_KEY" ;;
esac
if [ -n "$AOW5_SSH_KEY" ]; then
  [ -f "$AOW5_SSH_KEY" ] || die "No key at $AOW5_SSH_KEY."
  # sshd is not what refuses a world-readable private key — the local ssh is,
  # and it does it by ignoring the key and falling through to a password prompt,
  # which reads as "the server rejected me" and is not that at all.
  case "$(ls -l "$AOW5_SSH_KEY" | cut -c1-10)" in
    -rw-------|-r--------) ;;
    *) die "$AOW5_SSH_KEY is readable by others; ssh will ignore it. chmod 600 it." ;;
  esac
  note "key: $AOW5_SSH_KEY"
fi

# Every ssh in this script goes through this. `IdentitiesOnly` so the named key
# is the only one offered: an agent holding several volunteers them all, and a
# server with `MaxAuthTries 3` hangs up before reaching the one that works.
SSH_OPTS=(-p "$SSH_PORT")
[ -n "$AOW5_SSH_KEY" ] && SSH_OPTS+=(-i "$AOW5_SSH_KEY" -o IdentitiesOnly=yes)

ssh_to() { ssh "${SSH_OPTS[@]}" -o BatchMode=yes "$AOW5_SSH" "$@"; }

# Installs this machine's public key on the server, by whichever route exists.
#
# `ssh-copy-id` is a shell script that ships with OpenSSH on Unix and with Git
# for Windows — and *not* with Windows' own OpenSSH, where the same three
# commands have to be typed by hand. Doing them here is four lines and removes
# the one step of this script that used to end in "install something else
# first".
copy_public_key() {
  local pub=''
  # The configured key first. It is the one every later command offers, so
  # installing any other one only moves the same failure further down.
  [ -n "$AOW5_SSH_KEY" ] && [ -f "$AOW5_SSH_KEY.pub" ] && pub="$AOW5_SSH_KEY.pub"
  if [ -z "$pub" ]; then
    for candidate in ~/.ssh/id_ed25519.pub ~/.ssh/id_ecdsa.pub ~/.ssh/id_rsa.pub; do
      [ -f "$candidate" ] && { pub="$candidate"; break; }
    done
  fi
  [ -n "$pub" ] || die "No public key in ~/.ssh. Make one first: ssh-keygen -t ed25519"

  note "sending $pub — this is the one time it asks for the server's password"
  # Deliberately without SSH_OPTS: this is the path where the key does not work
  # yet, so it has to reach a password prompt rather than insist on the key.
  if command -v ssh-copy-id >/dev/null 2>&1; then
    ssh-copy-id -p "$SSH_PORT" -i "$pub" "$AOW5_SSH"
  else
    # What ssh-copy-id does. The modes matter: sshd refuses a key file anyone
    # else can write.
    ssh -p "$SSH_PORT" "$AOW5_SSH" 'mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys' < "$pub"
  fi
}

if ! ssh_to true 2>/dev/null; then
  note "cannot log in to $AOW5_SSH without a password"
  # Key auth or nothing: this runs `ssh` a dozen times, and a password prompt in
  # the middle of a `tar` pipe is not a thing anybody can answer.
  if interactive && yes_no "Copy your public key over now (asks for the password once)?"; then
    copy_public_key || die "Could not install the key."
    ssh_to true 2>/dev/null || die "Still cannot log in without a password."
  else
    die "Set up key authentication first, then run this again."
  fi
fi
note "ssh ok"

if ! ssh_to 'command -v docker >/dev/null'; then
  note "no docker on the server"
  if interactive && yes_no "Install it there now (curl https://get.docker.com | sudo sh)?"; then
    ssh "${SSH_OPTS[@]}" -t "$AOW5_SSH" 'curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker "$USER"' \
      || die "Docker install failed."
    die "Docker installed. Log out and back in once so the group takes effect, then run this again."
  fi
  die "Install Docker on the server: curl -fsSL https://get.docker.com | sudo sh"
fi
ssh_to 'docker compose version >/dev/null 2>&1' || die "The server's docker has no compose plugin (docker-compose-plugin)."
ssh_to 'docker info >/dev/null 2>&1' || die "The deploy user cannot talk to docker. Add it to the docker group and log in again."
note "docker ok"

# The server's own idea of its public address, which is what an A record has to
# match. Asked of the server rather than parsed out of `AOW5_SSH`: that may be
# an alias from ~/.ssh/config, and a NAT'd box only knows its address by asking
# something outside.
SERVER_IP="$(ssh_to 'curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | cut -d" " -f1')"
note "server address: $SERVER_IP"

# What the box can actually build.
#
# The webapp's Vite + two-pass-terser run over ~25 MB of committed icons peaks
# near 2 GB. A machine under that does not fail *sometimes* — it fails every
# time, ten minutes in, as a killed process and a build log that does not say
# why. Asking costs one round trip and turns that into a question answered
# before anything ships.
SERVER_RAM="$(ssh_to "awk '/^MemTotal|^SwapTotal/ {t += \$2} END {print int(t/1024)}' /proc/meminfo" 2>/dev/null || echo 0)"
note "server memory: ${SERVER_RAM}MB including swap"

# Two answers, checked the same way the DNS question is.
if interactive; then
  note "local  — build both images here and stream them over; the server only swaps them"
  note "remote — build them on the server, which needs ~2 GB of memory free"
fi
build_default=remote
[ "${SERVER_RAM:-0}" -lt 2048 ] && build_default=local
while :; do
  case "${AOW5_BUILD:-}" in
    local|remote) break ;;
    '') ;;
    *)
      interactive || die "AOW5_BUILD must be 'local' or 'remote', not '$AOW5_BUILD'."
      note "'$AOW5_BUILD' is not one of those two"
      unset AOW5_BUILD
      ;;
  esac
  interactive || { AOW5_BUILD="$build_default"; break; }
  ask AOW5_BUILD "local or remote" "$build_default"
done

if [ "$AOW5_BUILD" = remote ] && [ "${SERVER_RAM:-0}" -lt 2048 ]; then
  note "warning: ${SERVER_RAM}MB is under what the webapp build peaks at, and the"
  note "         kernel will kill it rather than slow it down. AOW5_BUILD=local"
  note "         builds here instead and needs nothing of the server."
  interactive && ! yes_no "Build on the server anyway?" n && AOW5_BUILD=local && CONFIG_DIRTY=1
fi

# --- 2. the domain and the certificate ----------------------------------------

step 2 "The domain, and the certificate for it"

# Two answers and only two, checked rather than assumed: anything else here
# used to fall through as "own", and the next thing that happened was the name
# the person had actually typed being asked for again as if it were a domain.
if interactive; then
  note "duckdns — a free name this script claims a record for and keeps pointed here"
  note "own     — a domain whose A record you manage yourself"
fi
while :; do
  case "${AOW5_DNS:-}" in
    own|duckdns) break ;;
    '') ;;
    *)
      interactive || die "AOW5_DNS must be 'own' or 'duckdns', not '$AOW5_DNS'."
      note "'$AOW5_DNS' is not one of those two"
      unset AOW5_DNS
      ;;
  esac
  interactive || { AOW5_DNS=own; break; }
  ask AOW5_DNS "own or duckdns" "own"
done

if [ "$AOW5_DNS" = duckdns ]; then
  ask DUCKDNS_SUBDOMAIN "DuckDNS subdomain (the part before .duckdns.org)"
  if [ -z "${SITE_DOMAIN:-}" ]; then
    SITE_DOMAIN="$DUCKDNS_SUBDOMAIN.duckdns.org"
    export SITE_DOMAIN
    CONFIG_DIRTY=1
  fi

  # The token is a credential: read without echo, sent straight into the
  # server's env file, and never written beside the code.
  ask_secret DUCKDNS_TOKEN "DuckDNS token (from the top of duckdns.org — not echoed)"

  note "pointing $SITE_DOMAIN at $SERVER_IP"
  # An empty `ip=` would make DuckDNS use the source address of the request —
  # this machine, not the server. Hence the explicit address.
  duck="$(curl -fsS --max-time 20 "https://www.duckdns.org/update?domains=$DUCKDNS_SUBDOMAIN&token=$DUCKDNS_TOKEN&ip=$SERVER_IP" || true)"
  [ "$duck" = "OK" ] || die "DuckDNS refused the update (answered '${duck:-nothing}'). Check the subdomain and the token."
  note "duckdns: OK"
else
  ask SITE_DOMAIN "Domain the site answers on (the certificate is issued for exactly this)"
fi

ask ACME_EMAIL "Email for certificate expiry warnings"

if [ -z "${AOW5_SKIP_DNS:-}" ]; then
  # Let's Encrypt allows five failures an hour and the challenge arrives over
  # the public name, so a wrong record is worth one lookup rather than a burnt
  # rate limit and a deploy that looks broken.
  domain_ips="$(getent ahostsv4 "$SITE_DOMAIN" 2>/dev/null | awk '{print $1}' | sort -u || true)"
  if [ -z "$domain_ips" ]; then
    die "$SITE_DOMAIN does not resolve yet. Add an A record for $SERVER_IP (or set AOW5_SKIP_DNS=1)."
  elif ! printf '%s\n' "$domain_ips" | grep -qx "$SERVER_IP"; then
    note "$SITE_DOMAIN resolves to $(printf '%s' "$domain_ips" | tr '\n' ' ')"
    die "That is not $SERVER_IP. Fix the record, or set AOW5_SKIP_DNS=1 and accept a failed certificate."
  fi
  note "$SITE_DOMAIN -> $SERVER_IP"
fi

save_config

# --- 3. the secrets on the server ---------------------------------------------

step 3 "The server's env file"

if ssh_to "test -f '$REMOTE_ENV'"; then
  note "$REMOTE_ENV is already there — keeping it"
else
  LOCAL_ENV="${AOW5_LOCAL_ENV:-infra/.env.production}"
  if [ -f "$LOCAL_ENV" ]; then
    note "sending $LOCAL_ENV"
  else
    interactive || die "No $REMOTE_ENV on the server and no $LOCAL_ENV to send."
    note "the server has none and there is no $LOCAL_ENV — building one now"
    note "every key below is optional; press enter to skip one"

    STEAM_API_KEY="${STEAM_API_KEY-}"
    [ -n "$STEAM_API_KEY" ] || read -r -p "   Steam Web API key (names and avatars; sign-in works without it): " STEAM_API_KEY
    DISCORD_CLIENT_ID="${DISCORD_CLIENT_ID-}"
    [ -n "$DISCORD_CLIENT_ID" ] || read -r -p "   Discord client id (blank for no Discord sign-in): " DISCORD_CLIENT_ID
    [ -z "$DISCORD_CLIENT_ID" ] || ask_secret DISCORD_CLIENT_SECRET "Discord client secret (not echoed)"
    FREESOUND_TOKEN="${FREESOUND_TOKEN-}"
    [ -n "$FREESOUND_TOKEN" ] || read -r -p "   Freesound token (the tracker's sound search): " FREESOUND_TOKEN

    LOCAL_ENV="$(mktemp)"
    # 600 before anything is written into it, and removed on the way out: this
    # is the whole file of secrets, sitting in a temp directory for a moment.
    chmod 600 "$LOCAL_ENV"
    trap 'rm -f "$LOCAL_ENV"' EXIT
    {
      echo "# Written by infra/remote-deploy.sh. See infra/.env.example for what each key is."
      echo "SITE_DOMAIN=$SITE_DOMAIN"
      echo "ACME_EMAIL=$ACME_EMAIL"
      echo "STEAM_API_KEY=$STEAM_API_KEY"
      echo "DISCORD_CLIENT_ID=$DISCORD_CLIENT_ID"
      echo "DISCORD_CLIENT_SECRET=${DISCORD_CLIENT_SECRET:-}"
      echo "FREESOUND_TOKEN=$FREESOUND_TOKEN"
    } > "$LOCAL_ENV"
  fi

  ssh_to "mkdir -p '$REMOTE_DIR' && install -m 600 /dev/null '$REMOTE_ENV'"
  ssh_to "cat > '$REMOTE_ENV'" < "$LOCAL_ENV"
  note "installed as $REMOTE_ENV"
fi

# The keys this deploy is *about*, kept in step with what was just decided. A
# server whose env still names the old host would build the right images and
# then ask for a certificate nobody can validate.
ssh_to "sh -s -- '$REMOTE_ENV' '$SITE_DOMAIN' '$ACME_EMAIL' '${DUCKDNS_SUBDOMAIN:-}' '${DUCKDNS_TOKEN:-}'" <<'REMOTE'
set -eu
env_file=$1
domain=$2
email=$3
duck_sub=$4
duck_token=$5

tmp=$(mktemp)
chmod 600 "$tmp"
{
  grep -v -E '^(SITE_DOMAIN|ACME_EMAIL|DUCKDNS_SUBDOMAIN|DUCKDNS_TOKEN)=' "$env_file" || true
  echo "SITE_DOMAIN=$domain"
  echo "ACME_EMAIL=$email"
  # Only when this deploy is the DuckDNS kind. An empty pair written blindly
  # would disable the refresh timer on a server that was relying on it, so the
  # existing lines are carried through instead.
  if [ -n "$duck_sub" ]; then
    echo "DUCKDNS_SUBDOMAIN=$duck_sub"
    echo "DUCKDNS_TOKEN=$duck_token"
  else
    grep -E '^DUCKDNS_(SUBDOMAIN|TOKEN)=' "$env_file" || true
  fi
} > "$tmp"

# Written through the existing file rather than moved over it, so the mode and
# the ownership stay the ones already there.
cat "$tmp" > "$env_file"
rm -f "$tmp"
chmod 600 "$env_file"
REMOTE
note "SITE_DOMAIN and ACME_EMAIL set"

# --- 4. is it worth deploying -------------------------------------------------

step 4 "Checking the build here, before the server builds it"

# The images are built on the VPS, so a type error or a failing test costs a
# five-minute round trip to discover there. The same compiler over the same
# lockfile runs here in one.
if [ -n "${AOW5_SKIP_CHECKS:-}" ]; then
  note "skipped (AOW5_SKIP_CHECKS)"
elif interactive && ! yes_no "Run check-types, tests and build first?"; then
  note "skipped"
else
  pnpm check-types
  pnpm test
  pnpm build
  note "green"
fi

# --- 5. the code --------------------------------------------------------------

step 5 "Shipping the tree"

if [ -z "${AOW5_ALLOW_DIRTY:-}" ] && [ -n "$(git status --porcelain)" ]; then
  if interactive && yes_no "The working tree is dirty. Ship it as it is?" n; then
    AOW5_ALLOW_DIRTY=1
  else
    die "Commit or stash first (or set AOW5_ALLOW_DIRTY=1)."
  fi
fi

VERSION="$(git rev-parse --short HEAD) ($(git rev-parse --abbrev-ref HEAD))${AOW5_ALLOW_DIRTY:+ + local changes}"
note "$VERSION -> $REMOTE_REPO"

ssh_to "mkdir -p '$REMOTE_REPO' '$REMOTE_DIR/data'"

# The API runs as uid 1000 (`node`) and the database is a bind mount, so the
# host directory must be writable by uid 1000. A deploy user who *is* uid 1000
# gets that by making the directory; a root deploy makes a root-owned one, and
# what happens next is the API starting, failing to open the database, and
# restarting forever. Only while it is still empty — an existing database has an
# owner already, and changing that is not this script's call.
ssh_to "
  set -eu
  d='$REMOTE_DIR/data'
  if [ -z \"\$(ls -A \"\$d\")\" ] && [ \"\$(stat -c %u \"\$d\")\" != 1000 ]; then
    chown 1000:1000 \"\$d\" 2>/dev/null || sudo -n chown 1000:1000 \"\$d\" 2>/dev/null || {
      echo \"   warning: \$d is owned by uid \$(stat -c %u \"\$d\") and the API runs as 1000\" >&2
      echo \"   fix it with: sudo chown 1000:1000 \$d\" >&2
    }
  fi
"

# `git archive` rather than rsync: it ships exactly what is committed, needs
# nothing installed on the far end, and cannot carry `node_modules`, a local
# `.env` or a stray database along by accident.
#
# With AOW5_ALLOW_DIRTY the working tree goes instead — tracked files plus
# whatever is untracked and not ignored, which is the only time an untracked
# file is part of the work. Files git still lists but the tree no longer has are
# filtered out: one deletion in progress must not take the whole deploy with it.
if [ -n "${AOW5_ALLOW_DIRTY:-}" ]; then
  git ls-files -z --cached --others --exclude-standard \
    | while IFS= read -r -d '' file; do [ -e "$file" ] && printf '%s\0' "$file"; done \
    | tar --null --files-from=- -czf -
else
  git archive --format=tar HEAD | gzip
fi | ssh_to "tar -xzf - -C '$REMOTE_REPO'"

# What the server reports it is running, for a tree that did not arrive as a
# checkout it can `git log`.
ssh_to "printf '%s\n' '$VERSION' > '$REMOTE_REPO/.deployed-version'"
note "sent"

# The two timers, once each. Both read the env file installed above, so they are
# only worth offering after it exists — and the DuckDNS one only where there is
# a DuckDNS name to refresh.
if ssh_to 'command -v systemctl >/dev/null 2>&1'; then
  if [ -n "${DUCKDNS_SUBDOMAIN:-}" ] && ! ssh_to 'systemctl is-enabled duckdns.timer >/dev/null 2>&1'; then
    if interactive && yes_no "Install the DuckDNS refresh timer on the server (needs sudo)?"; then
      if ssh "${SSH_OPTS[@]}" -t "$AOW5_SSH" "sudo cp '$REMOTE_REPO'/infra/systemd/duckdns.* /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now duckdns.timer"; then
        note "duckdns.timer installed"
      else
        note "the timer did not install — the site still works, the record just is not refreshed"
      fi
    fi
  fi
  if ! ssh_to 'systemctl is-enabled aow5-backup.timer >/dev/null 2>&1'; then
    if interactive && yes_no "Install the nightly database backup timer (needs sudo)?"; then
      if ssh "${SSH_OPTS[@]}" -t "$AOW5_SSH" "sudo cp '$REMOTE_REPO'/infra/systemd/aow5-backup.* /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now aow5-backup.timer"; then
        note "aow5-backup.timer installed"
      else
        note "the timer did not install — deploys still take their own pre-deploy snapshot"
      fi
    fi
  fi
fi

# --- 6. build and swap on the server ------------------------------------------

step 6 "Building the images and swapping the containers"

# Builds both images here and streams them to the server's image store, so the
# server never runs a build stage at all. This is what makes a 1 GB VPS a
# perfectly good host: the *runtime* images are Caddy plus a `dist/`, and node
# plus a bundle — a few hundred megabytes between them and well under 300 MB of
# memory to run. It is only the build that wants 2 GB, and the build is here.
ship_images() {
  command -v docker >/dev/null 2>&1 \
    || die "AOW5_BUILD=local needs Docker on *this* machine. Install it, or set AOW5_BUILD=remote."
  docker buildx version >/dev/null 2>&1 \
    || die "AOW5_BUILD=local needs buildx (Docker Desktop ships it; otherwise docker-buildx-plugin)."
  docker info >/dev/null 2>&1 || die "Docker is installed here but not running."

  # The platform is named rather than inherited, because the machine this runs
  # on is quite likely an arm64 Mac and the server is not. An arm64 image does
  # not fail on load — it fails at `docker run`, after the swap, with `exec
  # format error`. Naming it costs emulation time and buys a deploy that either
  # works or stops before touching anything.
  note "building for linux/amd64 — emulated, and slow the first time"
  #
  # `--provenance=false --sbom=false` because buildx otherwise attaches an
  # attestation, which turns a one-platform build into a manifest *list*. That
  # is fine in a registry and needless indirection through `docker save |
  # docker load`, which is the only way these images travel.
  for image in webapp api; do
    docker buildx build --platform linux/amd64 --load \
      --provenance=false --sbom=false \
      -f "infra/$image.Dockerfile" -t "aow5-utils-$image:latest" . \
      || die "The $image image did not build."
  done

  # Streamed, not staged: the tar is a few hundred megabytes and has no reason
  # to touch either disk. `docker load` reads gzip directly, so the compression
  # is free to add — and worth it, because these layers are mostly node_modules.
  note "sending both images to $AOW5_SSH"
  local pipe='gzip -1'
  # A silent several-minute transfer is indistinguishable from a hung one.
  command -v pv >/dev/null 2>&1 && pipe='pv -p -t -r -b | gzip -1'
  docker save aow5-utils-webapp:latest aow5-utils-api:latest \
    | eval "$pipe" \
    | ssh_to 'docker load' \
    || die "Sending the images failed."
}

# `-t` so the output arrives as it happens rather than in one lump at the end —
# watching it is the point.
run_deploy() {
  ssh "${SSH_OPTS[@]}" -t "$AOW5_SSH" \
    "cd '$REMOTE_REPO' && AOW5_ENV_FILE='$REMOTE_ENV' $* ${AOW5_ALLOW_DIRTY:+AOW5_ALLOW_DIRTY=1} infra/deploy.sh"
}

if [ "$AOW5_BUILD" = local ]; then
  ship_images
  note "swapping the containers, then a health check"
  run_deploy AOW5_SKIP_BUILD=1
else
  note "the slow part: two image builds on the VPS, then a health check"
  run_deploy
fi

say "Live at https://$SITE_DOMAIN"
if [ "${AOW5_DNS:-own}" != duckdns ]; then
  note "if Steam or Discord sign-in is configured, their redirect URLs must name this domain"
fi
