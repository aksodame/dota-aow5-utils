# Deploying the site

Everything the VPS needs: the two images, the reverse proxy in front of them, and the shell to put it
there. It all runs on one small machine — Caddy terminates TLS and serves the built SPA, and the API sits
behind the same origin under `/api`.

One origin is the load-bearing decision. It is why there is no CORS to configure, why the session cookie
is an ordinary first-party cookie, and why `SameSite=Lax` plus an Origin check is the whole CSRF story.

`.github/workflows/` checks the code but never ships it: `ci.yml` runs the type check, the tests and the
build on every push, and `release-tracker.yml` builds the overlay. Deploying is `deploy.sh`, run by hand.

That has one consequence worth knowing before it bites: CI does not build these images, so a Dockerfile that
has drifted from the workspace layout is not caught until `deploy.sh` builds it on the box. It is a fast
failure and a loud one — but it happens during a deploy, which is when you least want to be reading a build
log. `docker build -f infra/api.Dockerfile .` locally is the cheap way to find out first.

## What is in here

| | |
|---|---|
| `webapp.Dockerfile` | Builds `apps/webapp` and bakes `dist/` into a Caddy image |
| `api.Dockerfile` | Builds `apps/api` into a single bundle beside its migrations |
| `Caddyfile` | TLS, the cache policy, the SPA fallback |
| `docker-compose.yml` | The services, the published ports, the certificate volume |
| `remote-deploy.sh` | The whole deploy from your machine, over SSH. Run here |
| `deploy.sh` | Build, swap, smoke-test, prune. Runs on the server |
| `backup.sh` | `sqlite3 .backup` snapshot, verified and rotated |
| `systemd/` | The nightly backup timer, and a DuckDNS refresh timer for deployments that use one |
| `.env.example` | Copy to `/srv/aow5/.env`, fill in, `chmod 600` |
| `deploy.env.example` | Where a deploy goes. The filled-in copy is `deploy.env`, untracked |

Secrets never enter the repository or an image layer. `docker compose` reads `/srv/aow5/.env` at deploy
time and hands each service only the variables it needs.

`pnpm bootstrap-deploy` collects all of it in one pass — it opens DuckDNS for the one credential
you can only get by signing in, checks both, and writes a filled-in copy of `.env.example` ready to `scp`.
It writes into a gitignored `.secrets/`, to be deleted once it has landed. Pass `--ci` and it also generates
an SSH keypair, pins the host key and sets them as GitHub secrets; that is off by default, because nothing
in `.github/workflows/` deploys anything and a key no workflow reads is a credential with no job.

## Provisioning a machine

Ubuntu **24.04 LTS**, **x86_64**, 2 vCPU / **4 GB** RAM / 40 GB SSD. Hetzner CX22 (~€4/mo) is the
reference, and the size at which `AOW5_BUILD=remote` — building on the box — is comfortable.

**Smaller works, with `AOW5_BUILD=local`.** 1 vCPU / 1 GB / 10 GB is enough to *run* this: Caddy serving a
`dist/`, and node running a bundle, together want under 300 MB. It is not enough to build it, and the
failure is an OOM kill ten minutes into a deploy rather than an error. Building here and streaming the
images over removes that entirely — see "Deploying" below.

Not ARM: better-sqlite3 prebuilds and local parity are both x64.

Create the server **with your SSH public key attached at creation**. Never a root password.

### 1. A non-root user

```sh
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy/
```

Open a **second terminal** and confirm `ssh deploy@<ip>` and `sudo -v` both work before you touch sshd.
This is the step that stops you locking yourself out of a machine you cannot console into.

### 2. Lock down SSH

`/etc/ssh/sshd_config.d/99-hardening.conf`:

```
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AllowUsers deploy
MaxAuthTries 3
X11Forwarding no
```

```sh
sudo sshd -t && sudo systemctl restart ssh
```

Ubuntu 24.04 activates sshd through a socket unit, so a **port** change goes in `ssh.socket`, not in
`sshd_config`. Moving off 22 buys quieter logs and nothing else; key-only auth is the part that matters.

### 3. Firewall

```sh
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

**Port 80 is not optional.** It is how Let's Encrypt validates over HTTP-01, and how Caddy redirects
plain HTTP to HTTPS.

> **Docker publishes ports straight into iptables, underneath ufw.** A container with a `ports:` mapping
> is reachable from the internet whether or not ufw allows it. That is safe here only because
> `docker-compose.yml` publishes nothing but Caddy's 80/443 — the API container gets `expose:` instead.
> If you ever add `ports: "3000:3000"` to debug something, you have opened it to the world.

Check the provider's **own** firewall too (Hetzner Cloud Firewall, DO Cloud Firewall). It is a separate
layer and it will happily drop :80 while ufw says everything is fine.

### 4. Housekeeping

```sh
sudo timedatectl set-timezone UTC
sudo apt install -y unattended-upgrades sqlite3
sudo dpkg-reconfigure -plow unattended-upgrades
```

In `/etc/apt/apt.conf.d/50unattended-upgrades` set `Unattended-Upgrade::Automatic-Reboot "true";` and
`Automatic-Reboot-Time "04:30";`. Everything runs as containers with `restart: unless-stopped`, so an
unattended reboot costs about twenty seconds and buys never thinking about kernel CVEs again.

UTC on the host, because every timestamp in the database is a unix epoch integer and the backup filenames
are `date`-stamped — one timezone everywhere means never reasoning about which one a log line is in.

Swap — required at 2 GB, cheap insurance at 4:

```sh
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swap.conf
```

### 5. Docker

Install Docker Engine and the compose plugin from **Docker's own apt repository** — not `docker.io`, not
the snap, both of which lag and package compose differently:
<https://docs.docker.com/engine/install/ubuntu/>

```sh
sudo usermod -aG docker deploy   # log out and back in for this to take effect
```

Then cap the logs, or a chatty container eventually fills the disk. `/etc/docker/daemon.json`:

```json
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }
```

```sh
sudo systemctl restart docker
```

### 6. Layout

```sh
sudo mkdir -p /srv/aow5/{repo,data,backups}
sudo chown -R deploy:deploy /srv/aow5
sudo chmod 700 /srv/aow5/data /srv/aow5/backups
sudo chown 1000:1000 /srv/aow5/data   # the API container runs as uid 1000 (node)
```

```
/srv/aow5/
  repo/      this repository, checked out — the docker build context
  .env       secrets, chmod 600, never in git
  data/      aow5.db and its -wal/-shm, bind-mounted into the API
    og/      rendered social cards, regenerated on demand — see below
  backups/   nightly snapshots
```

`data/og/` is a **cache, not data.** The API writes a 1200×630 PNG there the first time anything scrapes
a build's link, keyed by the build's slug, its `updated_at` and the reader's language, and deletes the
cards for older versions of that build as it goes. Deleting the whole directory costs nothing but the
next render of each card, which is why `backup.sh` does not touch it and neither should you. It lives on
the data volume rather than in the image because a card outlives a deploy; it is sized by how many builds
have actually been shared, at roughly 700 kB each.

`/srv` rather than `/opt`: the FHS reserves `/srv` for "data served by this system", which is precisely
what this is.

The database is a **bind mount**, deliberately. A named volume is invisible to `sqlite3`, `ls`, `rsync`
and `scp`, and the database is the one thing you will want to open, copy off the box and restore by hand.
Caddy's `/data` **is** a named volume for the opposite reason: you never touch it, and what it holds — the
ACME account key and every certificate — only has to survive.

```sh
git clone https://github.com/aksodame/dota-aow5-utils.git /srv/aow5/repo
cp /srv/aow5/repo/infra/.env.example /srv/aow5/.env
chmod 600 /srv/aow5/.env
$EDITOR /srv/aow5/.env
```

### 7. DuckDNS

Claim a subdomain at [duckdns.org](https://www.duckdns.org), point it at this machine once from the web
UI, and put the subdomain and token into `/srv/aow5/.env`. Then install the refresh timer so a provider
address change does not quietly take the site down:

```sh
sudo cp /srv/aow5/repo/infra/systemd/duckdns.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now duckdns.timer
systemctl list-timers duckdns.timer
```

A timer rather than cron: the output lands in the journal, `Persistent=true` runs a cycle missed across a
reboot, and `list-timers` tells you when it next fires.

Verify before you deploy anything:

```sh
dig +short aow5.duckdns.org      # must be this machine's public address
curl -I http://aow5.duckdns.org  # must reach this machine
```

Caddy then obtains a **real Let's Encrypt certificate automatically**. `duckdns.org` is on the Public
Suffix List, so your subdomain gets its own rate-limit budget rather than sharing one with every other
DuckDNS user.

> **Rehearse the first issuance against staging.** Uncomment the `acme_ca` line in `Caddyfile`, deploy,
> watch a certificate get issued, then comment it back out and redeploy. Production allows five failures
> per hour and that is easy to burn while one firewall rule is still wrong.

### 8. Backups

```sh
sudo cp /srv/aow5/repo/infra/systemd/aow5-backup.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now aow5-backup.timer
sudo systemctl start aow5-backup.service   # run one now and read the output
```

Nothing to back up until the API ships, and `backup.sh` says so and exits cleanly — so installing the
timer early costs nothing. **Set it up the moment there are user rows.**

`backup.sh` uses `sqlite3 .backup`, never `cp`: the database runs in WAL mode, where the `.db` file alone
is an incomplete picture and copying it under a live writer yields something that may not open. Each
snapshot is verified with `PRAGMA integrity_check` and discarded if it fails, then gzipped; anything older
than fourteen days is deleted.

**Copy the newest snapshot off the box.** A backup on the same disk as the database is not a backup — do
this before you tell anyone the site exists.

Restoring: stop the API, `gunzip` the snapshot over `/srv/aow5/data/aow5.db` (removing any stale `-wal`
and `-shm` beside it), start it again.

### Nice to have

`fail2ban` with the sshd jail; an external uptime check; a monitoring agent. None of them are load-bearing
once SSH is key-only and ufw is closed.

## Switching the site over

The VPS and GitHub Pages can both be live at once, and for a while they should be.

1. Deploy here and confirm the domain answers — TLS, the planner, an existing `#b=` link.
2. Point people at the new domain wherever the old one is written down.

**The Pages site is frozen, not forwarded.** The workflow that published it has been removed, so Pages keeps
serving whatever artifact it deployed last, indefinitely, until you delete the site under Settings → Pages.
Every `#b=` link shared from that origin will keep opening that frozen copy of the planner rather than
following you here — an accepted trade, but not a reversible one once builds diverge.

`apps/webapp/redirect/index.html` is still in the tree: a forwarding page that preserves the `#b=` fragment,
which an HTTP redirect could not. Nothing builds it any more. If you change your mind, substituting your
origin into it and publishing it as the Pages site by hand is the whole fix.

**The tracker is a separate step, and it does not work the same way.** `ICON_BASE` in
`apps/tracker/core/items.ts` is compiled into every binary that has shipped, and the renderer's CSP
allowlists that host — so an installed copy cannot be redirected to a new one, the policy refuses it. The old
Cloudflare Pages project must keep serving `/icons/*` as real files for as long as those builds are in use.
Pointing new builds at this domain is a default change plus a CSP entry plus a `tracker-v*` release, and the
CSP already lists both hosts so the release is the only blocker.

## Deploying

### From here, over SSH

```sh
infra/remote-deploy.sh
```

That is the whole first deploy. The script asks for what it does not know — the VPS login, the domain, the
email, and the API keys if the server has no env file yet — saves the targeting answers to
`infra/deploy.env`, and asks nothing on the second run. Values already in the environment win over the file,
so a one-off target is a prefix (`SITE_DOMAIN=staging.example.com infra/remote-deploy.sh`) rather than an
edit to undo. With no terminal attached it never prompts: a missing value is an error naming the variable.

A credential it is asked for does not go in `deploy.env`, which holds targeting and says so. It goes in
`infra/deploy.secrets.enc` — the same `KEY=value` lines, AES-256 under one passphrase, written with the
openssl already on the machine. That is there for the DuckDNS token above all: DuckDNS is re-pointed on
*every* deploy, so without somewhere to keep it the token is retyped every time, and a token retyped that
often is a token that eventually lands in shell history or the wrong window. The trade is a passphrase
prompt in place of a token paste — shorter, and the same one for every secret the deploy learns.

```sh
openssl enc -d -aes-256-cbc -pbkdf2 -in infra/deploy.secrets.enc   # read it by hand
rm infra/deploy.secrets.enc                                        # forgot the passphrase
```

Deleting it costs the tokens and nothing else — the next run asks for them again. In CI, export
`AOW5_DEPLOY_PASSPHRASE`; there is nobody to prompt, and a missing one is an error rather than a hang.
A deploy to a domain you manage needs no secret at all, and is asked for no passphrase.

Six steps, in this order:

| | |
|---|---|
| 1 | **The server.** Offers `ssh-copy-id` if key auth is not set up, and Docker's own installer if there is no Docker; then asks the box its public address and how much memory it has |
| 2 | **The domain.** A name you manage, or a DuckDNS one — which it points at the server there and then, and offers to keep pointed with the refresh timer. The DuckDNS token comes from the encrypted store, or is asked for once and put there. Either way it checks the record resolves *here* before going further |
| 3 | **The secrets.** Keeps the server's `/srv/aow5/.env` if it has one; otherwise sends `infra/.env.production`, or builds one by asking (Steam key, Discord pair, Freesound — all optional). Then sets `SITE_DOMAIN` and `ACME_EMAIL` to match this deploy |
| 4 | **The build, here.** `check-types`, `test` and `build` before the VPS spends five minutes discovering the same thing. `AOW5_SKIP_CHECKS=1` to skip |
| 5 | **The code.** `git archive HEAD` over SSH — no `node_modules`, no local `.env`, no stray database. Offers the two systemd timers the first time. `AOW5_ALLOW_DIRTY=1` to ship uncommitted work |
| 6 | **The images.** Either builds them here and streams them over, or runs the build on the box — see below. Then `deploy.sh` swaps, health-checks and prunes, output attached to your terminal |

**Where the images get built is a question about memory, and the script asks the server.** The webapp's
Vite + two-pass-terser run over ~25 MB of committed icons peaks near 2 GB; the images it produces need under
300 MB to *run*. A small VPS is therefore a perfectly good host and a poor builder, and `AOW5_BUILD` is the
seam:

| | |
|---|---|
| `remote` | `deploy.sh` builds on the server. The default above 2 GB, and the simpler thing when it fits |
| `local` | `docker buildx` builds both images here for `linux/amd64`, then `docker save \| docker load` streams them into the server's image store. The server runs no build stage at all |

Step 1 reads the server's `MemTotal` plus swap and defaults accordingly, and warns before letting you pick
`remote` on a machine that cannot finish — because it will not fail slowly, it will be OOM-killed ten
minutes in with nothing in the log that says so. `local` needs Docker with buildx here; on an arm64 Mac the
build is emulated and slow the first time. The platform is pinned either way, since an arm64 image loads
onto an x86_64 server without complaint and fails at `docker run`.

**Which key opens the server is also configuration.** `ssh` finds one unaided only when it is called
`id_ed25519`/`id_rsa`/`id_ecdsa`, or when `~/.ssh/config` has a `Host` block matching the target. A
per-provider key under its own name, reached by bare address, is neither — so `AOW5_SSH_KEY` names it (a
bare name is looked up in `~/.ssh`) and it is passed with `IdentitiesOnly`, which also keeps an agent
holding several keys from tripping `MaxAuthTries` before the right one is offered. Blank means "whatever
`ssh` already does", which is correct wherever `~/.ssh/config` answers it.

**Moving to a new machine or a new domain is that config file and nothing else.** Everything downstream —
the certificate, the API's `SITE_ORIGIN`, the OpenID return URL — is derived from `SITE_DOMAIN`, so there is
one place to change and no second copy to forget. The two things outside the repo that still need doing by
hand are the DNS record and, if Steam or Discord sign-in is configured, the redirect URL registered with
them: Steam checks the return URL against the realm and Discord matches its redirect exactly, so both refuse
a callback at a domain they have not been told about.

**TLS is free and automatic.** Caddy asks Let's Encrypt for a certificate the first time it serves the new
name, renews it on its own, and redirects HTTP to HTTPS — there is no certbot, no cron job and no key to
rotate. The one thing it cannot do for itself is DNS, which is why `remote-deploy.sh` checks the A record
before it ships anything: the ACME challenge arrives over the public name, and Let's Encrypt allows five
failures an hour. `AOW5_SKIP_DNS=1` if you want to deploy ahead of the record and let the certificate come
later.

### On the box, by hand

```sh
cd /srv/aow5/repo
git pull
infra/deploy.sh
```

`deploy.sh` refuses to run on a dirty checkout — set `AOW5_ALLOW_DIRTY=1` if you are deliberately testing
something uncommitted — then prints what it is shipping (the commit, or `.deployed-version` when the tree
arrived over SSH rather than from `git`), takes a pre-deploy database
snapshot, builds, swaps the containers, polls the site until it answers, and prunes the images it
replaced. If it never comes up it dumps the last hundred lines of the container log and exits non-zero.

The snapshot is taken **before** the build rather than after, because a migration is the likeliest thing
to go wrong and a snapshot of the damage is worth nothing.

Rolling back is `git checkout <sha> && infra/deploy.sh`, plus restoring that snapshot if a migration was
destructive.

To point the compose file at a different env file — a staging domain, or a local trial — set
`AOW5_ENV_FILE`.

## Trying it locally

The images build anywhere Docker does. What you cannot get locally is a certificate for a domain you do
not control, so use the site's own tooling for day-to-day work (`pnpm --filter aow5-utils-webapp dev`) and build
the image only to check the image:

```sh
docker build -f infra/webapp.Dockerfile -t aow5-web .
docker run --rm -p 8080:80 -e SITE_DOMAIN=:80 -e ACME_EMAIL=dev@localhost aow5-web
```

`SITE_DOMAIN=:80` makes Caddy listen on plain HTTP with no ACME at all, which is enough to check that the
build landed, the fallback works and the cache headers are right:

```sh
curl -sI localhost:8080/builder      | grep -i cache-control   # no-cache
curl -sI localhost:8080/icons/       | head -1
```

## What is deliberately not here

- **No CI deploy.** Deploys are a command you run. When that stops being true, the workflow builds and
  pushes images to GHCR and the box only runs `docker compose pull && up -d` — which also removes the
  reason the machine needs 4 GB. `deploy.sh` is written so that is additive.
- **No secrets management.** One `.env` file, `chmod 600`, on one machine.
- **No staging environment.** `AOW5_ENV_FILE` plus a second DuckDNS name is as far as that goes.
