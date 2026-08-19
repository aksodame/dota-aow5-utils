# dota-aow5-utils

Fan-made tools for **[Age of Weapons 5](https://steamcommunity.com/sharedfiles/filedetails?id=2967026351)**,
a Dota 2 custom game — built on the game's own data, extracted from its workshop VPK.

Not affiliated with or endorsed by Valve. Dota 2 and its item art are property of Valve Corporation; the
Age of Weapons 5 data and custom art belong to the addon's authors, and are used here only to display
information about the custom game.

## What's here

| | |
|---|---|
| **[`apps/aow5-builder`](apps/aow5-builder/README.md)** | Build planner. Pick a hero, lay out up to nine sections of typed item slots and ability keys, share the whole thing as a link — the board lives in the URL, so there is no account and no backend. |
| **`packages/aow5-shared`** | The map as data: 1,749 items, 5 heroes and their abilities as JSON, 1,088 icons, the frozen id tables the share links index into, and the codec built on them. Committed, so everything else works without the game installed. |

## Planned

An **item tracker** — an always-on-top overlay for a live run: items and gold per hour, average map clear
time, and per-item counts broken down per map. It reads the same shared package, which is why that package
is a package rather than part of the planner.

Anything else that wants the map's data can join them. The rule is one-way: tools depend on
`packages/aow5-shared`, never on each other.

## Quick start

```bash
pnpm install
pnpm dev             # the extracted data is committed, so this works immediately
pnpm test
pnpm build
```

Every root script is a Turborepo task across the workspace. The planner's own README covers the data, the
share format and how to serve the build.
