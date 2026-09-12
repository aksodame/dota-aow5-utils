/**
 * Writes the bundle `legacy-export.ts` produced into the live database.
 *
 * The other half of the one-shot migration, and the only half that touches the
 * new site. It knows nothing about the old schema or the old codec — that work
 * is already done and sitting in a JSON file somebody can read — so what
 * happens here is just accounts and builds, through the same `createBuild` the
 * API itself uses.
 *
 *   node scripts/legacy-import.ts legacy-bundle.json --db=./aow5.db --dry-run
 *   node scripts/legacy-import.ts legacy-bundle.json --db=/srv/aow5/data/aow5.db
 *
 * **Take a backup first.** `infra/backup.sh` is the one that works on a live
 * database — the file is in WAL mode, so copying it with `cp` under a running
 * server can produce something that will not open.
 *
 * ## It can be run twice
 *
 * Not by design so much as by necessity: the first real run will find
 * something, and the fix should not be "restore the backup and start again".
 * An account is matched by its folded nickname key and a guide by its author
 * and title, so a second run adds only what the first did not. Nothing is ever
 * updated in place — a guide whose author has since edited it is left alone.
 *
 * ## The build cap, and why this raises it
 *
 * An account gets five builds, plus five per linked provider. These authors
 * have no provider linked, and several wrote boards of six and eight sections
 * — which are six and eight guides here. Importing to the base cap would
 * silently drop the tail of somebody's guide, so the import writes up to
 * `MAX_BUILDS_CEILING`, the highest any account can reach and what the
 * database itself enforces through `builds_slot_range`.
 *
 * The effect is that a migrated author may hold more guides than the editor
 * would let them create today. They cannot add another until they are back
 * under their own limit, which is the ordinary rule doing the ordinary thing.
 */
import { readFileSync } from 'node:fs';
import { and, eq, isNull } from 'drizzle-orm';
import { MAX_BUILDS_CEILING } from 'aow5-api-contract';
import { openDb, runMigrations } from '../core/db/open.ts';
import { migrationsFolder } from '../core/db/migrations.ts';
import { builds, users } from '../core/db/schema.ts';
import { createBuild } from '../core/db/builds.ts';
import { generateSlug } from '../core/builds/slug.ts';
import { validatePayload } from '../core/codec/validatePayload.ts';
import { ID_TABLE, HERO_TABLE } from '../core/codec/tables.ts';

const args = process.argv.slice(2);
const bundlePath = args.find((a) => !a.startsWith('--'));
if (bundlePath === undefined) {
  console.error('usage: node scripts/legacy-import.ts <legacy-bundle.json> [--db=./aow5.db] [--dry-run]');
  process.exit(2);
}
const dbPath = args.find((a) => a.startsWith('--db='))?.slice('--db='.length) ?? './aow5.db';
const dryRun = args.includes('--dry-run');

interface Bundle {
  users: {
    legacyId: number;
    nickname: string;
    nicknameKey: string;
    passwordHash: string;
    failedAttempts: number;
    lockedUntil: number | null;
    role: string;
    bannedAt: number | null;
    createdAt: number;
  }[];
  guides: {
    legacySlug: string;
    section: number;
    authorLegacyId: number;
    title: string;
    body: string;
    payload: string;
    tier: string | null;
    price: number;
    referral: string;
    status: 'draft' | 'published';
    publishedAt: number | null;
    createdAt: number;
    updatedAt: number;
  }[];
}

const bundle = JSON.parse(readFileSync(bundlePath, 'utf8')) as Bundle;

const { db, sqlite } = openDb({ path: dbPath });
runMigrations(db, migrationsFolder(), dbPath);

/** Legacy account id to the id it ended up with here. */
const userIds = new Map<number, number>();
let usersAdded = 0;
let usersMatched = 0;

/*
 * Everything in one transaction. A half-finished import is the one outcome
 * worth engineering against: it leaves accounts with no guides and guides whose
 * author is missing, and the second run would then have to tell those apart
 * from a first run that simply has work left.
 */
const run = sqlite.transaction(() => {
  for (const user of bundle.users) {
    const existing = db.select().from(users).where(eq(users.nicknameKey, user.nicknameKey)).get();
    if (existing !== undefined) {
      // Somebody already holds this name here — either a previous run of this
      // script, or a person who signed up on the new site under the same name.
      // Either way the row is theirs and is not rewritten.
      userIds.set(user.legacyId, existing.id);
      usersMatched += 1;
      continue;
    }

    /*
     * The old id is kept when it is free, purely so the two databases can be
     * compared afterwards by eye. When it is taken — the new site has its own
     * accounts, numbered from one — SQLite assigns the next one instead, and
     * nothing downstream cares, because every reference below goes through
     * `userIds` rather than through the number in the bundle.
     */
    const taken = db.select({ id: users.id }).from(users).where(eq(users.id, user.legacyId)).get() !== undefined;

    const created = db
      .insert(users)
      .values({
        ...(taken ? {} : { id: user.legacyId }),
        nickname: user.nickname,
        nicknameKey: user.nicknameKey,
        // Carried verbatim, which is what lets these people still sign in.
        passwordHash: user.passwordHash,
        failedAttempts: user.failedAttempts,
        lockedUntil: user.lockedUntil,
        avatar: '',
        role: user.role === 'admin' ? 'admin' : 'user',
        bannedAt: user.bannedAt,
        createdAt: user.createdAt,
        updatedAt: user.createdAt,
      })
      .returning()
      .get();

    userIds.set(user.legacyId, created.id);
    usersAdded += 1;
  }

  let added = 0;
  let already = 0;
  const failures: string[] = [];

  for (const guide of bundle.guides) {
    const userId = userIds.get(guide.authorLegacyId);
    if (userId === undefined) {
      failures.push(`${guide.title}: author ${guide.authorLegacyId} was not imported`);
      continue;
    }

    // Author plus title is what makes a second run safe. Titles are unique per
    // author within one bundle, because each carries its section's heading.
    const duplicate = db
      .select({ id: builds.id })
      .from(builds)
      .where(and(eq(builds.userId, userId), eq(builds.title, guide.title), isNull(builds.deletedAt)))
      .get();
    if (duplicate !== undefined) {
      already += 1;
      continue;
    }

    const check = validatePayload(guide.payload, ID_TABLE, HERO_TABLE);
    if (!check.ok) {
      failures.push(`${guide.title}: payload rejected — ${JSON.stringify(check.rejection)}`);
      continue;
    }

    const created = createBuild(
      db,
      {
        userId,
        slug: generateSlug(),
        fields: { title: guide.title, body: guide.body },
        payload: guide.payload,
        referral: guide.referral,
        price: guide.price,
        tier: guide.tier as never,
        // Not chosen. The build page then reads the headline ability off the
        // kit in order, which is what it did for every build written before
        // the column existed — and is a better answer than picking one here.
        mainSpell: null,
        video: null,
        facets: check.facets,
        status: guide.status,
      },
      // `createBuild` stamps created/updated/published from this one argument,
      // so the original creation time goes in and the other two are corrected
      // below. Passing the real date matters: it is what `sort=new` orders on,
      // and importing everything with today's date would bury the new site's
      // own builds under a wall of five-month-old guides.
      guide.createdAt,
      MAX_BUILDS_CEILING,
    );

    if (created === 'limit-reached') {
      failures.push(`${guide.title}: author ${userId} has no free slot (ceiling is ${MAX_BUILDS_CEILING})`);
      continue;
    }

    /*
     * The two timestamps `createBuild` could not be told separately. Done as an
     * update rather than by widening its signature: this is the only caller in
     * the project that wants to set them, and a migration script is not a
     * reason to put a back door into the function the API writes through.
     */
    db.update(builds)
      .set({
        updatedAt: guide.updatedAt,
        publishedAt: guide.status === 'published' ? (guide.publishedAt ?? guide.createdAt) : null,
      })
      .where(eq(builds.id, created.id))
      .run();

    added += 1;
  }

  console.log(`accounts: ${usersAdded} added, ${usersMatched} already here`);
  console.log(`guides:   ${added} added, ${already} already here`);
  if (failures.length > 0) {
    console.log(`\n${failures.length} could not be written:`);
    for (const failure of failures) console.log(`  ${failure}`);
  }

  if (dryRun) {
    console.log('\n--dry-run: rolling back, nothing was written');
    throw new DryRun();
  }
});

/** Thrown to roll the transaction back on a dry run. Not an error. */
class DryRun extends Error {}

try {
  run();
  if (!dryRun) console.log(`\nwritten to ${dbPath}`);
} catch (error) {
  if (!(error instanceof DryRun)) throw error;
} finally {
  sqlite.close();
}
