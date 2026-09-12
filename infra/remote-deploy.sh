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
# **One question is asked every run and never remembered**: whether to keep the
# env file already on the server or rewrite it. See step 3 for why that one
# cannot be an answer on file.
#
# ## Credentials are the same deal, one passphrase down
#
# `deploy.env` holds targeting and nothing else. A secret it is asked for — the
# DuckDNS token, a Discord client secret — goes into `infra/deploy.secrets.enc`
# instead: the same `KEY=value` lines, AES-256 under one passphrase, via the
# openssl that is already on the machine. So a redeploy asks for the passphrase
# rather than for the token, and for neither when AOW5_DEPLOY_PASSPHRASE is
# exported. Nothing is asked at all on a deploy that needs no secret.
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
SECRETS="${AOW5_DEPLOY_SECRETS:-infra/deploy.secrets.enc}"
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

# --- the secret store ---------------------------------------------------------
#
# `deploy.env` is targeting — a host, a domain, an email, a path — and its own
# header promises it holds nothing else. Credentials still have to live
# somewhere, though: re-typing the DuckDNS token on every redeploy is how a
# token ends up in shell history, or on a sticky note, or pasted into the wrong
# window. So they go here instead, as the same `KEY=value` lines, encrypted
# under one passphrase.
#
# openssl rather than gpg, `security`, or a hosted vault: it is already on every
# machine that can run this script, it is the same flags on macOS and on Linux,
# it is open source and auditable by anyone who cares to, and the file it writes
# can be opened by hand with a command short enough to sit in this comment —
# which matters on the day the person holding the passphrase is not the person
# holding the laptop:
#
#   openssl enc -d -aes-256-cbc -pbkdf2 -in infra/deploy.secrets.enc
#
# `-pbkdf2` is not decoration. Without it openssl derives the key with a single
# pass of MD5, which is not key derivation so much as an impression of one, and
# a passphrase a person can remember would not survive it.
SECRETS_LOADED=0
SECRETS_DIRTY=0
SECRETS_PASS=''
SECRETS_KEYS=''

have_openssl() {
  command -v openssl >/dev/null 2>&1 \
    || die "openssl is not on PATH, and $SECRETS is written with it."
}

# Every passphrase goes to openssl through the environment, never as an
# argument: `-pass pass:hunter2` is visible in `ps` to every user on the
# machine for as long as the command runs.
secrets_keys_add() {
  case " $SECRETS_KEYS " in
    *" $1 "*) ;;
    *) SECRETS_KEYS="${SECRETS_KEYS:+$SECRETS_KEYS }$1" ;;
  esac
}

# Read once, and only when something actually asks for a secret — a deploy to a
# domain you own never needs one, and is never asked for a passphrase.
unlock_secrets() {
  [ "$SECRETS_LOADED" = 1 ] && return 0
  SECRETS_LOADED=1
  [ -f "$SECRETS" ] || return 0
  have_openssl

  local plain='' attempts=0 line name
  while :; do
    if [ -n "${AOW5_DEPLOY_PASSPHRASE:-}" ]; then
      SECRETS_PASS="$AOW5_DEPLOY_PASSPHRASE"
    else
      interactive || die "$SECRETS is encrypted. Export AOW5_DEPLOY_PASSPHRASE for this run."
      read -r -s -p "   Passphrase for $SECRETS: " SECRETS_PASS
      printf '\n'
    fi

    if plain="$(AOW5_PASS="$SECRETS_PASS" openssl enc -d -aes-256-cbc -pbkdf2 \
                  -in "$SECRETS" -pass env:AOW5_PASS 2>/dev/null)"; then
      break
    fi

    SECRETS_PASS=''
    [ -n "${AOW5_DEPLOY_PASSPHRASE:-}" ] && die "AOW5_DEPLOY_PASSPHRASE does not open $SECRETS."
    attempts=$((attempts + 1))
    [ "$attempts" -ge 3 ] && die "Three wrong passphrases. Delete $SECRETS to start the store over."
    note "that did not open it — $((3 - attempts)) more"
  done

  # Process substitution rather than a here-string: a here-string is a temp file
  # under most shells, and the whole file of decrypted secrets is the one thing
  # that should not touch the disk on the way past.
  #
  # Same precedence as deploy.env — an exported value wins, so a one-off token
  # is a prefix on the command line and leaves the store untouched.
  while IFS= read -r line; do
    case "$line" in ''|\#*) continue ;; esac
    name="${line%%=*}"
    secrets_keys_add "$name"
    [ -n "${!name:-}" ] || export "${line?}"
  done < <(printf '%s\n' "$plain")
}

# Written through a temp file: `-out` truncates before openssl has encrypted
# anything, so a failure half-way would otherwise leave an empty store where a
# working one used to be.
save_secrets() {
  [ "$SECRETS_DIRTY" = 1 ] || return 0
  have_openssl

  if [ -z "$SECRETS_PASS" ]; then
    if [ -n "${AOW5_DEPLOY_PASSPHRASE:-}" ]; then
      SECRETS_PASS="$AOW5_DEPLOY_PASSPHRASE"
    else
      interactive || die "Nothing to encrypt $SECRETS with. Export AOW5_DEPLOY_PASSPHRASE."
      note "one passphrase opens the store from now on — losing it costs the tokens, nothing else"
      local again=''
      while :; do
        read -r -s -p "   New passphrase for $SECRETS: " SECRETS_PASS
        printf '\n'
        [ -n "$SECRETS_PASS" ] || { note "an empty passphrase is not one"; continue; }
        read -r -s -p "   And again: " again
        printf '\n'
        [ "$SECRETS_PASS" = "$again" ] && break
        note "those two do not match"
      done
    fi
  fi

  local key
  (
    umask 077
    {
      echo "# Written by infra/remote-deploy.sh."
      echo "# openssl enc -d -aes-256-cbc -pbkdf2 -in $SECRETS"
      for key in $SECRETS_KEYS; do
        printf '%s=%s\n' "$key" "${!key:-}"
      done
    } | AOW5_PASS="$SECRETS_PASS" openssl enc -aes-256-cbc -pbkdf2 -salt \
          -out "$SECRETS.new" -pass env:AOW5_PASS
  ) || { rm -f "$SECRETS.new"; die "Could not write $SECRETS."; }

  mv -f "$SECRETS.new" "$SECRETS"
  chmod 600 "$SECRETS"
  SECRETS_DIRTY=0
  note "saved to $SECRETS — encrypted, and the next run will not ask"
}

# The same as `ask`, for something that must not end up in plain text next to
# the code. The store is consulted before the question, which is the whole
# point: a redeploy should not re-ask for a token that has not changed.
ask_secret() {
  local var="$1" prompt="$2" answer=''
  [ -n "${!var:-}" ] && return 0

  unlock_secrets
  [ -n "${!var:-}" ] && return 0

  interactive || die "$var is not set. Export it for this run."

  read -r -s -p "   $prompt: " answer
  printf '\n'
  # Trimmed for the same reason as the rest, and more so: a token is always
  # pasted, and a trailing space in one is a rejection with no explanation
  # attached.
  export "$var=$(trim "$answer")"
  secrets_keys_add "$var"
  SECRETS_DIRTY=1
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
# written here: the API keys go into the runtime env file on the server, which
# is `chmod 600` and never leaves it, and anything this machine has to keep goes
# into the encrypted store beside it. See save_secrets above.
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

  # The token is a credential: read without echo, and kept in the encrypted
  # store rather than in deploy.env, because DuckDNS needs it on *every* run —
  # the record is re-pointed each deploy — and a token retyped every time is a
  # token that eventually gets typed somewhere it should not be.
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

# The A records for a name, as whatever this machine has to look them up with.
#
# `getent ahostsv4` is the Linux answer and it is not a portable one: macOS
# either has no `getent` at all or has one that does not know that database, and
# what comes back is nothing — which reads here as "the domain does not resolve"
# and stops a deploy whose DNS is perfectly correct. That is a bad failure: it
# accuses the record, which is the one thing the operator just changed and now
# has no reason to trust.
#
# So: `dig` first, because it asks DNS rather than the host's whole name
# service; `host` second; `getent` last, for a Linux box with neither installed.
# No tool at all is a *skip*, not a verdict — a missing `dig` is not evidence
# about anybody's DNS.
resolve_a() {
  if command -v dig >/dev/null 2>&1; then
    dig +short A "$1" 2>/dev/null | grep -E '^[0-9]+(\.[0-9]+){3}$' | sort -u
  elif command -v host >/dev/null 2>&1; then
    host -t A "$1" 2>/dev/null | awk '/has address/ {print $NF}' | sort -u
  elif command -v getent >/dev/null 2>&1; then
    getent ahostsv4 "$1" 2>/dev/null | awk '{print $1}' | sort -u
  else
    printf 'no-resolver\n'
  fi
}

if [ -z "${AOW5_SKIP_DNS:-}" ]; then
  # Let's Encrypt allows five failures an hour and the challenge arrives over
  # the public name, so a wrong record is worth one lookup rather than a burnt
  # rate limit and a deploy that looks broken.
  domain_ips="$(resolve_a "$SITE_DOMAIN" || true)"
  if [ "$domain_ips" = 'no-resolver' ]; then
    note "no dig, host or getent here — not checking the record"
    domain_ips=''
  elif [ -z "$domain_ips" ]; then
    die "$SITE_DOMAIN does not resolve yet. Add an A record for $SERVER_IP (or set AOW5_SKIP_DNS=1)."
  elif ! printf '%s\n' "$domain_ips" | grep -qx "$SERVER_IP"; then
    note "$SITE_DOMAIN resolves to $(printf '%s' "$domain_ips" | tr '\n' ' ')"
    die "That is not $SERVER_IP. Fix the record, or set AOW5_SKIP_DNS=1 and accept a failed certificate."
  fi
  note "$SITE_DOMAIN -> $SERVER_IP"
fi

save_config
save_secrets

# --- 3. the secrets on the server ---------------------------------------------
#
# The one question this script asks on **every** run, and deliberately does not
# remember.
#
# The env file on the server is the only state here that a deploy can destroy
# and not restore: it holds keys that exist nowhere else once they have been
# pasted. Keeping it is therefore the default and the safe answer, and it is
# what every earlier version of this script did unconditionally.
#
# But "unconditionally" turned out to be a trap of its own: a key *added* to the
# deployment — the Discord pair being the case that found this — never reached a
# server that already had a file, and the symptom was a sign-in button that
# simply never appeared, with a successful deploy either side of it. So the
# answer is now asked for rather than assumed.
#
# It is not written to `deploy.env` like the rest, because a remembered
# "replace" would quietly overwrite the server's secrets on every future
# deploy — the one answer here that must be given deliberately each time. Enter
# keeps what is there; `AOW5_REPLACE_ENV=1` is how a run with nobody to ask says
# otherwise.

step 3 "The server's env file"

REPLACE_ENV=0
REMOTE_ENV_EXISTS=0
if ssh_to "test -f '$REMOTE_ENV'"; then
  REMOTE_ENV_EXISTS=1
  # Names only. The values are the point of the file and do not belong in a
  # terminal scrollback, but which keys are *present* is exactly what somebody
  # deciding this needs to see — a missing DISCORD_CLIENT_ID is the answer.
  # A key present but empty is marked, because to `docker compose` it is the
  # same as absent — `${DISCORD_CLIENT_ID:-}` resolves to nothing either way —
  # and "it is in the file" is exactly the wrong conclusion to draw from a line
  # that does nothing. `t` branches past the second expression so a blank key is
  # printed once rather than by both.
  note "$REMOTE_ENV is already there, holding: $(ssh_to "sed -n -e 's/^\\([A-Za-z_][A-Za-z0-9_]*\\)=[[:space:]]*\$/\\1(empty)/p' -e t -e 's/^\\([A-Za-z_][A-Za-z0-9_]*\\)=.*/\\1/p' '$REMOTE_ENV' | paste -sd' ' -")"

  if [ -n "${AOW5_REPLACE_ENV:-}" ]; then
    note "AOW5_REPLACE_ENV is set — rewriting it"
    REPLACE_ENV=1
  elif interactive && yes_no "Change a key in it? (enter keeps the file exactly as it is)" n; then
    REPLACE_ENV=1
  else
    note "keeping it"
  fi
else
  REPLACE_ENV=1
fi

if [ "$REPLACE_ENV" = 1 ]; then
  # Where the temporary copies go, and the one place they are cleaned up. Both
  # are whole files of secrets sitting in a temp directory for a moment, so both
  # are 600 before anything is written into them.
  CURRENT_ENV=''
  BUILT_ENV=''
  trap 'rm -f "$CURRENT_ENV" "$BUILT_ENV"' EXIT

  LOCAL_ENV="${AOW5_LOCAL_ENV:-infra/.env.production}"
  if [ -f "$LOCAL_ENV" ]; then
    note "sending $LOCAL_ENV"
  else
    # Two different dead ends, and they need different instructions: one is a
    # server with no secrets at all, the other is a deliberate replacement with
    # nothing to replace it *with* — where the fix is to stop asking for one.
    if [ "$REMOTE_ENV_EXISTS" = 1 ]; then
      interactive || die "AOW5_REPLACE_ENV is set, there is no $LOCAL_ENV to send and nobody to ask. Unset it to keep $REMOTE_ENV."
    else
      interactive || die "No $REMOTE_ENV on the server and no $LOCAL_ENV to send."
    fi

    # What is on the server now, so that replacing it can mean *editing* it.
    #
    # Without this, "replace" is "retype every key you have ever set", and the
    # first thing anybody does with a prompt like that is drop the token they
    # could not find — which is the failure this whole step exists to avoid.
    if [ "$REMOTE_ENV_EXISTS" = 1 ]; then
      CURRENT_ENV="$(mktemp)"
      chmod 600 "$CURRENT_ENV"
      ssh_to "cat '$REMOTE_ENV'" > "$CURRENT_ENV"
      note "rewriting it — each key is offered in turn; the default is to keep it"
    else
      note "the server has none and there is no $LOCAL_ENV — building one now"
      note "every key below is optional; press enter to skip one"
    fi

    # The value a key has on the server right now, or empty. Last wins, matching
    # what `docker compose` does with a repeated key.
    current_env() {
      [ -n "$CURRENT_ENV" ] || return 0
      sed -n "s/^$1=//p" "$CURRENT_ENV" | tail -n 1
    }

    # Enough of a value to recognise it, and not enough to use it. The last four
    # characters, the way a card number is shown: "is that the key I am
    # replacing" is answerable from them, and nothing else is.
    mask_tail() {
      local value="$1"
      [ -n "$value" ] || { printf 'not set'; return; }
      if [ "${#value}" -le 4 ]; then printf '****'; else printf '****%s' "${value: -4}"; fi
    }

    # **Every key is offered, one at a time, and each one is a yes/no first.**
    #
    # Two earlier shapes were both wrong. Skipping any key that already had a
    # value made "rewrite" mean "fill in the blanks" — and a key that is
    # *replaced* rather than added has no blank to fill, so a reissued Steam key
    # was silently kept under a deploy that reported success. Asking for every
    # value with the old one as the default fixed that and introduced a worse
    # thing: four live prompts over four working credentials, where one stray
    # keystroke on the wrong line breaks sign-in for everybody.
    #
    # So the question is "change this one?" and the default is no. Nothing is
    # typed over a key you are not there to change, and the one you came for is
    # two keystrokes away. An exported value still wins and is not asked about at
    # all, which is what keeps a one-off override on the command line working the
    # way it does everywhere else in this script.
    ask_kept() {
      local var="$1" prompt="$2" current answer=''
      if [ -n "${!var:-}" ]; then
        note "$var: taken from the environment"
        return 0
      fi
      current="$(current_env "$var")"
      if ! yes_no "$prompt — now $(mask_tail "$current"). Change it?" n; then
        export "$var=$current"
        return 0
      fi
      read -r -p "   new value (blank clears it): " answer
      export "$var=$(trim "$answer")"
    }

    # The same, with the value not echoed. Blank still clears, and here that is
    # unambiguous rather than dangerous: it takes a deliberate yes to reach this
    # prompt at all, so an empty line is an answer to a question that was asked,
    # not a stray enter over a credential nobody was editing.
    ask_kept_secret() {
      local var="$1" prompt="$2" current answer=''
      if [ -n "${!var:-}" ]; then
        note "$var: taken from the environment"
        return 0
      fi
      current="$(current_env "$var")"
      if ! yes_no "$prompt — now $(mask_tail "$current"). Change it?" n; then
        export "$var=$current"
        return 0
      fi
      read -r -s -p "   new value, not echoed (blank clears it): " answer
      printf '\n'
      export "$var=$(trim "$answer")"
    }

    ask_kept STEAM_API_KEY "Steam Web API key (names and avatars; sign-in works without it)"
    ask_kept DISCORD_CLIENT_ID "Discord client id (blank for no Discord sign-in)"
    # Both or neither, which the API enforces its own way: an id with no secret
    # is a button that always fails, so it treats the half-pair as no Discord at
    # all. No id, no question — and no orphaned secret left in the file either.
    if [ -n "$DISCORD_CLIENT_ID" ]; then
      ask_kept_secret DISCORD_CLIENT_SECRET "Discord client secret (not echoed)"
    else
      DISCORD_CLIENT_SECRET=''
    fi
    ask_kept FREESOUND_TOKEN "Freesound token (the tracker's sound search)"

    BUILT_ENV="$(mktemp)"
    chmod 600 "$BUILT_ENV"
    LOCAL_ENV="$BUILT_ENV"
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

# A no-op unless the block above asked for one — the Discord client secret is
# the only other thing here that goes through `ask_secret`.
save_secrets

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
