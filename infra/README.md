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
| `deploy.sh` | Build, swap, smoke-test, prune. Run on the server |
| `backup.sh` | `sqlite3 .backup` snapshot, verified and rotated |
| `systemd/` | The DuckDNS refresh timer and the nightly backup timer |
| `.env.example` | Copy to `/srv/aow5/.env`, fill in, `chmod 600` |

Secrets never enter the repository or an image layer. `docker compose` reads `/srv/aow5/.env` at deploy
time and hands each service only the variables it needs.

`pnpm bootstrap-deploy` collects all of it in one pass — it opens DuckDNS for the one credential
you can only get by signing in, checks both, and writes a filled-in copy of `.env.example` ready to `scp`.
It writes into a gitignored `.secrets/`, to be deleted once it has landed. Pass `--ci` and it also generates
an SSH keypair, pins the host key and sets them as GitHub secrets; that is off by default, because nothing
in `.github/workflows/` deploys anything and a key no workflow reads is a credential with no job.

## Provisioning a machine

Ubuntu **24.04 LTS**, **x86_64**, 2 vCPU / **4 GB** RAM / 40 GB SSD. Hetzner CX22 (~€4/mo) is the
reference. 2 GB works if you build images elsewhere, but `deploy.sh` builds them on the box and the Vite
+ two-pass-terser build over ~25 MB of committed icons peaks near 2 GB — the extra euro removes a whole
class of "the deploy OOM-killed itself". Not ARM: better-sqlite3 prebuilds and local parity are both x64.

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
  backups/   nightly snapshots
```

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

```sh
cd /srv/aow5/repo
git pull
infra/deploy.sh
```

`deploy.sh` refuses to run on a dirty working tree — set `AOW5_ALLOW_DIRTY=1` if you are deliberately
testing something uncommitted — then prints the commit it is shipping, takes a pre-deploy database
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
