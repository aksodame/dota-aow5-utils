# The `[AOW5TRK]` event contract

What Age of Weapons 5 prints to the client console, what the tracker does with it, and why the shape
is what it is. `core/events.ts` is the code this document describes; if the two disagree, the code is
right and this needs fixing.

## The line

Client-side Panorama (`$.Msg`) prints one line per event. Dota's console goes to a file when the
player launches with `-con_logfile`, so a fan tool can tail it; without that flag the lines go
nowhere and cost nothing.

```
08/22 14:15:05 [PanoramaScript] [AOW5TRK] {"v":1,"e":"room_enter","room":"M009"}
08/22 14:15:11 [PanoramaScript] [AOW5TRK] {"v":1,"e":"drop","items":[["item_2021",1]],"player":0}
08/22 14:17:35 [PanoramaScript] [AOW5TRK] {"v":1,"e":"room_exit","room":"M009","reason":"clear"}
```

Everything before the prefix is Dota's own: a timestamp to the second, and the logging channel
(`PanoramaScript`). Both matter — see *No `t`* below, and `docs/SETUP.md` for the channel.

## What is emitted today

| Event | Fields | Notes |
|---|---|---|
| `room_enter` | `room` | Room **id**, not a localized name. |
| `room_exit` | `room`, `reason` | `reason: "clear"` for a finished run. |
| `drop` | `items: [[id, qty], …]`, `player` | One pickup, possibly several stacks. `player` is the slot the pickup belongs to. |

`v` is the schema version and is `1`. An unrecognised event, a wrong `v` or a malformed payload is
counted and skipped — never thrown on, never allowed to kill the tail — and surfaces in the settings
window under *Unreadable lines*. A line that merely mentions `[AOW5TRK]` without a JSON payload is
ignored silently, because Dota echoes launch options into `[CommandLine]`.

## Three things the parser has to absorb

**No `t`.** The original request asked for a game-clock field; the shipped lines have none. Dota
timestamps every console line to the second anyway, so `parseLines` reads the clock off the line
itself when the payload has none. The log carries no year, so `createConsoleClock` treats a
backwards jump of more than a day as New Year rather than letting the session clock freeze.

**No `backpack` event.** A periodic snapshot of the whole backpack was asked for and then
**withdrawn** by us, because it was the one part of the request that would have cost the addon
recurring work — a timer it does not otherwise run. Nothing may depend on it arriving. The shape is
still accepted in case it ever does, and `core/sources/mock.ts` still emits it so the reducer stays
exercised.

**No gold, ever.** The addon runs its own economy and reports none of it, and we did not ask it to:
item costs are already in the extracted tables, so gold is computed locally from item ids. Every
native GSI gold field is a permanent `0` in this custom game. See `src/features/items/prices.ts` for
how a figure is arrived at.

## Rules this contract lives by

- **Ids, never display names.** `M001`, `item_G002`. Names break in other languages and every time a
  string is reworded; ids do not. An earlier version of the tracker reverse-mapped the localized room
  name through `data/rooms.json`, and that fragility is what the request was about.
- **The keys are stable across patches.** Field names are an agreement, not a preference.
- **The tracker is read-only.** It reads the player's own log file. No game files are modified, no
  memory is read, nothing is automated in-game, nothing talks to anyone's servers.
- **Additions are free, changes are not.** New optional fields cost the parser nothing; renamed or
  retyped ones cost every historical session in the archive its meaning.

## Where this came from

The lines exist because they were asked for, narrowed, and shipped — a negotiation with the addon
developer over three messages, not a design this repo chose alone. The correspondence itself is kept
out of the repository (it contains a third party's internal decision and a relay written in someone
else's voice); this document is the part that belongs in public, which is the technical outcome.

The practical consequence for anyone editing `core/events.ts`: the shape is not ours to change. Parse
what arrives, tolerate what does not, and report what cannot be used.
