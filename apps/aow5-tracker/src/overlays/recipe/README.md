# The recipe overlay

A bare line at the top-right of the screen: what you are crafting toward, and
how far off you are. One line per target — never wrapped: the line is what
decides how wide the window is, and it grows leftward so the right edge stays
anchored to the corner it lives in.

```
┌──────┐  ┌──────┐  ┌──────┐
│      │  │      │  │      │     −  +   (an opened-up line ends with ×)
│ Magic│  │Gnarled│ │ Iron │
│ Wand │  │Branch │ │ Ore  │
└──────┘  └──────┘  └──────┘
   ×2       2/12       0/8
```

The icon is what gets scanned — you already know what a Gnarled Branch looks
like — so the name sits under it in a smaller face for the ones you do not, and
the name is written into the bottom of the picture rather than under it — a
caption below would add its height to every tile on the line. Names break one
word to a line, are never truncated (an ellipsis on a tile this narrow eats most
of the name, and "Frostproof…" and "Frostbloom…" are the same string), and are
clipped to the icon if they run past it, so one long name costs its own top line
instead of everyone else's layout. Every glyph carries `.hud-text-outline`,
since a name over a bright icon needs it as much as one over a bright game.

The count sits on its own line under the picture, larger and bolder than the
name: it is the only thing on a tile that changes, so nothing is allowed to be
drawn over it. Held is grey and the target is gold:
one half moves, the other is a constant you stop reading. Ingredients run
deepest tier first, an order that does not reshuffle as things complete.

Clicking an ingredient strikes it through and counts it done, which is the only
honest way to say "I already had thirty of these" — the counter can only ever
know what dropped while the tracker was watching. It is stored in
`config.recipeDone`.

No panel behind it. This one is meant to stay on screen for a whole grind, so
what holds it together is `.hud-text-outline` on every glyph rather than a slab
of frosted glass parked over the corner of the game. Empty and click-through, it
measures to nothing and the window disappears with it.

## The two modes

| | |
|---|---|
| **Click-through** | The ingredient list, and nothing else. |
| **Interactive** (`Ctrl+Alt+T`) | The same lines, plus the grip, the per-line `−`/`+` (or `×`), the hammers and the add button. Each line is a drag region — there is no title bar to grab, so the line itself is the handle, with a grip drawn on it because a handle nobody can see is not one. Every control inside opts out via `.hud-drag button`, so tiles still tick. |

The chrome is drawn in **both** modes and merely `invisible` in the first, so its
space is always held. Rendering it only when interactive slid every tile
sideways on each press of the hotkey — under a mouse that was on its way to one
of them. The same rule applies to the farm HUD's header and hint.

Empty, interactive, it is a single `+` button. That is the whole first-run
state: nothing to configure and nothing to explain, because the only thing you
can do is name what you are collecting.

## How a target becomes a plan

One line per crafting **step**, and one level deep to begin with. `craftPlan`
lists a target and the materials it takes — crafted or not:

```
Magic Wand ×2   Wooden Stick 0/2   Gnarled Branch 0/6   Iron Ingot 0/2
```

The hammer on a craftable material opens it up into a line of its own, which is
the player saying "I am making that one too":

```
Magic Wand   ×2   Gnarled Branch 0/6   Iron Ingot 0/2
Wooden Stick ×2   Gnarled Branch 0/6   Iron Ore 0/2
```

Expanding everything by default was tried and thrown away: a deep recipe became
fifteen lines and buried the one thing actually asked for. Opened-up lines are
ringed with a dashed border and carry an `×` instead of `−`/`+` — their count
belongs to whatever needs them, so the only thing to say about one is whether to
keep making it. They live in `config.recipeExpand`.

`flattenNeeds` is still in `core/recipes.ts` and still tested; it answers the
other question ("what does this cost me from scratch"), which is the right one
when choosing what to farm rather than what to make next.

## Where the pieces are

| | |
|---|---|
| `core/recipes.ts` | `flattenNeeds`, `progress`, `completion`. Pure, cycle-guarded, tested. |
| `src/features/recipes/useRecipes.ts` | Loads `items.full.json` (1.2 MB) with a dynamic `import()` on first use, so the farm HUD never pays for a panel that may never be opened. Cached per renderer. |
| `src/features/session/useSession.ts` | `state.items` is the `have` map. |
| `config.recipe` | `{id, count}[]`, persisted — a grind outlasts a session. |
| `config.recipeDone` | Ids ticked off by hand. Outranks the counter. |
| `config.recipeExpand` | Ingredients opened up into steps of their own. Empty by default. |
| `OVERLAY_SPEC.recipe` | Wide and short, auto-started, hotkeyed like the HUD. `max.width` is the ceiling a one-line recipe may grow to. |
| `useContentSize(ref, 'both')` | Why this window has no resize grip: it is measured, not dragged. |

The window has no `OverlayShell`: it is not a panel, so it wires
`useContentHeight` directly and lets the lines be the whole window.
