# Getting the AOW5 tracker running on a new machine

*A handoff document. It assumes you are an agent (or a person with a terminal) setting this up on a
Windows box that has Dota 2 and the Age of Weapons 5 custom game installed, and that you have never
seen this project before. Follow it top to bottom; every step has a check you can run before moving
on.*

---

## 0. What this thing is, in one paragraph

A farm tracker for the Dota 2 custom game **Age of Weapons 5**: an always-on-top overlay showing
gold/hour, run times and what dropped, plus an archive of past sessions. It is **read-only** — it
reads nothing but the player's own console log file. No game files are modified, no memory is read,
nothing is automated in-game, nothing talks to Valve's or the addon's servers.

It works because the addon prints one JSON line per event to the client console:

```
08/22 14:15:11 [PanoramaScript] [AOW5TRK] {"v":1,"e":"drop","items":[["item_2021",1]],"player":0}
```

Dota writes the console to a file when the player launches with `-con_logfile`, and the tracker
tails that file. Everything below is about making those two halves meet.

---

## 1. Prerequisites

| Need | Check |
|---|---|
| Windows 10/11 | `ver` |
| Node 22+ | `node -v` |
| pnpm | `pnpm -v` |
| Dota 2 installed | the `dota 2 beta` folder exists under a Steam library |
| Age of Weapons 5 | playable from the custom-games list |

Find the Dota install once and keep the path — several steps need it:

```powershell
# Usually this, but check; Steam libraries move.
$dota = "C:\Program Files (x86)\Steam\steamapps\common\dota 2 beta"
Test-Path "$dota\game\bin\win64\engine2.dll"
```

---

## 2. Build the app

```bash
cd <repo>
pnpm install
pnpm --filter aow5-tracker check-types
pnpm --filter aow5-tracker test          # 120 tests, all green
pnpm --filter aow5-tracker build
```

Run it in development with the scripted feed, which needs no Dota at all:

```bash
pnpm --filter aow5-tracker dev -- --source=mock --speed=40
```

The mock is a development build only. A packaged tracker reads the console log
and nothing else — `--source=mock` and a config file that asks for it are both
ignored there, because a player shown invented loot on first launch has been
lied to by the first screen.

A HUD should appear top-right with numbers moving. If it does, the app half is done.

Useful development flags:

- `--screenshot=./shot.png` — render for a few seconds, write a PNG, quit. An overlay is
  transparent, always-on-top and click-through, so this is the only practical way to inspect layout.
- `--screenshot-overlay=settings|history|recipe|farm` — which window the shot is of; the two reading
  windows are opened for the occasion.
- `--interactive` — start with click-through off, so the chrome (drag handle, resize grip, buttons)
  is in the shot.
- `--source=console --log=C:/path/to/aow5-console.log` — the live feed.

---

## 3. Point Dota at a log file

Steam → Dota 2 → Properties → Launch Options:

```
-novid -console -con_logfile C:\Users\<you>\aow5-console.log
```

- `-con_logfile` is the one the tracker needs. **Not** `-condebug`: that is a Source 1 flag and does
  not exist in Dota 2 (verified by grep over every module in `game\bin\win64\`).
- Do **not** bother with `+con_filter_enable` / `+con_filter_text`. Those cvars do not exist in
  Source 2 — `con_filter` appears in no Dota binary, while `con_logfile` is in `engine2.dll`. Dota
  accepts the launch option, echoes it back, and ignores it.

Check: launch Dota, and the file appears and starts growing.

---

## 4. Stop Dota logging everything else (important)

`-con_logfile` writes the **whole** console. On a measured 2h37m session that was **12 MB, of which
0.08 MB was the tracker's own lines** — the rest was engine chatter and one addon warning
(`Attack speed is <= 0 in GetAttackSpeed()`) repeating five times a second, 84,556 times.

Dota's own logging system fixes this, and only one lever works:

| Lever | Verdict |
|---|---|
| `con_filter_*` | Does not exist in Source 2. |
| `netconport` (TCP console) | Does not exist in Dota 2. |
| `log_verbosity <channel> off` | Refused: *"Log verbosity levels are locked."* |
| `log_flags <channel> +donotecho` | Wrong direction — suppresses the console *window*, not the file. |
| **`log_flags <channel> +consoleonly`** | **This one.** Means "print in the console, never write to the log file". |

The proof that `ConsoleOnly` is the right flag is in any unmodified log: every channel Dota ships
with it (`Console`, `Developer`, `Workshop`, `SndEmitterSystem`) has **zero** lines in the file,
while unflagged channels have hundreds.

### Generate the cfg for *this* machine

Channel ids and names change between patches, so read them from the game rather than copying a list:

1. Launch Dota, open the console (`` ` ``), run `log_dumpchannels`.
2. The table prints to the console only — the `Console` channel is itself `ConsoleOnly`, so it never
   reaches the log file. Copy it out of the console window.
3. Write `<dota>\game\dota\cfg\autoexec.cfg` with one line per channel **except** `PanoramaScript`:

   ```
   log_flags VProf +consoleonly
   log_flags General +consoleonly
   log_flags "Localization System" +consoleonly      // quote names containing spaces or ':'
   ...
   log_flags PanoramaScript -consoleonly             // last line, insurance
   ```

   Skip the channels that already show `[ConsoleOnly]` in the Flags column. On the reference machine
   that was 148 written lines, 8 skipped, 157 channels total.

4. Restart Dota. Run `log_dumpchannels` again: every row except `PanoramaScript` should now show
   `[ConsoleOnly]`. Any row still blank is a channel name that was typed wrong — that line errored
   at startup and that channel is still logging.

Check: play one room and tail the file. Every line should be `[PanoramaScript]`, and the file should
grow only when something drops.

```powershell
Get-Content C:\Users\<you>\aow5-console.log -Tail 20
(Get-Item C:\Users\<you>\aow5-console.log).Length
```

Note this changes nothing on screen: `ConsoleOnly` channels still print in the in-game console. Only
the file stops receiving them. Delete `autoexec.cfg` to undo. If the addon ever starts printing from
client Lua rather than Panorama, one line brings that channel back:
`log_flags VScript -consoleonly`.

---

## 5. Point the tracker at the log

Launch the tracker, press the hotkey (**Ctrl+Alt+T** by default) to make it clickable, open
**Settings** (the gear) → **Console log** → **Choose**, and pick the file from step 3. Choosing a
file also switches the feed to it and restarts the tail.

Settings live in `%APPDATA%\aow5-tracker\config.json`. A corrupt or older file never stops the app
starting — every value is clamped and defaulted on read.

Check, in this order:

1. The HUD's source badge is not red. (In release builds the badge only appears when something is
   wrong.)
2. Play one room. `RUN` ticks every second, `G/HR` is non-zero, `RUNS` in the state line increments
   when the room is cleared.
3. Settings → **Unreadable lines** is empty. Anything there means the addon changed its output
   format and `core/events.ts` needs to catch up.
4. The History window (clock icon) lists the session with that run in it.

---

## 6. What exists today

### Reading the game

- **Console tail** (`core/sources/console.ts`) — polls the file's size and reads the delta. Handles
  Dota truncating and rewriting the log on launch (head-fingerprint, not just size), reads that land
  mid-line, and a file that does not exist yet. `skipToEnd()` resynchronises after the tracker itself
  rewrites the file.
- **Event contract** (`core/events.ts`) — `room_enter`, `room_exit`, `drop`, `backpack`, schema `v1`.
  The addon ships a narrowed form of the original request (`docs/EVENT-CONTRACT.md`): no `t` and no
  `backpack`, plus a `player` slot on drops. Missing `t` is taken from the console line's own
  timestamp, with a clock that survives New Year (the log has no year in it). A line that merely
  *mentions* `[AOW5TRK]` — Dota echoes launch options — is ignored rather than reported as broken.
- **Log compaction** (`core/sources/logfile.ts`) — rewrites the log with only `[AOW5TRK]` lines when
  the game is not holding it, as a backstop for machines without step 4's cfg. Two guards: a rename
  probe (Windows blocks it while another process has the file) and a 60-second idle check. Never
  runs mid-session: Dota writes at a remembered offset, so truncating a live log makes it re-inflate.

### Turning events into numbers

- **Reducer** (`core/stats.ts`) — runs, clears, deaths, and chained runs: the addon sends no exit
  when the player walks straight into the next room, so a `room_enter` while one is open ends that
  run and counts it. Per-room averages come off the same list. Rates are per **time inside runs**, never wall clock, so standing in the
  hideout does not dilute gold/hour. The derived numbers take a live clock so timers tick every
  second between events instead of lurching at each pickup.
- **Pricing** (`src/features/items/prices.ts`) — one resolver every gold figure reads: a price the
  player set wins outright, otherwise the extracted table cost, halved when *Trader pays half* is on
  (the default, because that is what the trader actually pays). Player prices are never halved.
- **Rooms** (`core/rooms.ts` + `data/rooms.json`) — room ids to names in the chosen language; an unknown id
  shows as its id.
- **Language** (`core/locale.ts` + `src/i18n/`) — English, Russian and Simplified Chinese. The chrome comes
  from the catalogs in `src/i18n/`, typed against English so a missing translation is a build error rather
  than a blank label; item and room names come from the same extracted tables the game draws from. The
  setting defaults to `auto`, which follows `app.getLocale()` per window.
- **Archive** (`core/history.ts`, `electron/history.ts`) — finished runs, one JSON object per line,
  append-only. Mock sessions are never written. Main folds the whole session too, so a window opened
  at nine o'clock can ask what happened at seven (`tracker:getSession`).

### The windows

Four, each a spec entry in `core/ipc.ts` and a component in `src/overlays/`:

- **Farm HUD** — a state line (room, or `In hideout`, plus the run count) that occupies the title
  row while the overlay is click-through, and three cards: `RUN`, `G/HR`, `SESSION`. Expanded it adds
  the loot list, sortable by name, unit value or stack total, with player-set prices in the accent
  colour. Starts collapsed.
- **Settings** — its own window. Item prices first (search, per-item override, trader's cut), tracked
  items, appearance (background transparency off by default, UI scale at 100%), console log (path
  picker, keep-the-log-small, **Trim now**), per-room table, unreadable lines.
- **History** — sessions newest first, runs inside them, session item totals collapsed by default.
  Everything is repriced against today's prices, since the archive stores only ids and quantities.
- **Recipe** — a strip of ingredients for what is being collected toward.

Shared: a tray icon, `Ctrl+Alt+T` click-through toggle, `Ctrl+Alt +/-/0` scale, per-window position
and size, and a panel whose transparency is the slab only — the numbers stay at full contrast.

### Verifying changes

```bash
pnpm --filter aow5-tracker test          # 120 tests: parsing, clock, rates, pricing, sorting, archive, log trim
pnpm --filter aow5-tracker check-types
pnpm --filter aow5-tracker build
```

The tests that matter most are `core/stats.test.ts` (the numbers) and `core/sources/*.test.ts` (the
tail, the compactor, and a verbatim real-session log).

---

## 7. Things that will bite you

- **Exclusive fullscreen hides the overlay.** Dota must be borderless or windowed.
- **The log only exists while Dota runs with the flag.** No `-con_logfile`, no data, and the tracker
  says so rather than showing zeros.
- **Gold is not the game's gold.** The addon runs its own economy and reports none of it; every gold
  figure here is the loot priced from the extracted item tables, halved for the trader by default.
  Native GSI gold fields are permanently `0` in this custom game.
- **The addon's warning spam is an addon bug**, not a logging problem — a modifier computing attack
  speed at or below zero, five times a second, in every player's console. Worth reporting upstream.
- **`docs/EVENT-CONTRACT.md`** is what the addon emits and why it has that shape. Read it before
  proposing changes to `core/events.ts` — the shape is a negotiated agreement with the addon
  developer, not a design decision this repo can make alone. The correspondence behind it is kept in
  `private/`, out of the repository.
