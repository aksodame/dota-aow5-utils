# The AOW5 builds API

The server behind the site: Steam accounts, saved builds, comments and likes, over one SQLite file. It is
what turns the editor from a thing that encodes a loadout into a URL into a thing that also keeps builds
other people can find.

The editor itself does not depend on any of this. A `#b=` link still decodes with no account and no
network, and that is not going to change — see *What this must not break* below.

## Why there is a framework here at all

This repository's stated taste is that dependencies need an argument, and the web app's router is fifteen
lines because of it. Nest is roughly ten megabytes for fifteen endpoints, so it owes one.

The argument is that it buys, once, the things this API would otherwise grow by hand and worse: request
scoping and DI so a session lookup is a guard rather than a line at the top of every handler, module
boundaries that keep auth out of builds, a filter layer that gives every failure one shape, and a throttler
that is already correct. What it costs is size on a server nobody downloads, and one real constraint:

> **Node strips types but not decorators.** `@Injectable()` and `constructor(private readonly db: Db)` are
> exactly the syntax `--experimental-strip-types` cannot erase, so a test that imports a Nest file will not
> load. Which is why:

## `core/` is Nest-free, and every test lives there

The same split the tracker uses to keep `core/` free of Electron, for the same reason and with the same
payoff: the part worth testing has no framework in it.

```
core/     no Nest import, ever. The codec check, the slug, the FTS query
          builder, the Steam OpenID handling, the password hash and the proof
          of work, the schema, the queries.
          `core/**/*.test.ts` is the test glob and it is a contract.
src/      Nest, and only Nest. Controllers, modules, guards, filters.
          Thin by construction: it maps HTTP onto core/ and does no thinking.
```

If something in `src/` is worth a test, that is the signal it belongs in `core/`.

## Running it

```bash
pnpm --filter aow5-utils-api dev          # rebuilds and restarts on change
pnpm --filter aow5-utils-api test         # node --test over core/
pnpm --filter aow5-utils-api build        # typecheck, bundle, then assert the bundle
pnpm --filter aow5-utils-api smoke        # boot the built bundle and check its routes
pnpm --filter aow5-utils-api db:generate  # after editing core/db/schema.ts
```

Nothing needs configuring to start: the database defaults to `./aow5.db` and is created and migrated on
first boot. It is gitignored, disposable, and holds whatever accounts you made while testing — if a
migration is ever rewritten, the server refuses to start and tells you to move that file aside, which is
the whole recovery procedure in development.

From the repository root, `pnpm dev:site` starts this and the web app together. `SITE_ORIGIN` is the only variable required in production — see `infra/.env.example`.

## The build, and the assertion attached to it

`build` is `tsc --noEmit && tsup && node scripts/verify-bundle.ts`, and the third step is the interesting
one.

The API imports `aow5-shared/codec`, so the decoder that validates a submitted board is the same one the
editor renders it with. Both workspace packages ship as **raw TypeScript** — that is their design and
nothing here changes it — so the bundle has to compile them in (`noExternal` in `tsup.config.ts`).

The trap is that forgetting to do so is invisible locally. In a checkout, pnpm links those packages as
symlinks which Node resolves to a real path under `packages/`, where type stripping applies, so an
externalised bundle runs perfectly on your machine. In the image, `pnpm deploy --prod` copies them in as
real directories under `node_modules`, where it does not, and the first import dies. `verify-bundle.ts`
asserts on the artifact instead of trusting that someone ran it once.

Output is a single `dist/main.cjs`. CJS because Nest's ESM support still has edges around
`reflect-metadata` and its optional-dependency probing, and the extension says so explicitly rather than
depending on what `package.json` claims. SWC does the transpiling because esbuild alone cannot emit
`design:paramtypes` — it has no type checker, and that metadata is type information.

## The check that boots it

`test` covers `core/` and `verify-bundle` covers what the bundle asks Node for, and **neither of them ever
starts the server**. A provider Nest cannot construct passes both and fails on the first boot — which is
exactly what happened once, when a DI token was exported from the same module as a provider that injected
it: the module imports the provider to register it, the provider imports the module for the token, and at
the moment the decorators run the token is still `undefined`. Nest then reports "can't resolve dependencies
… argument Function at index [0]", which names nothing you could search for.

`scripts/smoke.ts` boots `dist/main.cjs` against a throwaway database, waits for `/api/health`, checks the
anonymous routes, and counts the routes Nest logged as mapped. It runs in CI after `build`. The injection
tokens now live in `src/db/tokens.ts` — a file that imports nothing, and therefore cannot take part in a
cycle — which is the fix, and the reason that file exists at all.

## The data model, in one paragraph each

**The board stays a string.** `builds.payload` holds the encoded build exactly as its author submitted it,
and nothing ever rewrites it. It is already compact, versioned and indexed against append-only tables;
normalising it into slot rows would mean re-deriving it on read, which means re-encoding, which is what
breaks the fourth link invariant. Everything queryable — hero, tier, price, codec version, item and spell
counts — is derived once at write time into plain columns, so a browse query decodes nothing.

**`main_spell` is the exception that proves the rule**: it is not derived from the payload, it is an opinion
about it. The site used to guess which ability a build was about by reading the kit in order, which is a
guess about somebody else's guide; this is the author's own answer. Stored as a *slot key* rather than an
ability id, so it keeps naming the build's Q after they swap what sits in it — and null keeps meaning "read
the kit", which is what every build written before the column does. The rooms a
build names live in `build_maps`, one row each, because a build may name none, one or all of its tier's.

**`priority` is the one JSON column, and it earns it.** A build carries a card per piece of gear — the stats
worth rerolling for in order, the roll worth stopping at, which stat should be fixed or enhanced, and a line
of prose about the passive. Nothing joins to it, filters on it or counts it: it is a *document about* the
loadout in the same way `body` is prose about it, and it is rewritten whole on every save, so a pair of
tables would buy a shape no query ever asks for. What keeps a schemaless column honest is
`core/builds/priority.ts` — every write is parsed, refused if malformed, and re-serialised, so the column
never holds a client's own bytes, and every read is parsed again so a row an older deployment wrote cannot
break the page rendering it. What it deliberately does *not* check is whether a stat belongs to the item in
that slot: this server carries the frozen id tables and nothing about what an item *is*, and a second copy of
the game's stat lists here would be one more thing to keep in step with the pak.

**The build cap is a constraint, not a check.** Every build takes a numbered `slot`, with a
`UNIQUE INDEX (user_id, slot) WHERE deleted_at IS NULL`. A build with no free slot is refused by the
database; the API still counts first so the user gets a sentence instead of a constraint error, but the
guarantee is in the schema. Soft-deleting frees the slot immediately, because the index is partial.

**The cap is five, plus five per linked provider.** Not a reward for being trustworthy — it is the comment
queue's argument read the other way. An account costs nothing to open, so "five builds a person" was really
five per *free* account, and anybody who wanted ten was one sign-up away from them; a linked Steam or Discord
account is the one genuinely scarce thing here, so an author who has attached one has already paid the price
the cap was collecting. `buildLimitFor` computes it per account, `MeUser.buildLimit` reports it, and the
schema's `builds_slot_range` caps the ceiling at `MAX_BUILDS_CEILING` — the two must agree, which is why the
constant is in the contract rather than in either side.

**Deletes are soft.** A shared `/builds/<slug>` must be able to say the build was deleted rather than be
indistinguishable from a typo, a removed comment must not reshuffle the thread around it, and a banned user's
content has to stay readable by a moderator.

**`request.user` is Passport's property too.** The session guard puts the signed-in `UserRow` there on every
request, and on a provider callback Passport's strategy then overwrites it with the *provider profile* — so
a handler behind `PassportGuard` that still needs to know who was signed in must read `request.sessionUser`,
which the guard sets alongside it and nothing else touches. Reading the wrong one is not a type error: both
are objects, and the link flow spent a release trying to attach a Steam account to a "user" with no id,
which threw on a NOT NULL constraint and showed the person nothing but a framework error page. Every
outcome of that flow is now a redirect, including the unplanned ones.

**`foreign_keys = ON`.** SQLite has it off by default, which would make every `references()` in the schema
decoration and every cascade a no-op. It is set in `core/db/open.ts` alongside WAL, a busy timeout, and
`synchronous = NORMAL`; there is a test that asserts a cascade actually cascades, because the failure mode
is silence.

**Migrations run at boot**, from the committed SQL in `drizzle/`. Correct because there is exactly one
instance: the container that serves the code is the one that migrated the schema, and there is no separate
step to forget. Note that drizzle-kit does not manage virtual tables or triggers — the FTS5 index is a
hand-written migration, so an empty `db:generate` diff does not mean nothing changed.

**A `PublicUser` carries where its owner can be read about.** `profiles` is a list of `{provider, url}` —
`steamcommunity.com/profiles/<id>` and `discord.com/users/<id>`, Steam first — built from the same
`identities` rows `verified` is derived from. A URL rather than the provider's id, because "open their
profile" is the whole capability a reader needs and the id is the thing every other integration keys on.
Carried on the summary like `verified`, so a browse page and a comment thread each cost one extra query for
the whole page rather than one per name; a local-only account has an empty list and its name is plain text.
The numeric Steam form is used rather than `/id/<vanity>`, because a vanity name is a thing its owner can
change and a SteamID is not.

## What this must not break

`apps/webapp/CONTRIBUTING.md` lists four rules that keep an already-shared link decoding. This API touches
all four and is bound by all four:

1. **The frozen tables are read-only here.** `core/codec/tables.ts` loads them and nothing writes them.
2. **A codec version bump needs no migration here.** `payload` is text and `codec_version` is informational.
   The API must never "upgrade" a stored payload.
3. **Build URLs are paths.** `/builds/<slug>` carries no fragment. The fragment belongs to the editor.
4. **Validate by decoding, never by re-encoding.** An index a newer deployment understands and this one does
   not has to survive storage byte-for-byte. No version migrates on decode any more, so a byte-equality check
   would now pass — and it is still not performed, because the moment a v8 arrives that does migrate, the
   check would start rejecting good links and the reason would have been forgotten.

## Three doors, one session

Sign-in is **Steam OpenID 2.0**, **Discord OAuth2** or a **nickname and a password**, and all three end in
the same cookie against the same `sessions` table. Passport authenticates and then gets out of the way:
`session: false` on every strategy, `passport.session()` installed nowhere, and no serialiser pair — what it
buys is one shape for "this request produced a user", not a session store this application already has.

The strategies are deliberately not the obvious packages. `SteamStrategy` is this repository's own OpenID
code in a class with an `authenticate` method, because `passport-steam` delegates to an unmaintained
`openid` and the sixty tested lines below are the security argument; `DiscordStrategy` is `passport-oauth2`
with two URLs and a profile fetch, which is all `passport-discord` ever was.

**The account and the ways into it are separate tables.** `users` is the person; `identities` is one row per
provider account that vouches for them. That split is what made adding Discord an INSERT rather than the
destructive rebuild adding Steam once was, and it is what `verified` below is asking about.

A provider sign-in **never** attaches to an existing account by name or by email. If a provider account is
not already linked, a fresh user is opened — matching on an email is how accounts get taken over by whoever
can get that address issued, and Steam supplies no email to match on anyway. Attaching a provider to an
account somebody is *already signed into* is a different operation with a different route
(`/api/auth/<provider>/link`, behind the session guard, carrying a short-lived intent cookie whose value is
the session's own hash — so the intent is worth nothing in anybody else's browser).

Local accounts are the door with the most machinery behind it, all of it in `core/auth/`: scrypt from
`node:crypto` in a self-describing stored format so the cost can be raised without a migration, a lockout
curve counted on the row being attacked rather than on an address, a signed proof-of-work challenge in front
of sign-up so an open registration endpoint is not free to script against, and uniqueness enforced on a
**folded nickname key** rather than `COLLATE NOCASE`, which folds ASCII only and would let `Вася` and `вася`
be two accounts. **There is no password recovery, by design** — no email address is collected, and the
sign-up form says so before anybody commits.

`core/auth/steam.ts` holds the protocol with the network taken out, which is what makes the parts worth being
sure about testable without a socket:

- what a callback must contain before it is worth asking Steam about at all;
- that every signed field is echoed back **byte for byte** — the signature covers those exact values, so
  normalising or reordering one turns a valid login into an invalid one;
- that a claimed identity is anchored `https://steamcommunity.com/openid/id/<digits>`, so
  `https://evil.example/steamcommunity.com/openid/id/1` is not a sign-in.

Nothing in the callback is believed until Steam has vouched for it, and the claimed id is only parsed *after*
that. The return URL is built from `SITE_ORIGIN` rather than from the request, and that is load-bearing:
Steam echoes `openid.return_to` back as one of the signed fields, so an attacker who could influence it would
receive a valid assertion at an address of their choosing.

`STEAM_API_KEY` is **optional, including in production.** It buys one call to `GetPlayerSummaries` for a
display name and an avatar, made *after* OpenID has already established who somebody is. Without it the
strategy reads the **public community profile** (`/profiles/<id>?xml=1`), which has carried the same two
fields since before that API existed — so an unconfigured deployment still shows real names and real
pictures. Only when both routes come back empty (a private profile, a network failure) does somebody get a
persona derived from their SteamID. Either way they sign in and own their builds; the key just makes the
lookup the documented one, and works for profiles set to private.

The 64-bit id is stored as **text**, never as a number: `76561198000000000` is past 2^53, so storing it as a
double would round distinct accounts onto each other. Discord's snowflake is text for the same reason.

A session is 32 random bytes in an httpOnly cookie, stored as its SHA-256 so a leaked backup is a list of
hashes rather than a set of live logins. Not a JWT: the usual argument for one is avoiding a database read
per request, and that does not apply to an in-process SQLite file. What server sessions buy instead is
instant revocation — logout everywhere, and a ban that takes effect on the next request rather than at token
expiry.

The cookie is `SameSite=Lax`, which already stops a cross-site POST from carrying it, and the site and API
share an origin, so there is no CORS to configure either. On top of that every mutating request must present
an `Origin` matching `SITE_ORIGIN`. **Those two together are why there is no CSRF token layer** — it would
be a thing to keep working in exchange for nothing.

## Verified accounts, and the comment queue

"Verified" here means one thing: **at least one provider is linked**, which is `select 1 from identities`
and nothing else. It is not a rank, a role or a moderator's opinion, and an unverified account can do
everything — write builds, publish them, comment. The site draws a grey badge beside the nickname, and the
API answers `PublicUser.verified` on every author it returns.

The read paths join that existence check into the page query rather than asking per row: the browse list
draws ten authors and a thread twenty commenters, and a query each is the shape that makes a list slow for
no reason anybody can see. The **write** path asks it directly, once, in `isVerified` — a comment from an
account no provider vouches for is stored with `approved_at` null.

A held comment is invisible to the thread and **visible to its author**, the whole time it waits. Hiding it
from everybody is a form that appears to do nothing, which is how somebody ends up posting the same thing
four times; showing it to everybody makes the queue pointless. `listComments` takes the viewer for exactly
this, an admin sees the queue in place (approving what you cannot read is not moderation), and the DTO
carries `pending` so the site can label it. The comment count beside a build counts approved rows only — a
number promising a conversation that is not there is worse than no number.

**A link is one-way.** `UNLINKING_ENABLED` in `AuthService` is false, so
`POST /api/auth/<provider>/unlink` refuses and the site draws no button for it:
the badge a link grants is what lets a comment skip the queue, so a provider
account that could be detached could be spent again on the next profile.
`unlinkIdentity` is kept whole and tested — including its refusal to remove the
last way into an account — because a moderator-facing "detach this" is the
obvious next use for it, and the flag is the only thing between the two.

`GET /api/comments/pending` is the queue and `POST /api/comments/:id/approve` is the verdict, both admin
only. There is no "reject": deleting a comment is already a button on the comment itself, in the thread
where there is enough context to judge one.

## Comments are plain text

Never HTML, never markdown. Item descriptions in this project are already HTML from the game data and go
through a rich-text parser; user-submitted text does not get that path, which removes the XSS surface rather
than filtering it.

## Rate limiting, in two buckets

`src/throttle.ts`. `@nestjs/throttler` with its in-memory store, which is the right store for one instance —
a Redis one buys nothing until this runs on two nodes.

Requests are counted per *account* when there is a session and per *address* when there is not. Either one
alone is wrong: an IP key throttles a signed-in regular because a stranger shares their NAT, and a user key
has nothing to count anonymous traffic by, which is most of it.

| Bucket | Budget | Keyed by | Can a route change it? |
| --- | --- | --- | --- |
| `default` | 120/min | caller **and handler** | yes, with `@Throttle({ default: … })` |
| `global` | 300/min | caller only | no |

Nest keys each bucket by handler, so `default` alone is a floor *per route* — a caller that walks ten
endpoints gets ten times the budget, and every `@Throttle` on a route can only widen its own. `global` drops
the handler from its key, so it is the ceiling a controller cannot raise. Writes declare their own `default`
on top: ten new builds an hour, five comments in ten minutes, twenty sign-in starts in ten.

`/api/health` is `@SkipThrottle()`, because the compose healthcheck and `infra/deploy.sh` both poll it and a
429 there is an orchestrator restarting a server that was fine.

A refused request is a **429 with `code: "RATE_LIMITED"`** and a `Retry-After` in seconds, like every other
failure in `aow5-api-contract` — the library's own exception body would have reached the site as a generic
400 shape, which is what the guard's `throwThrottlingException` override exists to prevent.

Two body caps sit in front of all of it: `request_body max_size 64KB` in `infra/Caddyfile`, so an oversized
post is dropped at the edge without waking Node, and `32kb` on the JSON parser in `src/main.ts`, which is the
one that returns an error a person can read. Both depend on `app.set('trust proxy', 1)` being right — without
it `req.ip` is Caddy's and the whole internet shares one bucket.

## Known gaps

- **The frozen tables are bundled at build time**, so a `parser/` data refresh needs the API image rebuilt or
  newly-appended indices are recorded as unknown in derived facets. `infra/deploy.sh` rebuilds both images
  anyway, so this is a note rather than a mechanism.
- **A build's `tier` is the author's own answer**, checked against the rooms they named rather than copied
  from them: every room on a build must belong to the chosen tier, which `categoryOfMap` in `aow5-shared`
  decides. That table carries the site's curation — three rooms are played at a different tier from the one
  the game data claims, and three more are events — so a curation change makes stored tiers disagree with it
  until they are backfilled. A rare migration, rather than a join that is slow forever.
