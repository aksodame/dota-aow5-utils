# Contributing to the AOW5 builds API

[`README.md`](README.md) says what this is and why it is shaped the way it is — read the part covering what
you are touching. This file is the working agreement.

The site has its own: [`apps/webapp/CONTRIBUTING.md`](../webapp/CONTRIBUTING.md). Its four rules about
shared links bind this API too, and they are restated below because breaking one from the server side is
easier and quieter.

## Where your change belongs

| you want to change | it lives in |
|---|---|
| Anything worth a test — validation, queries, the codec check, the password hash, the proof of work | `core/` |
| Routing, status codes, guards, DI wiring | `src/` |
| The schema | `core/db/schema.ts`, then `pnpm --filter aow5-utils-api db:generate` |
| A virtual table, a trigger, a backfill | a hand-written migration — drizzle-kit cannot see them |
| The shapes or limits the site also knows | `packages/aow5-api-contract` |
| The board, the codec, the id tables | `packages/aow5-shared` — and read the site's CONTRIBUTING first |

Dependencies run one way: this app may import `aow5-shared` and `aow5-api-contract`, and **may never import
from `apps/webapp` or `apps/tracker`**.

## The rules that break other people's links

Restated from the site's guide, because this is the other place they can be broken:

1. **`data/id-table.json` and `data/ability-table.json` are frozen and append-only.** The API only ever
   reads them.
2. **A codec version bump requires no change here, and must not get one.** `payload` is text; a v7 link
   stores exactly like a v6 one. Never write a migration that rewrites stored payloads.
3. **The fragment belongs to the planner.** Nothing this API returns puts a board in a URL fragment, and no
   route it defines is reachable by one.
4. **Validate by decoding, never by re-encoding.** `encodeBuild(decodeBuild(p))` legitimately differs for
   v1–v5, so a byte-equality check would reject good links. `core/codec/validatePayload.ts` stores what it
   was given.

## The other invariants

- **`core/` imports nothing from `@nestjs/*`.** Not "should not" — cannot: Node strips types but not
  decorators, so a test importing a Nest file fails to load. This is why `erasableSyntaxOnly` is off in this
  package's tsconfig and nowhere else, and the comment there explains it.
- **`src/` does no thinking.** A controller reads the request, calls `core/`, and maps the result onto a
  status code. If you want to test something in `src/`, move it.
- **Every failure is an `ApiException`** with a stable `code` from `aow5-api-contract`. The site switches on
  the code, never the message — messages are for a network tab and are not translated.
- **Comments and titles are plain text.** No HTML, no markdown, no sanitiser to keep correct.
- **Never trust a client-supplied board.** It goes through `validatePayload` before it goes anywhere near a
  row.
- **Counters move in the same transaction as the row that changes them.** A list query must never `COUNT(*)`.
- **Injection tokens live in `src/db/tokens.ts`, never in a module file.** A token exported from the same
  module as a provider that injects it is a cycle, and the error it produces at boot names a `Function`
  rather than anything you could search for. `pnpm --filter aow5-utils-api smoke` is what catches it.
- **`pnpm build` must stay green, including `verify-bundle`.** If it fails saying a workspace package escaped
  the bundle, the fix is `noExternal` in `tsup.config.ts` — not the allowlist.

## Tests

`node --test`, no framework, same as the rest of the repo. The glob **is** the contract:

| package | glob |
|---|---|
| `aow5-utils-api` | `core/**/*.test.ts` |

Tests run against `:memory:` databases built by applying the real committed migrations, so a migration that
does not apply is a test failure rather than a deploy failure.

Anything touching the schema, the payload check, the slug alphabet, the FTS query builder, the password
hash, the proof of work or the nickname rules needs a test. Wiring in `src/` does not — but if it feels
like it does, see above.

## Schema changes

1. Edit `core/db/schema.ts`.
2. `pnpm --filter aow5-utils-api db:generate`, then **read the generated SQL** — check constraints and partial
   indexes are easy to lose.
3. Rename the generated file to something a human would name, and update the tag in `drizzle/meta/_journal.json`.
4. Add or extend a test in `core/db/schema.test.ts` that proves the new constraint actually constrains.

**`drizzle/meta/` is stale, and knowing that will save you an afternoon.** It holds only
`0000_snapshot.json`; `0001`, `0002` and `0003` were all hand-written, because drizzle-kit cannot see a
virtual table, a trigger, or a table being dropped and rebuilt. So the generator's idea of the schema is
three migrations behind, and what it emits will include changes that have already happened — re-dropping
`builds.summary`, for one, which fails against any real database. Read what it writes; on anything
structural, hand-write the file instead and add the journal entry yourself.

Two more things the runtime does that a generated migration would get wrong:

- **All pending migrations run inside one `BEGIN…COMMIT`.** `PRAGMA foreign_keys` is a documented no-op
  inside a transaction, so the `PRAGMA foreign_keys=OFF` drizzle-kit writes above a table recreate does
  *nothing* — and the `DROP TABLE` under it runs with cascades live.
- **`builds_fts` is external-content FTS5 kept in step by triggers on `builds`.** An explicit `DELETE FROM
  builds` fires them; the implicit delete inside `DROP TABLE` is not guaranteed to. If a migration removes
  builds by any route, finish with `INSERT INTO builds_fts(builds_fts) VALUES('rebuild')`.

Migrations are forward-only and run at boot. A destructive one is a decision, not a step: `infra/deploy.sh`
snapshots the database before every deploy precisely so one can be undone.

## Branches and commits

Branch off `master`, named `<area>/<slug>` — `api/local-accounts`, `api/fts-search`. Commit subjects match the
log: one line, capitalized, no trailing period, saying what changed.

## Opening the pull request

Use the site's template, and replace *Copy and languages* with these when they apply:

```markdown
## Schema impact

- Migration: none / `NNNN_name.sql`, what it does
- Destructive: no / yes and why
- New constraint: what it makes impossible, and the test that proves it

## Contract impact

- `aow5-api-contract`: unchanged / added X
- Does the site need a matching change to ship at the same time?
```

## What gets a PR sent back

- a Nest import under `core/`, or logic worth testing under `src/`
- a new endpoint with no rate limit
- an error thrown as a bare `HttpException` instead of an `ApiException` with a code
- a query that trusts a client-supplied payload, slug or id without checking its shape
- a schema change with no generated migration, or a generated migration nobody read
- markdown or HTML rendering added to user-submitted text
