/**
 * Builds a stand-in for the old site's database, from its public API.
 *
 * A rehearsal aid, not part of the migration. The real import reads a copy of
 * the old server's SQLite file; this makes something shaped like that file out
 * of what the old site will hand anybody over HTTP, so the whole pipeline can
 * be run and looked at without touching the old server at all.
 *
 *   node scripts/legacy-fixture.ts --out=./old-aow5.db
 *
 * **The passwords in it are fake and are the one thing it cannot fake well.**
 * The public API does not expose password hashes — that is the entire reason
 * the real migration needs the database file — so every account here gets a
 * scrypt hash of the same throwaway password, printed at the end. That makes
 * the local site signable-into for checking that an imported author can still
 * edit their guides. It means nothing about the real ones.
 *
 * It also only sees what the API lists: published builds. Drafts and
 * soft-deleted rows exist only in the real file.
 */
import { writeFileSync, rmSync } from 'node:fs';
import { openDb, runMigrations } from '../core/db/open.ts';
import { hashPassword } from '../core/auth/password.ts';
import { nicknameKey } from '../core/auth/nickname.ts';

const args = process.argv.slice(2);
const out = args.find((a) => a.startsWith('--out='))?.slice('--out='.length) ?? './old-aow5.db';
const migrations =
  args.find((a) => a.startsWith('--migrations='))?.slice('--migrations='.length) ?? './legacy-drizzle';
const origin =
  args.find((a) => a.startsWith('--origin='))?.slice('--origin='.length) ?? 'https://dota-aow5-utils.duckdns.org';

/** The password every fixture account gets. Local only; see the note above. */
const FIXTURE_PASSWORD = 'legacy-preview-pw';

interface ListItem {
  slug: string;
  author: { id: number; nickname: string };
}

interface Detail {
  slug: string;
  title: string;
  body: string;
  payload: string;
  referral: string | null;
  codecVersion: number;
  heroId: string | null;
  sectionCount: number;
  itemCount: number;
  status: string;
  likeCount: number;
  commentCount: number;
  publishedAt: number | null;
  createdAt: number;
  updatedAt: number;
  author: { id: number; nickname: string };
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${origin}${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

console.log(`reading ${origin} …`);

const list: ListItem[] = [];
let cursor: string | undefined;
do {
  const page = await fetchJson<{ items: ListItem[]; cursor?: string }>(
    `/api/builds?limit=50${cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`}`,
  );
  list.push(...page.items);
  cursor = page.cursor ?? undefined;
} while (cursor !== undefined);

const details: Detail[] = [];
for (const item of list) {
  details.push(await fetchJson<Detail>(`/api/builds/${item.slug}`));
}
console.log(`fetched ${details.length} builds`);

// Start from nothing, so a re-run is not an append onto a half-built fixture.
for (const suffix of ['', '-wal', '-shm']) rmSync(`${out}${suffix}`, { force: true });

const { db, sqlite } = openDb({ path: out });
runMigrations(db, migrations, out);

const hash = await hashPassword(FIXTURE_PASSWORD);

/** Accounts, with the earliest build they wrote standing in for a join date. */
const authors = new Map<number, { nickname: string; createdAt: number }>();
for (const build of details) {
  const seen = authors.get(build.author.id);
  if (seen === undefined || build.createdAt < seen.createdAt) {
    authors.set(build.author.id, { nickname: build.author.nickname, createdAt: build.createdAt });
  }
}

const insertUser = sqlite.prepare(
  `INSERT INTO users (id, nickname, nickname_key, password_hash, failed_attempts, locked_until, role, banned_at, created_at)
   VALUES (?, ?, ?, ?, 0, NULL, 'user', NULL, ?)`,
);
for (const [id, author] of authors) {
  insertUser.run(id, author.nickname, nicknameKey(author.nickname), hash, author.createdAt);
}

const insertBuild = sqlite.prepare(
  `INSERT INTO builds (slug, user_id, slot, title, body, payload, referral, codec_version, hero_id,
                       section_count, item_count, status, like_count, dislike_count, comment_count,
                       view_count, published_at, created_at, updated_at, deleted_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?, NULL)`,
);
/** The old cap was five per account, and the slot is what enforced it. */
const slots = new Map<number, number>();
for (const build of details) {
  const slot = slots.get(build.author.id) ?? 0;
  slots.set(build.author.id, slot + 1);
  insertBuild.run(
    build.slug,
    build.author.id,
    slot,
    build.title,
    build.body,
    build.payload,
    build.referral ?? '',
    build.codecVersion,
    build.heroId,
    build.sectionCount,
    build.itemCount,
    build.status,
    build.likeCount,
    build.commentCount,
    build.publishedAt,
    build.createdAt,
    build.updatedAt,
  );
}

sqlite.close();

writeFileSync(
  `${out}.README`,
  `Fixture built from ${origin} by scripts/legacy-fixture.ts.\n` +
    `Every account's password is: ${FIXTURE_PASSWORD}\n` +
    `The real migration reads the real database; these hashes are not real.\n`,
);

console.log(`${authors.size} accounts and ${details.length} builds -> ${out}`);
console.log(`every fixture account's password is ${FIXTURE_PASSWORD} (local only)`);
