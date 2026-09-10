# AOW5 web app

The guides site: browse published builds, publish your own, and download the farm tracker. One Vite bundle,
four routes, talking to `apps/api` on the same origin.

```bash
pnpm --filter aow5-utils-webapp dev      # needs the API alongside: pnpm --filter aow5-utils-api dev
pnpm --filter aow5-utils-webapp build
VITE_BASE=/dota-aow5-utils/ pnpm --filter aow5-utils-webapp build   # for a project Pages site
```

| route | what it is |
|---|---|
| `/` | The browse list. Filters on the left, builds on the right. Called **Builder** in the top bar. |
| `/builds/<slug>` | One build. Hero, then Gear, Spells and Runes. |
| `/me` | The author's own five, as the same rows the browse list draws — each one opens the editor. |

| `/edit` | The editor, with the loadout in the fragment. `?slug=` opens it on a build you own. |
| `/view` | The same fragment, read-only: a loadout somebody shared as a link, with what the codec says about it. |
| `/settings` | The language, for anybody. Signed in: your name, which providers vouch for you, signing out, and — for an admin — the comment queue. |
| `/tracker` | The farm tracker's download and its one piece of setup — switched off behind `REBUILDING` while the page is rebuilt, showing one line and a link to the old site. |

The tracker itself is **not** here — it is an Electron app in `apps/tracker`, and this app may not
import from it. `/tracker` is a page *about* it.

Changing any of it: [`CONTRIBUTING.md`](CONTRIBUTING.md) — the invariants a PR must not break, and what
its description has to answer.

## The UI kit is first-party, on purpose

`src/ui/` is twelve components in CSS modules over a palette defined once in `src/styles.css`. It replaced
Tailwind, shadcn, Radix, lucide-react, clsx, tailwind-merge and class-variance-authority — every one of which
earned its place while the design was still being found, and none of which was still paying for itself once
the design was a known layout with a dozen repeated shapes.

What the platform turned out to already do:

| piece | what it is now | what it replaced |
|---|---|---|
| `Dialog` | the native `<dialog>` element | Radix's top layer, backdrop, focus trap and Escape handling |
| `Tooltip` | `:hover` / `:focus-within` and `position: absolute` | Radix Tooltip and `@floating-ui` |
| `Select` | a native `<select>` | a custom listbox that had to be re-taught mobile and translation |
| `Icon` | the eight glyphs actually used, one 24-grid, 2px stroke | a 1,500-icon package |
| `cx` | six lines | clsx + tailwind-merge + class-variance-authority |

Every tooltip on this site hangs off a tile in a grid whose position is already known, which is why there is
nothing left for a positioning library to compute. That is the shape of the whole argument: the components
here are not better than the ones they replaced, they are *smaller than the problem they are solving*.

Rules for adding to it:

- A component in `src/ui/` knows nothing about builds. Anything that does goes in `src/components/`.
- Colours come from a token. If a value is not in `styles.css`, add it there rather than naming a colour in
  a module.
- Dark is the default and lives on bare `:root`; only light is marked with a class. An unstyled or
  half-loaded page is therefore dark, which is the one that matches the game.

## Routing, and why it is a hundred lines

`src/router.tsx` is the History API with a subscription around it. A router library buys nested layouts,
loaders and data revalidation; this site has four static paths, one dynamic segment and none of the rest.

The constraint that shapes everything else: **the fragment belongs to the editor.** A whole loadout lives in
`location.hash`, which is what lets somebody without a Steam account build something and share it. So

- routing is on `pathname`, never the hash;
- `navigate()` drops the fragment by default, because a loadout following you from the editor onto the browse
  list is meaningless, and anything else following you *onto* the editor would be decoded as a build and
  reported as a broken link;
- the deploy needs a `404.html`, which `vite.config.ts` emits as a copy of `index.html`. That is what makes a
  cold request for `/me` boot the app instead of hitting the host's own 404 page.

`src/lib/routes.ts` holds the route table and the pure functions over it, with `routes.test.ts` covering both
bases, every route, the slug alphabet's near-misses and both fragment shapes. It is tested rather than
reasoned about because it is the one part of this app that can silently break a link somebody already has.

**There is no legacy-link redirect any more.** The old one forwarded `/#b=<payload>` to the planner. Those
payloads are codec v1–v6, which this deployment refuses outright — it reads v7 and v8 — so forwarding them
would land people on an editor reporting a broken link rather than on a list of builds, which is the better
answer to a link that cannot be read. See "How sharing works" below.

## The shell

`App.tsx` owns what is true of more than one page and belongs to none of them: the top bar, the footer, and
the browse query — the filters and the search text, which live in the URL and survive navigating to a build
and back.

**The top bar is tabs, plus a Sign in button until there is an account.** The language switcher and the
account avatar used to sit at its right-hand end too, which made it half navigation and half account panel;
both are on `/settings` now — a tab like any other, open to anybody. Signing *in* stays in the bar because it
is not a place you go, it is what stands between a visitor and every action on the site; signing out is the
opposite, and lives on the page about you. Signed out, `/settings` is the language and nothing else.

**Every page gets the same chrome, the build page included.** It was the one exception for a while, on the
argument that a row of tabs over something somebody wrote to be read is an invitation to leave before
reading it. In practice the cost landed elsewhere: arriving on a shared build link put you on a page with no
way to reach the rest of the site, no language switcher and nowhere to sign in.

**The window is the frame; the page does not scroll.** The top bar is pinned to the top and the footer to
the bottom, and `#main` between them is the only thing that scrolls — so the scrollbar is exactly as tall as
the content it moves rather than a document bar running behind both bars. `--footer-h` is measured by the
footer onto the root (it wraps differently by width and by language), the shell keeps that much padding, and
`useScrollReset` scrolls that region rather than the window.

`src/data/AppData.tsx` holds the three things every screen needs and none of them owns: the extracted game
data, the viewer, and the two preferences. One context rather than three, because a screen that has one
without the others cannot render anyway — and because `items.index.json` is 97 kB and fetching it per page
would be absurd.

## Sign-in is three doors, two of them redirects

`GET /api/auth/steam` and `/api/auth/discord` answer 302 to the provider, which sends people back to
`…/return` — that sets the session cookie and redirects to `/`. So those buttons are **plain `<a>`s**, not
fetches: no CORS, no preflight, and they survive being middle-clicked. A failed sign-in comes back as
`/?auth=failed` (or `banned`), because a redirect has no page of its own to say so on. The third door is a
nickname and a password, which is a form, a proof-of-work worker (`src/lib/pow.ts`) and the only place this
app handles a credential at all.

`/settings` links a provider to an account somebody is already in: `GET /api/auth/<provider>/link`, again a
plain link, coming back as `/settings?link=linked` or with the reason it did not. **Only links** — there is
no unlink button, and the API refuses the request too, because the verification a link grants would
otherwise be reusable.

Until at least one is linked an account is **unverified** — a grey badge beside the nickname in the browse
row, the thread and the build page, all three drawn by one `AuthorName` so they cannot read as three
different statuses. It costs nothing but the wait: comments from an unverified account are held for a
moderator, visible to their author with a "waiting for approval" label the whole time.

## How sharing works

**Two routes read `#b=`.** `/edit` is where you build one; `/view` is where you send one. Sharing used to
mean handing somebody `/edit#b=…` — a screen of controls for a build they had not made, with Save and Publish
on it — so the editor's copy button now writes `/view#b=…` instead, and neither end of that needs an account.

What rides where is the whole design of that link. The **board** is the fragment, rooms included since v8. The
facts *about* a build rather than in it — the price, the referral code, the headline ability and the video —
ride in the query (`/view?price=…&ref=…&spell=w&video=…#b=…`), because the codec is the loadout and a version
bump for four short strings would be a cost every existing link had to pay. The **tier** follows from the
rooms where a board names one, so `?tier=` is only for a guide written for a tier without naming a room.

The video is why the editor's field is a YouTube **id** rather than a link: eleven characters of base64url fit
in a query, where a pasted address with a playlist and three tracking parameters does not. The field draws
`youtu.be/` as a label and trims whatever is pasted down to what it names. The title and the notes are carried
by nothing — they are what *saving* is for, which the editor says under the notes and enforces by disabling
them for a visitor with no account, since a box that keeps nothing should not accept typing.

A loadout is encoded into the URL fragment:

```
#b=<codecVersion>.<board>[.<spells>[.<title>]]
```

**Board** — always present: a 2-byte id-table fingerprint, one byte for the hero (its 1-based frozen roster
position, 0 meaning none), two bytes for the map (likewise, against its own frozen table), a 2-byte occupancy
bitmap over the fifteen slots, then one 12-bit index per filled slot.

Hero and map live in this always-present header rather than in an optional trailing segment they would fit
in. They cost three bytes on a build that names neither, which buys a decoder with no branch where the hero
is unknown *because a later segment was missing* — the class of bug the old positional layout kept producing.
The map gets 16 bits where the hero gets 8, because the roster is five heroes and grows about never, while
rooms arrive with every content drop.

**Spells** — a 1-byte bitmap over the seven ability keys and one 12-bit ability index each, omitted entirely
when nothing is chosen. Keys are stored in **wire order** (`q w e d r passive f`), which is not the order they
are drawn in (`passive q w e d f r`).

**Title** — a varint length and UTF-8 bytes, omitted when there is none. Segments are positional, so a build
with a title but no spells encodes as `7.board..title`.

A full build — every slot, every spell, a title — is about **47 characters**.

**Versioning** — the current format is **v7**, and it is the only one that decodes.

v1–v6 encoded a board of up to nine sections, each with its own name, description and spells. The site no
longer has that concept: a build is one loadout for one map, which is what makes it filterable and rankable.
There is no honest migration — nine loadouts do not become one, and picking the first would silently discard
eight — so the old versions are refused with `unsupported-version` and nothing pretends otherwise.

Slots encode an **index into a frozen, append-only id table** (`data/id-table.json`), not an item id string.
That is what keeps links short, and it comes with two rules the pipeline enforces: never reorder, never
remove. An item dropped from the game stays as a tombstone, because reordering would silently repoint every
link ever shared.

Spells and maps work the same way against their own tables, `data/ability-table.json` and
`data/map-table.json`, so appending an item can never shift a spell index or a room. Map indices are 1-based,
because 0 has to keep meaning "no map chosen".

Robustness, all covered by tests:

- An index this build does not know is kept as an `unknown` slot, rendered as `?`, and **re-encodes to the
  identical bytes** — a link from a newer deployment survives a round trip through an older one. Unknown
  spells, heroes and maps get the same treatment.
- A fingerprint mismatch warns but still decodes.
- An unsupported version, malformed base64, or a corrupt spell or title segment each degrade visibly rather
  than producing a blank page or a wrong item. The title and the spells are cosmetic to the items: a corrupt
  segment there never costs the build.
- Switching hero clears every spell, because no ability is shared between heroes. The editor says so first.

## What the browse row draws

A row shows the hero portrait, the title, the tier, the rooms, the author, what it cost in gold, the main
spell, the gear, and the like count.

The spell and the gear are decoded on the client from the payload the row carries — `BuildSummary` gained a
`payload` field for exactly this. The old summary deliberately did not carry one, because a payload was then
a nine-section board running to three kilobytes; at 47 characters a page of fifteen rows costs under two
kilobytes and saves a request per row. If the payload ever grows back, that is the first thing to reconsider.

`BuildRow` is also what `/me` lists, with `href` pointing at the editor instead of the build: two
different-looking lists of the same object is how somebody stops recognising their own build. Deleting is on
the editor rather than on that list, where it sat one badly-aimed click from Edit.

`src/lib/preview.ts` picks the headline spell — unless the author picked one. `BuildSummary.mainSpell` is a
slot key they chose in the editor, and it wins; the build page rings the same ability so the two agree. When
it is null, and on an anonymous `#b=` link (the codec carries no such field), the fallback is **`q` first**,
then the rest in the order the kit reads, with the passive last. Not the ultimate, which was the obvious choice and the wrong one — the ultimate is close to
fixed per hero, so a column of rows led by it reads as a column of hero names, which the portrait beside it
already said. The shared `f` heal is excluded outright: every hero has it, so it identifies nothing.

---

## What a reforge priority says

A loadout names six items. In this game that is about half of the advice, because every equipment stat is
**rolled**: two copies of the same sword differ by where each stat landed inside its band, by which stat
carries the permanent +30%, and by how far the sword has been reforged. A reader holding the author's six
items can still be holding six of the wrong ones.

So a saved build carries one more thing — a card per piece of gear, drawn between the spells and the notes
on the build page and under the form in the editor. Each card records the stats worth rerolling for **in
order**, the roll worth stopping at, which stat should be fixed or enhanced, whether the copy should be
divine-forged, and one line of prose for the part no control covers, which is usually which half of a
passive matters.

The forge is one box on the card rather than one per stat, because that is what it is in the game: a single
roll made when the item drops, which from then on multiplies every stat it reaches. Ticking it re-quotes
every figure on the card for a forged copy — including the rows it does *not* reach, which simply do not
move (`canBeDivine` is the addon's own rule for which).

A card has **two groups, and they are two different decisions.** *Stats* is the item's own block, and a stat
can be rerolled: the ranking is what you keep reforging towards. *Passive* is the figures inside the item's
sentence — "reflects 100% of armour", "20% more damage in this stance" — and those roll just as widely
(70% of base, against the stat block's 76%) but are drawn from the item's **initial** seed, so no amount of
reforging moves one. Ranking a passive line is a rule for which copy to keep, not something to work towards,
and its row carries no Fixed or Enhanced marks because no affix can land there.

They are worth having: 286 of the 611 playable equipment items carry between one and **five** of these, and
the pak ships no localized label for a single one of them — so `prettifyKey` is where
`ability_value_item_0102_damage` becomes "Damage". Reordering stays inside a group, since a swap across the
line would look like a row teleporting into the block below.

Everything in the panel is drawn at about half the site's usual scale, because its whole job is comparison:
four cards sit in a row on a desktop, and a build's whole priority is one glance rather than a page you
scroll. Colour does the rest of the work — a chosen roll is painted with the game's own 1-7 quality ramp,
so the best reachable roll reads gold and the worst grey without a legend, and the two affix marks carry the
site's two accents (`--accent` for the enhancement, `--accent-2` for the fixed stat) because an item can
have both and one colour made a row with both look like a row with one twice.

**Folded by default when it is being read, open when it is being written.** For a reader this is a second
read — you open a build to see what is in it and come back to this when you are hunting the pieces — and the
megabyte of item records every card needs is not fetched until the heading is clicked, so a build page
nobody expands costs exactly what it did before the panel existed. For an author it is one of the things
they came to fill in, so the editor opens it.

It is stored, not shared. The codec carries a board; this is advice about the *copies* of what is on it, so
it rides with the build like the notes do and a `#b=` link is unchanged. `apps/api` keeps it as JSON in one
column and parses every write — see that README's data model.

The numbers come from `public/data/rolls.json`, which the pipeline reads out of the addon's own compiled
client (step 04d). Three facts out of it shape the whole panel:

- **A roll is quantised.** The draw is rounded to a fifth before anything else touches it, so a stat has five
  or six reachable values rather than a continuum — which is why a target is picked from a list rather than
  typed as a wish.
- **Reforging raises the floor, not the ceiling.** Level 1 buys the best roll the item will ever reach; every
  level after that only lifts the worst one. "Reforge to 9" is a statement about consistency.
- **The fixed stat never moves.** It is drawn once, from the seed the item was created with, at a fixed
  iteration count — so wanting a particular stat fixed is a rule for throwing copies away, not a goal to work
  towards. The panel says so on the row.

`private/reforging_about.md` is the long version, including the parts of a reforge that are *not* knowable
outside the server.

---

## An author's name goes somewhere

Wherever a name is drawn — a browse row, a build's header, a comment — it is a link to the author's Steam or
Discord profile, in a new tab, with the provider's mark beside it. An account with both linked leads with
Steam and carries Discord as a second mark, so neither is unreachable; an account with neither is plain
text, exactly as before.

"Who wrote this" is the first question a reader of a guide has, and a nickname here answers it only inside
this site. The link is the portable answer, and it is a page anybody can open anyway — the API sends a URL
rather than the provider's id, so the site never handles the identifier itself. See the API's README for how
it is carried.

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

Steps are individually runnable (`node tools/04-build-items.ts`, `04b-build-heroes.ts`, `04c-build-maps.ts`,
`04d-build-rolls.ts`, `05-icons-vpk.ts`, …) and idempotent. `04b` runs after the item step because the icon
steps need the ability textures it resolves; `04c` reads `ak_rooms.txt` and the locale files for the map
table; `04d` is the odd one — it reads the compiled client bundle as *source*, because the arithmetic behind
a rolled stat is in the addon's code and in no table it ships. It fails loudly rather than defaulting: a roll
table that is quietly wrong looks exactly like one that is right.

Everything the run emits is written across the boundary into `packages/aow5-shared/` and committed there;
inputs, intermediates and evidence (`config/`, `assets/`, `cache/`, `reports/`) stay inside `parser/`.

Offsets and sizes are **soft** assertions — a Steam update makes them drift, which warns rather than fails.
Counts and cross-checks are hard.

After extracting, `git status` must be clean on a second run. It is not optional: it is what stops 1,000+
committed PNGs from churning on every invocation.

---

## Why the data is committed

CI has no VPK and never will — the archive is 763 MB and lives in a Steam install. So the shared package's
`public/data/`, `public/icons/`, and the three frozen tables in `data/` are committed (~25 MB), and CI only
runs `pnpm install --frozen-lockfile && pnpm build`.

That is also why the pipeline itself does not need to be in the repo. A machine that cannot run it gains
nothing from carrying it, and the artifacts it would produce are already here — checked by
`packages/aow5-shared`'s own tests, which read the committed tables and icons directly.

---

## Deploying

Static output — `pnpm build` writes everything to `apps/webapp/dist/` (~25 MB, mostly the item icons, which
Vite copies out of the shared package), plus the `404.html` and `.nojekyll` the build emits for a static
host. Upload that directory and serve it; `pnpm preview` serves it locally first.

Unlike the old site, this one **needs the API on the same origin.** Caddy serves the bundle and proxies
`/api` to the server; `vite.config.ts` does the same in development. That shared origin is what lets the
session be a plain first-party cookie with no CORS and no CSRF token, and it is what makes the Steam
callback land back on this site rather than on a second one.

Nothing deploys automatically. `infra/webapp.Dockerfile` bakes `dist/` into a Caddy image and
`infra/deploy.sh` swaps it in, both run by hand.

Three things any host needs to get right:

- Serve **`404.html` for unknown paths**, which is what makes `/me` and `/builds/<slug>` work on a cold
  request. nginx wants `try_files $uri $uri/ /index.html;`, which is the same thing without the 404 status.
- Serve from the **domain root**, or the default `base` of `/` is wrong. For a subpath, build with
  `VITE_BASE=/sub/ pnpm build` — the router reads the same value, so the routes move with it.
- Set the **cache policy** below. Nothing breaks without it — the site is just slower than it needs to be, or
  slower to pick up a data refresh.

| path | policy | why |
|---|---|---|
| `/assets/*` | 1 year, immutable | Vite fingerprints these filenames |
| `/icons/*` | 30 days | filenames come from game data and are *not* hashed, so `immutable` would pin stale art |
| `/data/*` | 1 hour, revalidate | regenerated by every extraction run |
| `/api/og/*` | 1 year, immutable for a build's card; 1 day for the site's | a build card's URL carries the build's `updated_at`, so its bytes can never change |
| `/api/*` (the rest) | never cached | it is the API |
| `/` and `/index.html` | no-cache | a stale entry point would reference dead asset hashes |

A fourth thing, if link previews matter: **route link scrapers to the prerenderer.** This is a
single-page app, so `index.html` carries one static `<head>` for every route — the browser replaces it
per route as soon as React mounts (`src/lib/meta.ts`), but Facebook, Discord, Telegram, Slack, WhatsApp
and Twitter do not run JavaScript, so without this every shared build link previews identically. The API
renders a complete document for those user agents at `/api/seo/prerender`, reading the requested path
from an `X-Original-URI` header; `infra/Caddyfile` has the matcher and the exclusion list. It also serves
`/robots.txt` and `/sitemap.xml`, which are generated rather than checked in because both must name this
deployment's own origin by absolute URL.

Build output is minified with terser (2 passes, `drop_console`, no comments, no source maps) and split into
two chunks so app changes do not invalidate React:

| chunk | raw | gzip |
|---|---|---|
| react | 190 KB | 60 KB |
| app | 67 KB | 23 KB |
| css | 23 KB | 5 KB |

There is no third vendor chunk any more. React is the only runtime dependency this app has.

---

## Layout

```
packages/aow5-shared/     what the map is, as data
  data/id-table.json      frozen append-only item id table — the codec's spine
  data/ability-table.json the same, for spells
  data/map-table.json     the same, for the rooms a guide is filed under
  public/data/            emitted JSON (fetched at runtime, never imported)
  public/data/rolls.json  how far each stat rolls, and what reforging does to that
  public/icons/           extracted PNGs: items, abilities, hero portraits

apps/webapp/src/
  ui/                     the kit. Knows nothing about builds.
  components/             the kit applied to this domain: TopBar, BottomBar, Filters, BuildRow, Tile
  routes/                 one file per screen, each with its own module.css
  data/AppData.tsx        game data, viewer, language, theme
  builds/api.ts           the endpoints, typed
  lib/                    routes, the API client, the preview decoder, release lookup
  styles.css              the tokens and the reset. The only global stylesheet.
```

---

## Scope

Done: browsing with hero, map and tier facets plus full-text search; a build page; the editor with item,
spell, hero and map pickers; Steam sign-in; likes; drafts and publishing against a five-build cap; EN/RU/ZH.

**Comments are next.** The API carries the table, the endpoints and the moderation rules already; this app
does not render a thread yet.

Not started: drag-and-drop between slots, and the item browser with its full stat panel — description,
localized stat labels, recipe ingredients, reverse "used in" links, glyph values and lore — which the old
site had and this one has not brought back.

The item hover card carries the **span each stat can roll to** — `+96 – +145` beside the `+120` the item
table lists — for the same reason the priority panel exists: the listed number is the middle of a range
rather than the value on any particular copy, and a card that prints it alone is how somebody ends up
buying the wrong sword. The span runs from the worst roll an unreforged copy can give to the best a fully
reforged one can, which is the honest answer to "what does this item roll" for a card that knows nothing
about anybody's plans.

The item hover card shows a recipe for everything **except equipment**. A piece of gear is acquired long
before it reaches a build, and its ingredient list is the longest block on the card — so on the one card
people open constantly, while reading a loadout, it pushed the stats and the passive out of view to answer a
question nobody had asked. Materials and consumables keep theirs, because for those the recipe *is* the
item.

Heroes stop at the roster and their abilities. The profession tiers the addon ships — five per hero, each
with unlock costs, stat growth and wearable rewards — are extracted into `cache/raw/` but not surfaced, and
neither are the talent trees, which live in `ak_talent.vjs_c`.

---

## Attribution

A fan-made tool, not affiliated with or endorsed by Valve. Dota 2 and its item art are property of Valve
Corporation; the Age of Weapons 5 item data and custom art belong to the addon's authors. Extracted content
is used here only to display information about the custom game.
