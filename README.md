# dota-aow5-utils

Fan-made tools for **[Age of Weapons 5](https://steamcommunity.com/sharedfiles/filedetails?id=2883951116)**,
a Dota 2 custom game — built on the game's own data, extracted from its workshop VPK.

Not affiliated with or endorsed by Valve. Dota 2 and its item art are property of Valve Corporation; the
Age of Weapons 5 data and custom art belong to the addon's authors, and are used here only to display
information about the custom game.

## What's here

| | |
|---|---|
| **[`apps/webapp`](apps/webapp/README.md)** | The site, in one bundle and three routes. `/` says what the tools are; `/builder` is the planner — pick a hero, lay out up to nine sections of typed item slots and ability keys, share the whole board as a link, because the board *is* the link; `/tracker` is the farm tracker's page and its download. |
| **[`apps/api`](apps/api/README.md)** | The builds API. Accounts, published builds, comments and votes, over one SQLite file. The planner does not depend on it: a `#b=` link still decodes with no account and no network, which is the point. |
| **[`apps/tracker`](apps/tracker/README.md)** | Farm tracker. An always-on-top Electron overlay for a live run: items and gold per hour, average map clear time, per-item counts broken down per map. Collapses to one line, resizes, and scales to whatever screen the game is on. |

The rule is one-way: apps depend on `packages/aow5-shared`, never on each other. The web app's `/tracker`
page depicts the overlay rather than importing from it — that is the rule, not an oversight, and it is what
keeps the shared package honest about what is genuinely shared. The tracker is why the data is a package
rather than part of the planner — it needs the same item names and gold costs, and the planner has
no business knowing it exists.

## The tracker's overlays

Four windows, one event feed. The **farm HUD** is the readout you leave over the game; **settings** and
**history** are windows you open and close; and the **recipe strip** takes a target item and shows one line
per ingredient with a live `have / needed` count that moves as loot drops, off the same recursive `needs`
graph the planner renders. `apps/tracker/src/overlays/recipe/README.md` is that panel's design notes,
and `apps/tracker/docs/SETUP.md` is how to get the whole thing running on a fresh machine.

## Quick start

```bash
pnpm install
pnpm dev             # everything, including the tracker's Electron window
pnpm dev:site        # just the site: the web app and the API it talks to
pnpm test
pnpm build
```

The site is two processes now — Vite on :5173 and the API on :3000, with Vite
proxying `/api` to it so development has the same single origin production
does. `dev:site` starts both; plain `dev` also launches the overlay, which is
rarely what you want while working on the site.

Every root script is a Turborepo task across the workspace, and the same three run in CI on every push and
pull request. The web app's own README covers the data, the share format and how to serve the build.

`.github/workflows/` is the rest of it: `ci.yml` runs those three checks on every push and pull request, and
`release-tracker.yml` builds and publishes the tracker when a `tracker-v*` tag is pushed.

**Nothing in CI deploys the site.** The web app and the API go out together, by hand, with `infra/deploy.sh`
— see [`infra/`](infra/README.md).

[`infra/`](infra/README.md) is how the site gets onto a server of its own: a Dockerfile that bakes the built
SPA into a Caddy image, the Caddyfile that terminates TLS and implements the cache policy the web app's
README has always specified, a compose file, and the deploy and backup scripts. Its README is the runbook —
what to provision, in what order, and which of those steps you cannot skip.

## Contributing

Pull requests are welcome. There is no repo-wide contributing guide, because there is no repo-wide set of
rules worth reading — a change to the planner and a change to the overlay can each break something the
other has never heard of. So the guide lives with the app:

| | |
|---|---|
| **[`apps/webapp/CONTRIBUTING.md`](apps/webapp/CONTRIBUTING.md)** | The site and the planner. The append-only id tables, the codec versions that keep an already-shared link decoding, `pathname`-only routing because the fragment is the board, and both languages and both themes on every change. |
| **[`apps/api/CONTRIBUTING.md`](apps/api/CONTRIBUTING.md)** | The builds API. Why `core/` may not import Nest, the four link rules restated from the server's side, and why a board is stored as a string and never re-encoded. |
| **[`apps/tracker/CONTRIBUTING.md`](apps/tracker/CONTRIBUTING.md)** | The overlay. `core/` free of any Electron import, a renderer that never touches the filesystem, the preload bridge as the only IPC surface, the event contract, and a config file that can never stop the app from starting. |

Each one covers how to run that app on its own, what review will send a PR back for, and the pull-request
template it expects — including a **feature description** that says what changed, what it does to the
contract other people's data already depends on (a shared link; an existing `config.json`), and what was
knowingly left out. The overlay's guide also explains how to develop against a scripted session with no
game installed, which is what makes contributing to it possible without owning the map.

What holds for both: branch off `master`, keep a PR to one coherent change, and run what CI runs —
`pnpm check-types && pnpm test && pnpm build` — before pushing.
