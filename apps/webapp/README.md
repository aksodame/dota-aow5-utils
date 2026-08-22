# AOW5 web app

The whole site: the front page, the build planner, and the farm tracker's download page. One Vite bundle,
three routes, no backend.

```bash
pnpm --filter aow5-webapp dev
pnpm --filter aow5-webapp build
VITE_BASE=/dota-aow5-utils/ pnpm --filter aow5-webapp build   # for a project Pages site
```

| route | what it is |
|---|---|
| `/` | The landing page: one section per tool — what it is, what it does, and a preview of its real UI. |
| `/builder` | The planner. Everything below the fold of this README. |
| `/tracker` | The farm tracker: what it looks like, why its numbers are not real yet, and the download. |

The tracker itself is **not** here — it is an Electron app in `apps/aow5-tracker`, and this app may not
import from it. `/tracker` is a page *about* it.

## Routing, and why it is fifteen lines

`src/router.tsx` is the History API with a subscription around it. A router library buys nested layouts,
dynamic segments and loaders; this site has three static paths and none of the rest, so what it would
actually buy is 15 kB on a bundle whose argument is that it is small.

The constraint that shapes everything else: **the fragment belongs to the planner.** A whole board lives in
`location.hash`, which is what makes a build shareable with no server. So

- routing is on `pathname`, never the hash;
- nothing on the landing page is an in-page `#anchor` — a stray `#data` following someone onto `/builder`
  would be decoded as a board and reported as a broken link;
- `navigate()` drops the fragment by default, and the one caller that keeps it is the redirect below;
- the deploy needs a `404.html`, which `vite.config.ts` emits as a copy of `index.html`. That is what makes
  a cold request for `/builder` boot the app instead of hitting GitHub's own 404 page. The bounce-through-a-
  query-string variant of that trick is not usable here: it rewrites the URL, and the URL is the product.

**Links shared before the split still work.** Every build shared while the planner was at the site root
points at `/` with the board in the fragment, and `?b=` older still. `redirectLegacyBuildLinks()` runs from
`main.tsx` before the first render and forwards exactly those — landing route, payload present — to
`/builder`, fragment intact.

That predicate is the one part of this app that can silently break a link somebody already has, so it is
tested rather than reasoned about. `src/lib/routes.ts` holds the route table and the two pure functions over
it — `routeAt` and `carriesBuildPayload` — with `src/lib/routes.test.ts` covering both bases, every route,
all three share-link shapes and the near-misses that must *not* be treated as a board. `node --test`, no
framework, like the rest of the repo:

```bash
pnpm --filter aow5-webapp test
```

## The shell

`src/App.tsx` owns what is true of every page and belongs to none: the colour wash, the header, the footer,
the tooltip and toast layers, and the two preferences.

Language and theme are the site's, not the planner's — they used to live on the planner, which meant a
visitor who set them on a landing page would find them missing one click later. `aow5.theme` is applied by
the inline script in `index.html` before first paint, including when that file is being served as `404.html`
for a route.

## The two previews are the real UI

`src/routes/landing/BoardPreview.tsx` draws a planner section with the planner's **own** parts — `ItemIcon`,
`qualityColor`, `SlotRowLabel`, `--slot-size` — so the tile size and the rarity border cannot drift from what
a visitor sees one click later. It does not reuse `Slot`, because `Slot` is a control: it takes an `onPick`
and reveals a clear button on hover, and a preview that offered to clear a slot it does not own would be
lying about what it is.

`src/routes/tracker/HudPreview.tsx` cannot reuse anything, since the tracker is a different app. It is a
re-creation built from that app's specifics rather than from memory — the `hud-panel` treatment, the
overlay's own dark palette pinned inline because the overlay has no light mode, the state line that takes
the header row while the window is click-through, and the readout as it actually is today: three cards, not
the five its README still describes. Its icons are hand-drawn in `src/routes/tracker/glyphs.tsx` on the same
24-unit grid and 2-unit stroke as the real ones, because the site pages do not pull in an icon library — the
planner still does, for its controls, but a page whose icons are all decoration should not.
The one thing knowingly dropped is the panel's `backdrop-filter`: there is no game behind this copy for it to
reveal, and it costs a recomposite per scroll frame. It will go stale when the overlay changes. That is the honest cost of
showing one app inside another, and it is cheaper than a screenshot, which would be stale *and*
untranslated *and* wrong in one of the two themes.

Both are filled with **real items** — id, name, rarity, level and gold cost out of `aow5-shared`, listed in
`src/data/showcase.ts`. Only the quantities in the overlay's loot list are invented, so every total it shows
is arithmetic on real prices. Icons come from the shared `public/` this app already serves, so there is no
second copy of them in the bundle.

## Copy

`src/i18n/strings.ts` is the planner's UI text and was here first. `src/i18n/site.ts` is everything else —
the chrome, the landing page, the tracker's page. They are separate because they are edited for different
reasons: one changes when the board changes, the other when the pitch does. Both are English and Russian,
keyed by the same `Lang` and the same storage key, so a visitor picks a language once for the site.

## The download button

`src/lib/release.ts` asks `api.github.com` for the tracker's latest release and renders the version, size and
publish date beside a direct link to the installer. Unauthenticated, which is what makes it possible from a
page with no backend; the cost is a 60-request hourly budget per IP.

All four states are a working link to the releases page — **none**, a 404, is the state today, and it says so
in the line under the button rather than hiding it. The page does not offer "build it from source"; that
belongs in a README, which is where someone who wants it is already looking. Only a found asset turns the button into a direct
download, which is also the only moment it can honestly claim a version and a size.

The answer is cached at module scope, not refetched per mount: `/tracker` is a route, so the button remounts
every time you navigate back to it, and without the cache it blinked through `loading` again each visit for
an answer that cannot have changed since the tab opened. Failures are deliberately not cached — offline and
rate-limited both pass.

`none` is the state today: nothing has been released yet. `.github/workflows/release-tracker.yml` is what
will change that — it is tag-triggered and does not run until the tracker is packaged.

---

# The planner

A serverless build planner for **Age of Weapons 5**, a Dota 2 custom game. Pick the hero the guide is for,
then lay out renamable sections like a loadout — one to start, up to nine, each new one blank or copied from
a section you already filled in. The whole board lives in the URL,
so sharing a build is sharing a link. No account, no backend, no database.

Each section holds seven ability keys and fifteen typed item slots:

```
 Spells    [P][Q][W][E][D][F][R]

 Potions   [ ][ ][ ]        Neutral   [ ]
 Equipment [ ][ ][ ]        Backpack  [ ]
           [ ][ ][ ]
 Runes     [ ][ ][ ]
```

A slot only accepts items of its kind, and the picker filters to match — a potion slot never offers armour.
The neutral slot is currently unrestricted and offers the whole catalogue. Each section can carry an optional
note (160 characters) explaining what it is for.

**Spells are the other half of a build.** Several of a hero's abilities compete for the same key — Axe has two
Q candidates and four passives — so choosing between them is a real decision, and it can differ between
sections: one set for the early game, another once the build comes online. Only keys the chosen hero actually
has a finished ability for are drawn, so Drow Ranger shows four and Axe shows all seven.

A key offering exactly one ability is not a decision, so it is **filled in automatically** rather than left as
a tile to click through to a list of one. That always covers `F` — every hero is granted the same Emergency
Heal — and usually `D`, plus whatever else a hero happens to have only one of. Switching hero still clears
everything, but the confirmation only appears when picks you actually made would be lost.

Above the roster sits a **referral code** field, with a copy button. It is committed the way a section name
is — blur or Enter, Escape to revert — so there is no save button. It lives in two places: `localStorage`, so
it survives a reload, and `?ref=` in the query string, so it travels with a link you share. A code in the URL
wins on arrival but is not written to storage, so following someone's link does not overwrite your own code.

It is deliberately **not** part of the build codec. The query string and the fragment are independent, which
is why adding this changed no share format and invalidated no existing link.

There is also a **pet** slot at position 12, hidden for now. Hidden groups keep their slots rather than being
removed, so indices never shift and no shared link changes meaning; a hidden slot that already holds
something is still drawn, so nothing arriving via a link can silently disappear.

The app is a React + TypeScript + Vite single page, and it owns none of the data it renders. That belongs to
**`packages/aow5-shared`** — the extracted items, heroes and abilities as JSON, every icon as a PNG, the
frozen id tables, the types they are emitted against, and the share codec built on them. This app is the
first consumer of that package, not its owner; see the [workspace README](../../README.md) for what else
lives here.

The data arrives from a third directory, **`parser/`**, which is *not* part of the workspace and *not* in
git: the pipeline that reads the game's 763 MB workshop VPK and writes what the shared package ships. It
only runs on a machine with the game installed, nothing imports from it, and a clone without it still builds
and deploys. See `parser/README.md` if you have it.

Paths below are relative to the repo root, not to this directory: `tools/`, `config/` and `reports/` sit
under `parser/`, while `public/data/`, `data/` and `src/` sit under `packages/aow5-shared/` unless they are
written out in full.

---

## Quick start

Run these from the repo root — they are Turborepo tasks over the whole workspace, and the tests live in the
shared package.

```bash
pnpm install
pnpm dev             # the extracted data is committed, so this works immediately
```

Refreshing the data from a newer version of the game is a `parser/` job, not a workspace one — see below.

```bash
pnpm test            # URL codec + integration tests (node --test, no test framework)
pnpm build           # typecheck + production bundle
pnpm check-types
pnpm preview         # serve the built output
```

Every root script is a Turborepo task, so a second `pnpm build` or `pnpm test` replays from cache until
something they read actually changes — including files in `aow5-shared`, which the app's build hash covers
through the workspace dependency.

---

## What was extracted

| | |
|---|---|
| Items | **1,749** parsed, **1,640** playable (`is_item_in_game && !hide`) |
| Categories | equip 661 · blueprint 389 · material 201 · gem 183 · stone 152 · potion 94 · special 62 · identity 4 · change 1 |
| Heroes | **5** playable, one profession each |
| Abilities | **48** defined, **40** selectable — the rest are unfinished upstream (see below) |
| Localization | English + Russian — names, HTML descriptions, lore, per-stat labels, ability text |
| Icons | **1,045** item PNGs (843 addon, 202 stock) + **43** spell and portrait PNGs (9 addon, 34 stock) |
| Crafting | 334 recipes, with reverse `usedBy` links |
| Slot kinds | potion 129 · equip 603 · rune 149 · pet 6 · neutral 68 · backpack 1,640 |
| Ability keys | axe q2 w2 e1 d1 r2 p4 · lina q4 w2 e2 d1 r2 p1 · pa q2 w4 e1 d1 r1 p3 · drow q1 w1 d1 · every hero f1 |

### Where the data comes from

Everything ships inside one unextracted archive:
`steamapps/workshop/content/570/2967026351/2967026351.vpk` (VPK v2, 762,897,945 bytes, 9,794 entries).

- **Items** — `panorama/layout/custom_game/vendor/data/npc_items_custom.vjs_c`. Despite the compiled `.vjs_c`
  extension the payload is plain UTF-8: the Panorama build embedded a literal
  `__AK_PANORAMA_PUBLISH_DATA__("@/json/npc_items_custom.json", {…})` call whose argument is the fully merged
  item table. That is one parse instead of reconciling seven `#base`-included KV files.
- **Heroes, abilities, professions** — `ak_heroes.vjs_c`, `ak_abilities.vjs_c` and `ak_profession.vjs_c`
  in the same directory, using the same publish-data trick. Three joins connect them: the profession table
  maps a hero to a profession id, each ability declares the profession allowed to take it
  (`AllowedProfessions`), and the key it binds to (`AbilitySlot`). Abilities gated on *no* profession are
  mostly empty-key placeholders and systems that are not hero kit, so the hero table's own `AbilityN` list is
  the authority on which shared ones are really granted — in practice just the `f` heal.
- **Localization** — `resource/addon_english.txt` and `resource/addon_russian.txt`, Valve KeyValues.
- **Ability text** — *not* in those files. It lives in `resource/localization_overrides/professional.csv`,
  the addon's master translation table, with one column per language. Descriptions there carry the same
  `%token%` placeholders and HTML as item descriptions, so they go through the same substitution and
  rich-text parsing. (The sibling `addon_abilitys_*.csv` overrides cover only 363 *item* stat labels and no
  hero ability at all, so they are not a competing source.)
- **Icons** — `resource/flash3/images/items/*.png` covers most items, and
  `resource/flash3/images/spellicons/*.png` covers the addon's own spell art. The rest reference compiled
  `.vtex_c` textures that are re-imported *stock Dota* art, so they are fetched from Valve's CDN by name
  rather than decompiled (nothing on a normal machine decompiles a Source 2 texture). Hero portraits are
  always stock. Ability textures may carry a path, so the CDN is asked for the basename.

  Five names Valve does not publish are handled explicitly. Three are cosmetic reskins (persona, immortal),
  listed in `abilityIconAliases` and pointed at the stock ability they reskin — literally the same spell's art.
  The other two have no honest stand-in at all: the `f` heal's texture is published nowhere, and Lina's
  Explosive Fireball names a cosmetic Phoenix icon whose stock counterpart is a *different* spell. Those two
  are hand-supplied in `assets/ability-icons/`, listed in `abilityIconOverrides`, and beat every other source.

  The CDN is trustworthy for everything else: an uncompressed spell icon pulled straight out of the game's own
  `pak01` is **byte-identical** to what the CDN serves, which is what settles it as a faithful source rather
  than a lookalike.
- **Not used** — `scripts/vscripts/json/*.lua` are encrypted behind `GameRules.XDecrypt`.

The pipeline never writes to the workshop directory. It is read-only, always.

### Verified, not assumed

`tools/verify.ts` fails the build on any of these:

- VPK structure, and a **CRC32 check of every extracted entry** plus a seeded 200-entry random sample.
- Exact item-type histogram, item counts, and playable count within a tripwire band.
- **An independent cross-check against the raw KV files**: 5,241 field comparisons of `ItemCost`, `Level` and
  `ItemQuality` across 1,747 items, which must all agree. This is what proves the Panorama payload extraction
  is faithful, and it keeps the fallback KV parser exercised rather than rotting.
- Crafting-graph integrity — every ingredient resolves, every `usedBy` back-link is symmetric.
- Every referenced icon exists, is a real PNG, and no orphans or filename collisions.
- **Hero integrity** — the roster matches the frozen config order position for position, every ability a hero
  offers for a key actually binds to that key and is either owned by that hero or shared with all of them,
  the ability table has no duplicates and hashes to what `meta.json` claims, and **no unfinished placeholder
  ability is ever offered**.
- Golden fixtures: 51 exact field assertions over 7 hand-picked items, plus 43 over heroes and abilities —
  one ability per icon source (addon art, stock art, a pathed texture, a cosmetic alias and an unpublished
  texture), and the shared heal every hero is granted.
- **Determinism** — running the pipeline twice must leave `git status` clean.

### Known upstream data bugs

Found by the cross-check, verified against the raw KV sources, and listed in
`config/aow5.config.json` under `knownDataIssues` so the pipeline still fails on *new* breakage:

- `item_M041`, `item_M046`, `item_M051` are referenced by equipment recipes but defined nowhere.
- `tem_M308` is a literal typo for `item_M308` in `ak_items_potion.txt` (item `item_P037`).
- `item_2014` is defined twice, in `ak_items.txt` and `ak_items_change.txt`, with different values. The game
  resolves it to the later `#base` include, and so does the cross-check.

Eighteen items have description placeholders the game computes at runtime. Those are left verbatim and
reported in `reports/unresolved-placeholders.json` rather than filled in with an invented number.

**Eight hero abilities are unfinished.** The addon defines them but ships them unwritten — named
"Ability 001" with the description "To be filled." — so they are counted and dropped rather than offered:

| | |
|---|---|
| Crystal Maiden | all five, so she offers nothing but the shared heal |
| Drow Ranger | `drow_005`, plus `drow_002` which has no `AbilitySlot` at all |
| Lina | `lina_008` |

This is upstream state, not a parse failure, and it will fix itself when the addon fills them in — the counts
in `config/aow5.config.json` are what make that visible rather than silent. The UI says so where it matters,
so a hero with nothing to pick does not read as a broken page. Everything is listed in `reports/heroes.json`.

---

## How sharing works

The board is encoded into the URL fragment:

```
#b=<codecVersion>.<slots>[.<names>[.<descriptions>[.<spells>]]]
```

**Slots** — 2-byte id-table fingerprint, a 1-byte section count, an occupancy bitmap sized to that count,
then one 12-bit index per filled slot. Sizing the bitmap to the section count is what keeps small boards
cheap. An untouched board produces no hash at all; a typical two-section build lands near 60 characters, and
the absolute worst case — nine sections, all 135 slots filled — stays under 320.

**Text** — two segments, names then descriptions, each omitted when unused. A 9-bit presence bitmap, then a
varint length and UTF-8 bytes per entry. Descriptions are capped at 160 characters because they ride in the
URL; the share bar warns past 1,500 characters, where chat clients start clipping links.

**Spells** — one byte for the hero (its 1-based position in the frozen roster, 0 meaning none), then an
occupancy bitmap over `sections × 7` keys and one 12-bit ability index each. Omitted entirely when a guide
has no hero and no spells, so boards that do not use the feature pay nothing. Segments are positional, so a
guide with spells but no names encodes as `6.slots...spells`. Even the worst case — nine sections, every key
filled — adds under 150 characters.

The keys are stored in **wire order** (`q w e d r passive f`), which is not the order they are drawn in
(`passive q w e d f r`). Wire order is append-only for the same reason the id tables are: `f` went on the end
when it was added, so every position a v5 link already used still means what it did.

**Versioning** — the current format is **v6**. Older ones are still decoded, so no shared link stops working:

| | |
|---|---|
| v6 | current — adds the shared `f` key, widening the spell bitmap from six to seven |
| v5 | the hero and per-section spells, six keys |
| v4 | the optional description segment |
| v3 | typed slots, variable section count, no descriptions |
| v2 | nine flat untyped slots per section |
| v1 | as v2, but always exactly nine sections |

A v1–v4 link decodes with no hero and no spells, which is exactly what it meant when it was shared. A v5 link
is read at its own six-key width, so its picks land on the keys they were made for and `f` comes back empty.

v1 and v2 predate typed slots, so their items cannot be restored by position. Each is instead re-homed into
the first slot of its section that accepts its kind — equipment into the equipment block, runes into the
rune block, and anything with no specific home into the backpack. Nothing is dropped, and the decoder
reports the move rather than performing it silently. Golden tests pin the v3 byte layout and both legacy
payloads.

Slots encode an **index into a frozen, append-only id table** (`data/id-table.json`), not an item id string.
That is what keeps links short, and it comes with two rules the pipeline enforces: never reorder, never
remove. An item dropped from the game stays as a tombstone, because reordering would silently repoint every
link ever shared.

Spells work the same way against their own table, `data/ability-table.json`, so appending an item can never
shift a spell index. The hero roster in `config/aow5.config.json` is frozen for the same reason, and the
pipeline fails if the game gains a profession that config has not listed — a new hero has to be a deliberate
append rather than something that lands at an arbitrary index.

Robustness, all covered by tests:

- An index this build does not know is kept as an `unknown` slot, rendered as `?`, and **re-encodes to the
  identical bytes** — a link from a newer build survives a round trip through an older one. Unknown spells
  and unknown heroes get the same treatment, so passing a newer guide along never quietly strips it.
- A fingerprint mismatch warns but still decodes.
- An unsupported codec version, malformed base64, or a corrupt names or spells segment each degrade visibly
  instead of producing a blank page or a wrong item. Text and spells are cosmetic to the items: a corrupt
  segment there never costs the build.
- Switching hero clears every spell, because no ability is shared between heroes. The UI confirms first when
  that would actually lose picks.

Because the state is in the fragment, it never reaches a server and needs no SPA rewrite rules. Export/Import
JSON is the escape hatch for chat clients that truncate long links.

---

## Refreshing the data

Only needed when the addon updates. Requires the game installed **and** a `parser/` directory, which git does
not carry.

```bash
cd parser
node tools/run-all.ts                # 01 -> 07 then verify
node tools/run-all.ts --offline      # skip the CDN; use already-committed icons
AOW5_VPK="D:/path/to/2967026351.vpk" node tools/run-all.ts
```

Steps are individually runnable (`node tools/04-build-items.ts`, `04b-build-heroes.ts`, `05-icons-vpk.ts`, …)
and idempotent. `04b-build-heroes.ts` runs after the item step because the icon steps need the ability
textures it resolves.
Everything the run emits is written across the boundary into `packages/aow5-shared/` and committed there;
inputs, intermediates and evidence (`config/`, `assets/`, `cache/`, `reports/`) stay inside `parser/`.

Offsets and sizes are **soft** assertions — a Steam update makes them drift, which warns rather than fails.
Counts and cross-checks are hard.

After extracting, `git status` must be clean on a second run. It is not optional: it is what stops 1,000+
committed PNGs from churning on every invocation.

---

## Why the data is committed

CI has no VPK and never will — the archive is 763 MB and lives in a Steam install. So the shared package's
`public/data/`, `public/icons/`, `data/id-table.json` and `data/ability-table.json` are committed (~25 MB),
and CI only runs `pnpm install --frozen-lockfile && pnpm build`.

That is also why the pipeline itself does not need to be in the repo. A machine that cannot run it gains
nothing from carrying it, and the artifacts it would produce are already here — checked by
`packages/aow5-shared`'s own tests, which read the committed tables and icons directly.

---

## Deploying

Static output — `pnpm build` writes everything to `apps/webapp/dist/` (~25 MB, mostly the 1,045 item icons,
which Vite copies out of the shared package), plus the `404.html` and `.nojekyll` the build emits for a
static host. Upload that directory and serve it; `pnpm preview` serves it locally first.

GitHub Pages is the host, and `.github/workflows/pages.yml` is the whole deploy: it builds with
`VITE_BASE=/dota-aow5-utils/` and uploads `dist/` as the Pages artifact. Nothing in the app is tied to that
choice — no deploy script, no wrangler config, no provider dependency to remove later.

Three things any host needs to get right:

- Serve **`404.html` for unknown paths**, which is what makes `/builder` and `/tracker` work on a cold
  request. Pages does this with the file the build already writes; nginx wants
  `try_files $uri $uri/ /index.html;`, which is the same thing without the 404 status.
- Serve from the **domain root**, or the default `base` of `/` is wrong. For a subpath, build with
  `VITE_BASE=/sub/ pnpm build` — the router reads the same value, so the routes move with it.
- Set the **cache policy** below. It used to live in a Cloudflare `_headers` file; on a VPS it is nginx
  `location` blocks or the equivalent. Nothing breaks without it — the site is just slower than it needs to
  be, or slower to pick up a data refresh.

| path | policy | why |
|---|---|---|
| `/assets/*` | 1 year, immutable | Vite fingerprints these filenames |
| `/icons/*` | 30 days | filenames come from game data and are *not* hashed, so `immutable` would pin stale art (covers items, spells and portraits) |
| `/data/*` | 1 hour, revalidate | regenerated by every extraction run |
| `/` and `/index.html` | no-cache | a stale entry point would reference dead asset hashes |

Build output is minified with terser (2 passes, `drop_console`, no comments, no source maps) and split into
three chunks so app changes do not invalidate the React and Radix bundles:

| chunk | raw | gzip |
|---|---|---|
| react | 190 KB | 60 KB |
| radix | 87 KB | 28 KB |
| app | 139 KB | 42 KB |
| css | 47 KB | 9 KB |

Because build state lives in the URL fragment, there are no server-side routes and no SPA rewrite rules to
configure — a plain static file server is enough, and a request never carries a build to the server at all.

---

## Layout

```
packages/aow5-shared/     what the map is, as data
  data/id-table.json      frozen append-only item id table — the URL codec's spine
  data/ability-table.json the same, for spells
  public/data/            emitted JSON (fetched at runtime, never imported)
  public/icons/items/     1,045 extracted PNGs
  public/icons/abilities/ 38 spell icons
  public/icons/heroes/    5 portraits
  src/types/              the contract the pipeline emits against
  src/build/              buildCodec, buildState — the sharing core, pure and DOM-free
  src/data/loadData.ts    the fetch layer over public/data/

apps/webapp/              the site: landing, planner, tracker page
  src/router.tsx          three routes over the History API; the hash is the board's
  src/routes/             LandingPage, PlannerPage, TrackerPage and their pieces
  src/build/useUrlSync.ts the React half of sharing, wrapped around the shared codec
  src/components/         board, sections, slots, pickers, item details
  src/components/Referral*   referral code field (local only, never shared)
  src/components/Hero*    hero roster row
  src/components/Spell*   per-section ability keys and their picker
  src/components/ui/      vendored shadcn/ui primitives

parser/                   untracked, outside the workspace — see parser/README.md
  tools/                  extraction pipeline; lib/vpk.ts is the streaming reader
  tools/04b-build-heroes.ts  heroes, abilities and the ability-text CSV join
  config/aow5.config.json VPK path (or $AOW5_VPK), CDN templates, frozen hero roster, expected counts
  assets/ability-icons/   hand-supplied art for icons Valve publishes nowhere
  reports/                evidence from the last run: counts, icon manifests, KV cross-check
```

The app imports the package through three entry points — `aow5-shared/types`, `aow5-shared/codec` and
`aow5-shared/data` — which resolve to TypeScript source rather than a build output. There is nothing to
compile in between: Vite transpiles it like the app's own files, and each package still type-checks itself
(`aow5-shared` twice over, once under the browser lib for `src/` and once under Node for its tests).

The extracted data and icons are the package's too, so `apps/webapp/vite.config.ts` points `publicDir`
straight at `packages/aow5-shared/public/`. Dev serves them from there with no copy step, `vite build` copies
them into `dist/`, and nothing is duplicated in the tree.

Dependencies run one way and only one way: the app knows about the package, the pipeline knows about the
package's types, and the package knows about neither. That is what lets `parser/` be absent without anything
noticing.

The UI is built on [shadcn/ui](https://ui.shadcn.com) (Tailwind v4 + Radix primitives). Those components are
vendored into `src/components/ui/`, so they are ordinary source files — edit them freely. Two have been
customised: `scroll-area` gained a `viewportRef` prop, and `sonner` was unhooked from `next-themes`.

Light and dark themes share one set of CSS variables; `index.html` applies the stored choice before first
paint so the page never flashes the wrong one. Item rarity tints are variables too — the dark palette's
pastels are unreadable on white.

`src/components/fx/` is a small motion layer in the spirit of [React Bits](https://reactbits.dev) — a colour
wash behind the page, a count-up, and staggered reveals — written from scratch rather than vendored, because
React Bits ships under MIT **+ Commons Clause** and keeping that out of the tree keeps this project's
licensing simple. Plain CSS with no new dependencies, and every animation is paired with
`motion-reduce:animate-none`.

**It is deliberately cheaper than it was.** The aurora used to be three 50vw blobs on `blur-3xl`, drifting on
infinite animations, and the site chrome sat on `backdrop-blur`. That combination is what made scrolling
stutter: a fixed layer carrying a blur filter is re-rasterised as the page moves behind it, and every
`backdrop-filter` above it is then recomposited against the result. The wash is now three radial gradients
painted into one background — rasterised once, composited for free — and nothing on the site uses
`backdrop-filter`. The count-up is still there in the planner's footer, but the landing's four figures are
just rendered: a rAF loop and a state update per frame said nothing the number does not.

The extraction pipeline stays dependency-free too: the VPK reader, KV parser, PNG writer, bit packer and
base64url helper are all in-tree, and tests run on `node --test` with no test framework.

---

## Scope

Done: full extraction, a resizable board (1–9 sections of 15 typed slots, addable blank or as a copy of an
existing one), hero selection and per-section
ability picks, renamable sections, per-slot type restrictions, URL sharing, export/import, EN/RU, and an item
browser with a full stat panel — description, stats with localized labels, ability values, recipe
ingredients, reverse "used in" links, glyph values, tags and lore.

The browser's search is still a plain substring filter, labelled *provisional* in the UI. Faceted browsing by
category, tier and recipe tree is the next step, as is drag-and-drop between slots.

Heroes stop at the roster and their abilities. The profession tiers the addon ships — five per hero, each
with unlock costs, stat growth and wearable rewards — are extracted into `cache/raw/` but not yet surfaced,
and neither are the talent trees, which live in `ak_talent.vjs_c`.

---

## Attribution

A fan-made tool, not affiliated with or endorsed by Valve. Dota 2 and its item art are property of Valve
Corporation; the Age of Weapons 5 item data and custom art belong to the addon's authors. Extracted content
is used here only to display information about the custom game.
