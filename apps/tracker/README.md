# AOW5 tracker

An always-on-top overlay showing live farm rates for **Age of Weapons 5**, the Dota 2 custom game the sibling
[`aow5-utils-webapp`](../webapp) planner is built from.

Items/hour, gold/hour, average map clear time, and per-item counts — per room and per hour.

```bash
pnpm install                       # from the repo root
pnpm --filter aow5-tracker dev     # opens the overlay against the scripted mock
pnpm --filter aow5-tracker test    # 120 tests over the reducer, parser, clock, prices, recipes and tail
pnpm --filter aow5-tracker build
```

Changing any of it: [`CONTRIBUTING.md`](CONTRIBUTING.md) — the invariants a PR must not break, and what
its description has to answer.

`Ctrl+Alt+T` toggles the overlay between click-through (while playing) and interactive (to configure it).
The header carries collapse, restart session, history, settings and quit; a tray icon offers show/hide and
quit, since the window is frameless and skips the taskbar. History and settings are windows of their own —
singletons, never click-through, opened from those buttons.

## Fitting it over your game

An overlay is only useful at the size, density and opacity that suit the screen it is on, so all three are
adjustable and all three are remembered:

| | |
|---|---|
| **Collapse** | The chevron drops the loot list, leaving where you are and the stat cards. That is the shape it is meant to live in. It shrinks the *window*, not just the panel: hiding the body in CSS would leave a transparent rectangle over the game that still swallows hover. |
| **Cards** | Six by default, three to a row: session time, session gold and session best over current time, current gold and gold per map. Two more — time per map and hourly gold — are off until you turn them on, and any card can be hidden in settings down to a floor of one. |
| **Session clock** | Starts paused, because the overlay is usually open while Dota still loads and counting that as farming makes g/hr a lie. By default the first room you walk into presses play for you; turn that off in settings if you would rather it always be a deliberate press. |
| **Resize** | Drag the corner grip, or the window edges. Clamped between 320×200 and 1200×1600, because a frameless transparent window dragged down to a few pixels is effectively unrecoverable. |
| **UI scale** | A slider in settings, 60%–160%. Also `Ctrl` `+`/`−`/`0` once you have clicked into the panel, and `Ctrl+Alt` `+`/`−`/`0` from anywhere — which is what you want mid-game, since the overlay normally has no focus. |
| **Transparency** | A checkbox — off by default, so the panel is solid — and, when on, a slider for how much of the game shows through the slab behind the readout. The numbers stay at full contrast at every setting. |

Scale is one number because everything in the overlay is sized in `rem`: the shell writes `--ui-scale` onto
the root element and the whole UI follows. It is independent of the window size on purpose — set the density
that suits your monitor once, then size the window for how much loot you want to see at a time.

---

## The one thing it reads

`[AOW5TRK] {json}` lines in Dota's console log, printed client-side by the addon and written to disk only
when the player launches with `-con_logfile`. The addon has shipped them since **2026-08-22**, in a form
narrowed from what was asked for: no game clock (the console line's own timestamp stands in), no backpack
snapshot, and a player slot on each pickup. `docs/EVENT-CONTRACT.md` is the shape and the reasoning;
`core/events.ts` is the parser, which counts and reports what it cannot use rather than guessing.

`--source=mock` is still the development vehicle — a scripted session that needs no game running, and richer
than the live feed on purpose, so the reducer stays exercised against parts of the contract the addon does
not send. It exists only in a development build: a packaged one reads the console log and nothing else,
whatever the flags or the config file say. `docs/SETUP.md` is the step-by-step for a real machine, including the `autoexec.cfg` that stops
Dota writing 12 MB a session of everything else.

### Why not Game State Integration?

Because it cannot see what matters. Verified across 645 live GSI payloads from a real match:

- **Drops are invisible.** Loot goes to AOW5's own 51-slot Backpack, delivered over a chunked `x_net_table`
  custom event. Dota's inventory API never sees it — all six `stash` slots read `empty` while the Backpack
  panel holds items.
- **Gold is invisible.** Every native gold field (`gold`, `gpm`, `gold_from_creep_kills`) is a permanent `0`,
  because the addon runs its own economy.
- **Rooms are invisible.** `map.name` is always `s1`.

GSI does give match id, clock, hero, abilities and the 12 equipped loadout slots — enough to prove the game
is running, not enough to track farming. The research scripts are kept in `spike/`.

## Layout

Three bundles, three roles. `core/` is the only code both sides share, and it is deliberately free of any
Electron import — only `core/sources/console.ts` touches `node:fs`, and only main imports that one.

```
core/events.ts          the [AOW5TRK] contract + a tolerant validator
core/stats.ts           pure reducer: events -> runs, rates, per-room averages
core/recipes.ts         pure: an item's `needs` tree -> base materials -> have/needed
core/items.ts           item id -> name / gold cost / icon
core/ipc.ts             the preload contract and its limits, shared by main and renderer
core/sources/mock.ts    scripted session standing in for the real feed
core/sources/console.ts tails the log (Node-only; main process)
core/sources/logfile.ts trims the log to our own lines when the game lets go (Node-only)
core/rooms.ts           room id -> name in one language, from data/rooms.json
core/locale.ts          which languages exist, and how `auto` resolves against Windows
core/style.ts           which skins exist; a style is CSS tokens and nothing else

electron/main.ts        lifecycle and the IPC surface; wiring, nothing else
electron/config.ts      the settings file: defaults, clamping, migration
electron/overlay.ts     one always-on-top window — collapse, resize, click-through
electron/sources.ts     the one event feed, shared by every overlay
electron/tray.ts        the only handle the app has while the windows are hidden
electron/preload.ts     the only bridge; contextIsolation stays on

src/shell/              the frame every overlay draws inside: chrome, scale, grip
src/features/session/   subscribes to the feed, exposes the derived numbers
src/features/items/     the item table, one per language, built from aow5-shared
src/i18n/               every word the overlay says, in en / ru / zh
src/overlays/farm/      the HUD: state line, cards, sortable loot list
src/overlays/settings/  a window of its own: prices, tracked items, appearance, the log
src/overlays/history/   a window of its own: past sessions, repriced against today
src/overlays/recipe/    the ingredient strip — README.md is its design notes

data/rooms.json         20 rooms, EN+RU+ZH names, type/level/gold
```

**The renderer never touches the filesystem.** Main tails and parses; the renderer receives validated events
over IPC and cannot tell mock from live — which is the only reason the UI could be built before the game
emits anything.

### Why the shell is a separate thing from the HUD

Because there are four overlays now and they are different panels with identical furniture. The recipe strip
— pick a target item, watch `have / needed` move as loot drops — wants the same drag region, the same
collapse, the same resize grip, the same scale and the same event feed as the HUD, and none of its numbers;
settings and history want the frame without the click-through.

So the window is `electron/overlay.ts` keyed by an id, the frame is `src/shell/OverlayShell.tsx`, and the
feed is broadcast rather than owned. `electron/main.ts` iterates `OVERLAY_IDS`; adding one gets a window, its
geometry, its collapse state and its share of the events for free.
`src/overlays/recipe/README.md` is that overlay's design notes — why the line never wraps, why names are
clipped to the icon rather than truncated, where each piece lives.

## Item data

Names, rarity, icons and — critically — **gold cost** come from `aow5-shared`, the same extracted tables the
planner renders. `cost` is the only reason a gold figure is computable at all, since the addon's economy is
invisible from outside the game. `needs`, the recipe graph the ingredient strip runs on, comes from the same
place. What an item is *worth* can be overridden per item in settings, and the trader's half price is applied
to everything else — see `src/features/items/prices.ts`, the one resolver every gold figure in the app reads.

The tables are **imported**, not fetched. A packaged overlay loads its renderer from `file://`, where a
relative `fetch` is blocked by the origin, so the previous fetch-with-a-remote-fallback quietly meant "always
download them". Importing makes the overlay work offline, and it removed the copy step that used to keep a
stale duplicate of the tables inside this app.

Icons ship with the app, for the same reason. They used to load from `https://aow5-builder.pages.dev`, which
made them the one part of an otherwise local overlay that a resolver, a VPN or a retired origin could break —
and a player behind any of those has nothing to clear and nothing to retry. `scripts/gen-icons.ts` copies them
out of `aow5-shared` before every build, dropping every PNG chunk that is not pixels on the way: 1,053 files,
19 MB down to 14 MB, the same pixels. The overlay now makes no outbound request at all, and its CSP says so.

The copy lands in `apps/tracker/public/` and is gitignored — generated, not committed. A build that skips the
script is a build with no icons, which is why `dev` and `build` both run it rather than leaving it to memory.

## Development

```bash
pnpm --filter aow5-tracker dev -- --source=mock                  # real time: ~1:30 runs, 1 s ticks
pnpm --filter aow5-tracker dev -- --source=mock --speed=40       # the same session in ~11 s
pnpm --filter aow5-tracker dev -- --source=console --log=C:/path/to/aow5-console.log
```

`--screenshot=./shot.png` renders for a few seconds, writes a PNG and quits. An overlay is transparent,
always-on-top and click-through, so this is the only practical way to inspect the layout without a game
behind it. `--interactive` starts with click-through already off, which is the only way to capture the
chrome that comes with it — the drag handle, the resize grip, the focus ring.

### Setting up the live source

1. Steam → Dota 2 → Properties → Launch Options, add `-con_logfile C:/Users/you/aow5-console.log`
   (**not** `-condebug`, which is a Source 1 flag and does not exist in Dota 2).
2. Stop Dota writing the rest of its console to that file. Unfiltered it runs to ~12 MB a session
   against 80 KB of ours, most of it one addon warning repeating five times a second. Put
   `log_flags <channel> +consoleonly` for every channel except `PanoramaScript` into
   `<dota>/game/dota/cfg/autoexec.cfg` — that flag means "print in the console, never write to the
   log file".
3. Point the tracker at the file: settings → Console log → **Choose**. Picking a log is what selects
   the live feed; there is no mock/console switch any more.

`docs/SETUP.md` is the whole procedure for a fresh machine, including how to generate the channel
list (it is patch-specific) and why the obvious alternatives — `con_filter_*`, `netconport`,
`log_verbosity` — do not work in Dota 2. The overlay only helps in **borderless or windowed** Dota;
exclusive fullscreen will cover it.

### Settings

Stored in `%APPDATA%/aow5-tracker/config.json`. A corrupt, hand-edited or older file never stops the app from
starting: every value is clamped and defaulted on read, and the pre-0.2 single-window `bounds` field is
migrated, so upgrading does not move your overlay back to a corner.

### Drop sounds

Three ways to say what a pickup should sound like, and `resolveSound` in `core/sounds.ts` is the only place
their order lives: the sound set on the **item** wins, then its **rarity**, then its **level**. A drop rings
once whatever else it matches — the sound means "that dropped", not "that dropped and it was also level 9".

Rarity above level because rarity is what a player looks up for; the level ladder is the floor under it, for
the tiers you have said nothing about. Both grids ship empty: quality 6 alone is 239 items, and a fresh
install that rings all evening is one that gets switched off rather than tuned.

The sounds in the box are whatever is in `assets/sounds/` — `features/sounds/builtins.ts` globs it, so adding
one is dropping an `.mp3` in, and the file's name minus its extension is the `builtin:` name that bindings
point at. They are inlined as data URLs, unlike the icons beside them: a packaged renderer runs on a `file:`
origin where Chromium refuses `fetch`, and `decodeAudioData` needs the bytes. Keep them short — base64 costs
a third on top of the file.

## Releases

Tag-driven, not push-driven: `ci.yml` runs on every push to master and only
type-checks, tests and builds. The installer is cut by `release-tracker.yml`,
which fires on a `tracker-v*` tag and refuses to run if the tag and
`package.json` disagree about the version.

```bash
# 1. bump `version` here, commit it
git tag tracker-v0.1.0-beta
git push origin tracker-v0.1.0-beta
```

The job runs on Windows — packaging is the one thing the tests do not need a
Windows runner for — draws `build/icon.png`, and publishes an installer, a
portable zip and the `latest.yml` the updater reads. The site's download button
reads `/releases/latest` and prefers `setup*.exe`, so the installer is what a
visitor gets.

**Both, because they are for different people.** The installer is the one that
can update itself: `electron-updater`'s Windows path downloads and runs an
`.exe`, and a zip gives it nothing to install. The zip stays for anyone who
would rather not run an installer at all; pressing the update button in one
downloads the installer and converts the copy, which keeps `%APPDATA%` and
leaves the extracted folder behind.

NSIS was off for a while because `makensis` is not long-path aware and
`!include` of electron-builder's own headers ran past `MAX_PATH` under pnpm's
hashed store. The root `.npmrc` caps those directory names at 50 characters,
which fixes it without giving up pnpm's strict isolation.

Either artifact earns a SmartScreen prompt on first download: the executable is
unsigned, since signing a fan tool means buying a certificate against a company
identity.

### Updating

Settings → **About**. Three presses, in order — check, download, restart — and
nothing happens without one: no check on launch, no background download, and no
restart nobody asked for. This is an overlay drawn over a live game, and each of
those would interrupt at the worst moment.

The restart asks first, because it ends the run you are standing in: finished
runs are already in the archive, the current one is not, and the session totals
start over. Settings, prices and history live in `%APPDATA%/aow5-tracker` and are
untouched — an installer replaces the program directory and nothing else. A
downloaded update also applies on the next ordinary quit from the tray.

A development build says so instead of offering the buttons; there is no
`app-update.yml` outside a packaged app, and the source tree updates the way the
source tree does.

## Testing

`node --test`, no framework — matching the rest of the repo.

Two tests carry the most weight. **"tailing a log yields exactly the events the mock would have emitted"**
writes a mock session out in Dota's own line format, tails it, and asserts the result equals the mock's
events — which is what keeps the scripted and live sources interchangeable. **"a real session of shipped
lines tails into a timed run"** does the same with lines copied verbatim out of a real log, including the
shape that once skipped all 107 of them: no `t` on any payload, and a `player` slot on the pickups.
