# The AOW5 builds API

The server behind `/builds` and `/builds/<slug>` on the site: accounts, saved builds, comments and
votes, over one SQLite file. It is what turns the planner from a thing that encodes a board into a URL into
a thing that also keeps builds other people can find.

The planner itself does not depend on any of this. A `#b=` link still decodes with no account and no
network, exactly as before, and that is not going to change — see *What this must not break* below.

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
          builder, the password hash, the proof of work, the schema, the queries.
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
planner renders it with. Both workspace packages ship as **raw TypeScript** — that is their design and
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
breaks the fourth link invariant. Everything queryable — hero, codec version, section and item counts — is
derived once at write time into plain columns, so a browse query decodes nothing.

**The five-build cap is a constraint, not a check.** Every build takes a `slot` between 0 and 4, with a
`UNIQUE INDEX (user_id, slot) WHERE deleted_at IS NULL`. A sixth build has no free slot and the database
refuses the insert; the API still counts first so the user gets a sentence instead of a constraint error,
but the guarantee is in the schema. Soft-deleting frees the slot immediately, because the index is partial.

**Deletes are soft.** A shared `/builds/<slug>` must be able to say the build was deleted rather than be
indistinguishable from a typo, a removed comment must not reshuffle the thread around it, and a banned user's
content has to stay readable by a moderator.

**`foreign_keys = ON`.** SQLite has it off by default, which would make every `references()` in the schema
decoration and every cascade a no-op. It is set in `core/db/open.ts` alongside WAL, a busy timeout, and
`synchronous = NORMAL`; there is a test that asserts a cascade actually cascades, because the failure mode
is silence.

**Migrations run at boot**, from the committed SQL in `drizzle/`. Correct because there is exactly one
instance: the container that serves the code is the one that migrated the schema, and there is no separate
step to forget. Note that drizzle-kit does not manage virtual tables or triggers — the FTS5 index is a
hand-written migration, so an empty `db:generate` diff does not mean nothing changed.

## What this must not break

`apps/webapp/CONTRIBUTING.md` lists four rules that keep an already-shared link decoding. This API touches
all four and is bound by all four:

1. **The frozen tables are read-only here.** `core/codec/tables.ts` loads them and nothing writes them.
2. **A codec version bump needs no migration here.** `payload` is text and `codec_version` is informational.
   The API must never "upgrade" a stored payload.
3. **Build URLs are paths.** `/builds/<slug>` carries no fragment. The fragment belongs to the planner.
4. **Validate by decoding, never by re-encoding.** An index a newer deployment understands and this one does
   not has to survive storage byte-for-byte. Note that `encodeBuild(decodeBuild(p))` legitimately differs for
   v1–v5 payloads, since those migrate on decode — so a byte-equality check would reject good links and is
   not performed at all.

## Sessions, and why there is no CSRF token

Sign-in is a nickname and a password, checked here. There is no identity provider, no OAuth, and nothing to
configure: an account is a row, and `core/auth/` is the whole of it — scrypt out of `node:crypto` for the
hash, a self-describing stored format so the cost can be raised later without a migration, and a
proof-of-work challenge in front of sign-up so an open registration endpoint is not free to script against.

**There is no password recovery, by design.** No email address is collected, so there is nothing to send a
reset link to, and the sign-up form says so before anybody commits. The nickname rules in
`core/auth/nickname.ts` allow Cyrillic and refuse a name that mixes it with Latin, which is what stops the
cheapest impersonation trick; uniqueness is enforced on a folded key rather than by `COLLATE NOCASE`, which
folds ASCII only and would let `Вася` and `вася` be two accounts.

A session is 32 random bytes in an httpOnly cookie, stored as its SHA-256 so a leaked backup is a list of
hashes rather than a set of live logins. Not a JWT: the usual argument for one is avoiding a database read
per request, and that does not apply to an in-process SQLite file. What server sessions buy instead is
instant revocation — logout everywhere, and a ban that takes effect on the next request rather than at token
expiry.

The cookie is `SameSite=Lax`, which already stops a cross-site POST from carrying it, and the site and API
share an origin, so there is no CORS to configure either. On top of that every mutating request must present
an `Origin` matching `SITE_ORIGIN`. **Those two together are why there is no CSRF token layer** — it would
be a thing to keep working in exchange for nothing.

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

- **Slot-kind masks are not loaded server-side.** They live in `items.index.json` (95 kB) and the codec needs
  them only to re-home the flat slots of a pre-v3 link into typed ones. Without them a v1 or v2 payload's
  *derived facets* may not match what the planner shows. The payload still round-trips untouched, and links
  written since v3 are unaffected. Revisit if a browse filter ever looks wrong on an old build.
- **The frozen tables are bundled at build time**, so a `parser/` data refresh needs the API image rebuilt or
  newly-appended indices are recorded as unknown in derived facets. `infra/deploy.sh` rebuilds both images
  anyway, so this is a note rather than a mechanism.
