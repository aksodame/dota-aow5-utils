# aow5-parser

Reads the Age of Weapons 5 workshop VPK and emits the data the rest of the repo is built on.

**It is committed, but it is not a pnpm workspace package**, and nothing in `apps/` or `packages/` imports
from it. It runs only on a machine with the game installed; a clone that never refreshes the data does not
need to run it, because everything the pipeline produces is committed in `packages/aow5-shared`:

| written to | what |
|---|---|
| `packages/aow5-shared/public/data/` | items, heroes, abilities and locales as JSON |
| `packages/aow5-shared/public/icons/` | item, spell and portrait PNGs |
| `packages/aow5-shared/data/` | the frozen, append-only id tables the share codec indexes into |
| `packages/aow5-shared/public/data/wiki/` | the wiki's tables — monsters, locations, talents, heroes, sky, vendors, pools, crafting (steps 08a–08d) |

Its own inputs and scratch space stay here: `config/` (VPK path, CDN templates, frozen hero roster, expected
counts), `assets/ability-icons/` (hand-supplied art), and — ignored by git — `cache/` (raw VPK extracts) and
`reports/` (evidence from the last run).

**What it reads, and what it does not.** Only what the published pak ships in the clear: KV tables under
`scripts/npc/`, Panorama payloads and the HUD bundle, locale files, images, map entity lumps, and a few
plain Lua config files. The server code the addon ships encrypted is never decrypted; where a number lives
only there, the wiki states the value its original author documented and says so. Every step that reads
Lua refuses a file containing `XDecrypt`.

## The wiki steps (08a–08d)

The fan wiki merged into the site in 2026-10 had its own private generator. These steps replace it, read the
same pak as everything above, and emit three languages where it emitted Russian. Each has a
`*.golden.ts` beside it that compares its output with the wiki's last published snapshot (v1.507, cloned at
`../aow-wiki-site`) and explains every difference; run it after a refresh that moves numbers.

| step | emits |
|---|---|
| `08a-wiki-monsters.ts` | monsters, drop pools by difficulty, locations with spawn points read from each room's map entities, minigames |
| `08b-wiki-progression.ts` | talent trees, professions, the heroes' kits and runes, level-30 hero stats |
| `08c-wiki-sky-vendors.ts` | the Sky (greed cave) tiers, endless waves, spawn pools and combos; vendors; shop bundles and chests |
| `08d-wiki-items.ts` | what the wiki needs beyond `items.full.json`: containers, tower chests, Life Souls, wearables, per-season patches, drop pools, crafting |

## Which VPK

`config/aow5.config.json` points at workshop item **3011606331** — the seasonal relaunch, and the game the
site describes. Several near-identical paks sit beside it on disk: `2883951116` (the pre-season publish and
the old pin), `2967026351`, `1331857008` and `3696419629`. Check `publish_data.txt` next to a pak before
pointing `AOW5_VPK` at it, and see `private/ACTUALIZE.md` — the pin is not "whichever is newest".

The addon ships four locales (`addon_english`, `addon_russian`, `addon_schinese`, `addon_vietnamese`).

## The season rulesets

Since the S2 relaunch the pak carries a per-season tree under
`panorama/layout/custom_game/vendor/data/rulesets/`: a `manifest.vjs_c` naming the seasons, the rooms each
plays on and which rows each overrides, then a compiled copy of all twenty tables per season. They are
`.vjs_c` like the publish payloads but are not publish payloads — they assign into a shared object — so
`lib/ruleset.ts` reads them rather than `lib/publishData.ts`.

Step 02 reads exactly one of them, **`ak_life_souls`**, because it is the addon's own answer to which items
are Life Souls and the client refuses to offer one that is not in the active season's copy. S1's is empty
and S2's holds thirty rows, which is what makes the site's Life Soul slot a second-season slot rather than
thirty ids typed into the config. Step 04 cross-checks it against each item's own `AllowedRulesets` and
fails if the two disagree.

**Everything else is read from the base tables, and for `s2` some of those numbers are S1's.** `s1` matches
base on every item field; `s2` differs on about thirty items, and these are the ones that reach emitted
data:

| | |
|---|---|
| `item_G410*`, `item_G413*` | six Drow runes, dearer and a tier higher in S2, with different `gem_value` |
| `item_0527`, `item_0599`, `item_0766`, `item_0797` | different `AbilityValues` |
| `item_0599`, `item_0700`, `item_1599`, `item_1700`, `item_2014` | different `Level`, and two different `Needs` |

Plus 152 `IsDLC` flags and the Life Souls' `AbilityCooldown`, neither of which is emitted. Correcting this
means emitting per-season values, which means a season on every screen that shows a price — it is written
down here because it is a known gap, not because nobody noticed.

The KV cross-check in step 04 will not catch it either: it diffs the Panorama payload against the
hand-authored `scripts/npc/ak_items*.txt`, and both of those are the base tables.

## Dismantle and essences

Every equip, glyph and fate stone carries a `dismantle` record in `items.full.json`: the rule that applies
and which of the four essences it returns, with a chance where the addon rolls for it.

**It carries a count now, and where that came from matters.** The published pak cannot answer it: the
client never computes one — the knapsack sends `request_dismantle_preview` to the server and renders
whatever comes back on `s2c_dismantle_preview_result` — and the server half of that pak is shipped
encrypted (`GameRules.XDecrypt("48940623D5…")` wraps 368 of the 1,442 files under `scripts/vscripts/`).

The author also publishes the addon's **source tree** as a separate workshop item, `1331857008`
("AOW5 S2(Test)"), and there `source_dump/scripts/vscripts/my_game_axe/make/make.lua` is in the clear.
`dismantleOf` is a transcription of its `getNonCraftEquipDismantlePreviewOutputs`,
`getGemDismantleOutputs` and `getStoneDismantleOutputs`, keeping the addon's own ids as the `rule` strings
so a future pak can be diffed against them.

| rule | applies to | returns |
|---|---|---|
| `dismantle_gem` | itemType `gem` | Sigil (`item_M010`) × min(10, max(1, level + quality − 1)) |
| `dismantle_stone` | itemType `stone` | Mythic (`item_M507`) × 1 |
| `dismantle_treasure_q6` | quality 6 treasure | Equipment × level; from level 3 Legendary × ⌊level/2⌋ and Mythic × ⌊level/2⌋ at 25% |
| `dismantle_treasure_q5` | any other treasure | Equipment × level; from level 3 Legendary × ⌊level/2⌋ |
| `dismantle_equip_q6` | quality ≥ 6, not a treasure | Mythic × max(1, ⌊level/2⌋) |
| `dismantle_equip_q5` | quality 5, not a treasure | Legendary × level |
| `dismantle_equip_low_quality` | quality 1-4 equip | Equipment × max(1, ⌊quality × level / 2⌋) |

A "treasure" is the addon's own test, and both halves agree on it: `Subclass` is `treasure`, or
`ItemIsNeutralActiveDrop` is above zero, or `SpeciallyBannedFromNeutralSlot` is explicitly `"0"`.

**Two things moved when the server's copy replaced the client's display list.** The server tests *treasure
before quality*, where the transcription from the client tested quality first — so a low-quality treasure is
a treasure now, which is 39 items changing rule. And `dismantle_treasure_q5_low_level` is gone: it was a
display branch in the codex, not a yield the server has. The old note here wondered whether the client's
`floor(level / 2) > 0` guard was really a count; it was.

**The counts are for one copy at reforge level 0.** A reforged item also returns a share of what the
reforge cost, which the site prices separately — see the reforge table on an item's page.

**They are read from a different pak than everything else here.** The source tree is the S2 *test* build;
the site reads the published one. These are the game's rules rather than its content and have no reason to
differ between the two — but that is an argument, not a guarantee.

## Where a fate stone comes from

A fate stone is `ItemPurchasable` with `ItemDroppable 0`, and it appears in no
drop pool, no treasure pool and no fragment shop — so for a long time the honest
answer to "where do I get one" was nothing at all.

It is in `scripts/npc/ak_greed_cave_endless_config.txt`, which is plain KV in the
published pak. Each row is one depth of the endless Greed Cave and one pool type
(`boss_reward`, `merchant_base`, `merchant_bag`), and splits its rolls between
named groups — `equipment:90|stone:10` — each with its own weighted list in a
field named after the group (`StoneItems`, `EquipmentItems`). Step 04 inverts it
into `ItemFull.sources`, which is the question a page about one item asks.

358 items have a stated source, 158 of the 166 fate stones among them.

**The other eight stones have no source anywhere, and that was checked rather
than assumed.** `item_s_0323`, `item_s_0654`, `item_s_0655`, `item_s_0656`,
`item_s_0658`, `item_s_MT002`, `item_s_MT004` and `item_s_MT006` are the S2
ancestral line. Sweeping every `.txt`, `.vjs_c` and `.csv` in the published pak
for their ids finds them only in the item table, the locale files and the UI
that renders those — no drop pool, no shop, no greed cave row. The source tree
pak (`1331857008`) does not contain them at all; it predates them.

The greed cave table itself is the same 28 rows in both paks. The only
difference is three stones the test pak lists and the current one does not —
`item_s_0168`, `item_s_0240`, `item_s_0456` — which are exactly three of the
ids the refresh reports as tombstoned. The table tracks the game; it is not
stale.

**The weight is not a chance.** The table gives a weight within a group and a
split between groups; turning those into "3.4% per clear" needs how many rolls a
clear makes, which is server-side. The emitted record says weight, and the page
says so too.

## The roll tables, read out of code

Step 04d is the only step that treats the pak as *source* rather than as data. What it wants — how far each
stat may roll from the value the item table lists, to how many decimals, which rolls a reforge level can
reach, what the fixed and enhanced affixes are worth — exists in no table the addon ships: the server's copy
is encrypted Lua, and the client's copy is the compiled Panorama bundle
(`panorama/layout/custom_game/hud/script.vjs_c`, dumped by step 02 as `cache/raw/hud_script.js`).

The published pak ships that bundle **minified**, so nothing in `lib/hudScript.ts` anchors on a name. Every
pattern matches the *shape* of an expression the minifier cannot rewrite — `this.iterationCount`,
`Math.sqrt`, a table subscript feeding a `void 0` fallback — with `\w+` wherever an identifier used to be,
and each one names the readable function it was transcribed against. An unminified pak exists as a separate
workshop item and is what `private/item-seed.mjs --refresh` reads; this step deliberately uses the same pak
as everything else, because the site describes the game people play.

Every failure is loud and stops the pipeline. A step that quietly returned a default would ship a table of
confidently wrong numbers, and a stat range that is wrong looks exactly like one that is right.
`private/reforging_about.md` is the reasoning the transcription came from.

## Running it

```bash
node tools/run-all.ts                # 01 -> 07 then verify
node tools/run-all.ts --offline      # skip the CDN; keep the committed icons
AOW5_VPK="D:/path/to/2883951116.vpk" node tools/run-all.ts
node tools/verify.ts                 # check the committed artifacts on their own
```

The pipeline has no runtime dependencies — the VPK reader, KV parser, PNG writer and CSV parser are all
in-tree, and Node ≥ 22.18 runs the TypeScript directly. `pnpm install --ignore-workspace` here is only
needed for `pnpm check-types` — the flag matters because this directory deliberately sits outside the
workspace. `pnpm extract` and the per-step scripts work with no install at all.

Type imports reach into `../packages/aow5-shared/src/types/`, which is the contract the emitted JSON is
written against. That is a one-way edge: the pipeline knows about the package, never the reverse.

After a run, `git status` in the repo root must be clean on a second invocation — that is what stops 1,000+
committed PNGs from churning on every extraction.
