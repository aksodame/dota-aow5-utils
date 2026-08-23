# Contributing to the AOW5 tracker

This app is the always-on-top Electron overlay: four windows over one event feed, reading `[AOW5TRK]`
lines out of Dota's console log. [`README.md`](README.md) is what it does and why it is shaped that way,
[`docs/EVENT-CONTRACT.md`](docs/EVENT-CONTRACT.md) is what the game actually emits, and
[`docs/SETUP.md`](docs/SETUP.md) is how to get a real feed running. This file is the working agreement:
how to develop against it without a game, what must not break, and what a pull request has to say for
itself.

The site and planner have their own: [`apps/webapp/CONTRIBUTING.md`](../webapp/CONTRIBUTING.md).

## Where your change belongs

| you want to change | it lives in |
|---|---|
| The parser, reducer, recipes, item lookup, the IPC contract | `core/` — pure, Electron-free |
| Windows, tray, config file, log tailing, the preload bridge | `electron/` |
| A panel: HUD, recipe strip, settings, history | `src/overlays/<id>/` |
| The frame every panel draws inside | `src/shell/` |
| Item names, gold cost, icons, the `needs` graph | `packages/aow5-shared` — not here |
| The tracker's download page | `apps/webapp` — a different app |

Dependencies run one way: this app may import `aow5-shared`, and **may never import from
`apps/webapp`**, nor the other way round.

## Setup

Node ≥ 22.18 and pnpm 9 (`corepack enable`). You do **not** need Dota installed, or a Windows machine, to
work on it — the tests are `node --test` over pure modules and the mock source is a full scripted session.
Only *packaging* needs Windows.

```bash
pnpm install                                                    # from the repo root
pnpm --filter aow5-tracker dev                                  # the scripted mock, real time
pnpm --filter aow5-tracker dev -- --source=mock --speed=40      # the same session in ~11 s
pnpm --filter aow5-tracker dev -- --source=console --log=C:/path/to/aow5-console.log
pnpm --filter aow5-tracker test
pnpm --filter aow5-tracker build
```

`--screenshot=./shot.png` renders for a few seconds, writes a PNG and quits — an overlay is transparent,
always-on-top and click-through, so this is the only practical way to capture a layout with no game behind
it. `--interactive` starts with click-through off, which is the only way to capture the chrome that comes
with it: the drag handle, the resize grip, the focus ring.

Run what CI runs before you push:

```bash
pnpm check-types && pnpm test && pnpm build
```

## The invariants

These are the ones a change can break quietly, so they are the ones review looks for first:

1. **`core/` imports nothing from Electron.** It is the only code both processes share, and that is what
   keeps it testable. Only `core/sources/console.ts` and `core/sources/logfile.ts` touch `node:fs`, and
   only the main process imports them.
2. **The renderer never touches the filesystem.** Main tails and parses; the renderer receives validated
   events over IPC. `contextIsolation` stays on, `electron/preload.ts` stays the only bridge, and its
   surface is `core/ipc.ts` — extend the contract there, in one place, rather than adding a channel on the
   side.
3. **Mock and live stay interchangeable.** The renderer cannot tell them apart, and a test writes a mock
   session out in Dota's own line format, tails it, and asserts the result equals the mock's events. A new
   event field lands in the parser, the mock and that test together, or it does not land.
4. **The parser reports what it cannot use; it never guesses.** Skipped lines are counted and surfaced.
   The mock may exercise parts of the contract the addon does not send yet — that is deliberate, it keeps
   the reducer honest — but it may not invent something `docs/EVENT-CONTRACT.md` does not define.
5. **A packaged build reads the console log and nothing else**, whatever the flags or the config file say.
   Development-only sources stay development-only.
6. **A config file never stops the app from starting.** Every value in `electron/config.ts` is clamped and
   defaulted on read, and older shapes are migrated. Adding a setting means adding its default, its clamp
   and — if it moves an existing field — its migration. An upgrade must not move somebody's overlay back
   into a corner.
7. **Adding an overlay is a registration, not a new frame.** An id in `OVERLAY_IDS`, an entry in
   `OVERLAY_SPEC` and `OVERLAY_LIMITS`, and `src/shell/OverlayShell.tsx` for the chrome. It then gets its
   window, geometry, collapse state and share of the events for free. Don't hand-roll a drag region.
8. **Everything is sized in `rem`.** The shell writes `--ui-scale` onto the root element and the whole UI
   follows; a hardcoded `px` is a thing that stops scaling on somebody's 4K monitor.
9. **Gold resolves in one place.** `src/features/items/prices.ts` is the resolver every gold figure reads
   — per-item overrides, then the trader's half price. A second price calculation anywhere is a bug
   waiting to disagree with the first.
10. **Item data is imported, never fetched.** A packaged renderer loads from `file://`, where a relative
    `fetch` is blocked by the origin. Icons are the one outbound request the app makes; keep it that way.

## Tests

`node --test`, no framework, matching the rest of the repo. The globs *are* the contract for where a test
file may live:

```
core/**/*.test.ts        src/lib/*.test.ts        src/features/**/*.test.ts
```

Node strips types but **not JSX**, so logic worth testing goes in a JSX-free module and the component
imports it — that is why `src/features/` holds the table building and sorting rather than the components.

Two tests carry the most weight, and a change to events, parsing or the reducer should extend them rather
than route around them: *"tailing a log yields exactly the events the mock would have emitted"*, and *"a
real session of shipped lines tails into a timed run"* — the second built from lines copied verbatim out
of a real log, including the shape that once skipped all 107 of them.

## Logs, captures and privacy

Raw console logs and GSI captures carry the capturing account's SteamID, which is why
`apps/tracker/capture/` is gitignored. If a PR needs evidence from a real session, paste the handful
of `[AOW5TRK]` lines that matter, with the slot ids scrubbed — never attach the whole file.

`apps/tracker/private/` is correspondence with the addon's developer and is not public. Anything
technical that came out of it belongs in `docs/EVENT-CONTRACT.md` instead.

## Branches, commits and versions

Branch off `master`. Name it `<area>/<slug>` — `hud/room-filter`, `recipe/collapse-known`,
`fix/log-rotation`.

Commit subjects match the log: one line, capitalized, no trailing period, describing the change rather
than the files — *"Reworked the tracker HUD around the current room and made the archive editable"*.

**Do not bump `version` in a feature PR.** The version and the `tracker-v*` tag are how a release is cut,
and `release-tracker.yml` refuses to build when the two disagree; the maintainer bumps it when cutting.
If your change needs a release note, put it in the PR description and it will be picked up there.

## Opening the pull request

The description is the review. A reviewer should be able to tell what changed, what it does to the event
contract, the IPC surface and an existing `config.json`, and what you deliberately left out — without
opening the diff and without a game running.

Copy this in and fill it in. Delete a section only when it is genuinely not applicable, and say so rather
than leaving it blank.

````markdown
## What

One or two sentences: the feature as somebody with the overlay open would describe it.

## Why

What was awkward or wrong before — ideally in terms of a real run. Link the issue if there is one.

## How it works

Which of core / electron / shell / overlay it touches and why there, plus the one or two
decisions a reviewer would otherwise have to reverse-engineer.

## Event and IPC contract

- `[AOW5TRK]` events: unchanged / reads a field already in the contract / needs a new one
- `core/ipc.ts`: unchanged / added <channel or field>, and which process owns it
- docs/EVENT-CONTRACT.md updated: yes / n/a

## Config impact

- New settings, their defaults and their clamps
- What an existing %APPDATA%/aow5-tracker/config.json does on first launch after this

## Overlay and scale

- Which overlays it affects, collapsed and expanded
- Checked at 60% and 160% UI scale, and with transparency on
- Click-through still behaves (Ctrl+Alt+T)

## Screenshots

`--screenshot=./shot.png`, and `--interactive` for anything involving the chrome.

## Testing

- [ ] `pnpm check-types`
- [ ] `pnpm test`
- [ ] `pnpm build`
- Mock: which session and speed you ran
- Live: a real log if you have one, or "not tested live" — that is an honest answer

## Scope left out

What you knowingly did not do, and why.
````

A filled-in *Event and IPC contract* takes ten seconds and saves the round trip:

```markdown
## Event and IPC contract

- `[AOW5TRK]` events: unchanged — the room id was already on every pickup
- `core/ipc.ts`: added `roomSummary.itemsPerHour` to the snapshot; main computes it, renderer only reads
- docs/EVENT-CONTRACT.md updated: n/a, nothing new is parsed
```

## What gets a PR sent back

- an Electron import in `core/`, or filesystem access from the renderer
- a new IPC channel that bypasses `core/ipc.ts` or the preload bridge
- a parser change the mock and the tail-equals-mock test do not cover
- a setting with no default, no clamp, or no story for an existing config file
- a panel that hand-rolls its own chrome instead of using the shell
- hardcoded `px` in anything the UI scale should move
- a raw console log or GSI capture attached to the PR
- a `version` bump riding along with a feature

## Before you build something large

Open an issue first for: a new overlay, anything that needs the addon to emit something it does not emit
today, a change to how sessions are stored in history, packaging or signing, or a new runtime dependency
in an app whose whole point is that it sits quietly over a game.

Small fixes, copy, layout and tests: just open the PR.
