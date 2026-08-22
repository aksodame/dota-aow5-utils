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
| **[`apps/aow5-tracker`](apps/aow5-tracker/README.md)** | Farm tracker. An always-on-top Electron overlay for a live run: items and gold per hour, average map clear time, per-item counts broken down per map. Collapses to one line, resizes, and scales to whatever screen the game is on. |

The rule is one-way: apps depend on `packages/aow5-shared`, never on each other. The web app's `/tracker`
page depicts the overlay rather than importing from it — that is the rule, not an oversight, and it is what
keeps the shared package honest about what is genuinely shared. The tracker is why the data is a package
rather than part of the planner — it needs the same item names and gold costs, and the planner has
no business knowing it exists.

## The tracker's overlays

Four windows, one event feed. The **farm HUD** is the readout you leave over the game; **settings** and
**history** are windows you open and close; and the **recipe strip** takes a target item and shows one line
per ingredient with a live `have / needed` count that moves as loot drops, off the same recursive `needs`
graph the planner renders. `apps/aow5-tracker/src/overlays/recipe/README.md` is that panel's design notes,
and `apps/aow5-tracker/docs/SETUP.md` is how to get the whole thing running on a fresh machine.

## Quick start

```bash
pnpm install
pnpm dev             # the extracted data is committed, so this works immediately
pnpm test
pnpm build
```

Every root script is a Turborepo task across the workspace, and the same three run in CI on every push and
pull request. The web app's own README covers the data, the share format and how to serve the build.

`.github/workflows/` is the rest of it: `ci.yml` runs those three checks, `pages.yml` publishes the site to
GitHub Pages on a push to `master`, and `release-tracker.yml` builds and publishes the tracker when a
`tracker-v*` tag is pushed.
