/**
 * Reads the old site's database and writes what the new one should hold.
 *
 * Half of a one-shot migration. This half is the part that needs the old
 * schema and the old codec, so it runs against a *copy* of the old database
 * and never against the live one; `legacy-import.ts` is the other half and
 * needs neither. Between them sits a JSON bundle you can read, diff and
 * check before anything is written anywhere.
 *
 *   node scripts/legacy-export.ts ../../old-aow5.db --out=legacy-bundle.json
 *
 * ## What it does to a guide
 *
 * A v6 board was up to nine **sections**, each a full loadout with its own
 * name and its own spells, all hanging off one row. The new model has no such
 * thing: a build is one loadout, which is what makes it filterable by tier and
 * sortable by price. So each section becomes a guide of its own — an eight
 * section board comes out as eight builds, all by the same author, each
 * carrying that section's items and abilities and nothing else.
 *
 * That is the only honest reading. Keeping the first section and dropping the
 * rest would throw away most of what people wrote, and merging them cannot be
 * done at all — they are alternatives, not parts.
 *
 * ## What has to be invented, and what does not
 *
 * The loadout itself is carried across exactly: the fifteen slot positions are
 * the same fifteen in both models, in the same order, so a section's gear
 * lands in the slots it was in. The ability keys are the same seven in the
 * same wire order too. Nothing is re-homed and nothing is guessed there.
 *
 * **Tier** and **price** are invented, because the old model stored neither and
 * the new one refuses to publish without both. `legacy/derive.ts` holds that
 * guessing and explains each rule; a section whose tier cannot be read is
 * exported as a draft rather than filed under a tier nobody claimed.
 *
 * **Rooms** are left empty. A guide may legitimately name none, the old model
 * had no such field, and inferring a room from a tier would be putting words
 * in an author's mouth about the one thing the new browse page filters on.
 *
 * **Likes and comments are not carried.** A like was cast on the whole board,
 * and there is no defensible way to decide which of eight new guides inherits
 * it — dividing it is wrong and duplicating it is worse.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { MAX_TITLE } from 'aow5-api-contract';
import { createEmptyState, encodeBuild } from 'aow5-shared/codec';
import { ID_TABLE, HERO_TABLE } from '../core/codec/tables.ts';
import { validatePayload } from '../core/codec/validatePayload.ts';
import { nicknameKey } from '../core/auth/nickname.ts';
import { decodeLegacyPayload, type LegacySlot } from './legacy/v6.ts';
import { priceOfSlots, tiersForBoard, type Tier, type TierSource } from './legacy/derive.ts';

const args = process.argv.slice(2);
const dbPath = args.find((a) => !a.startsWith('--'));
if (dbPath === undefined) {
  console.error('usage: node scripts/legacy-export.ts <old-database.db> [--out=legacy-bundle.json] [--exclude=Name,Name]');
  process.exit(2);
}
const outPath = args.find((a) => a.startsWith('--out='))?.slice('--out='.length) ?? 'legacy-bundle.json';
/*
 * Accounts that must not come across, by nickname.
 *
 * Defaults to the site owner's, whose guides were re-published by hand on the
 * new site before this existed — importing them again would duplicate every
 * one of them under a second account.
 */
const excluded = new Set(
  (args.find((a) => a.startsWith('--exclude='))?.slice('--exclude='.length) ?? 'MacerMacula')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== ''),
);

/** Item shop costs, which is all `price` can be estimated from. See `derive.ts`. */
const itemIndex = JSON.parse(
  readFileSync(new URL('../node_modules/aow5-shared/public/data/items.index.json', import.meta.url), 'utf8'),
) as { rows: [number, string, string, number, number, number, string, number][] };
const costs = new Map(itemIndex.rows.map((row) => [row[1], row[5] ?? 0]));
const costOf = (id: string): number => costs.get(id) ?? 0;

const tables = {
  itemIds: ID_TABLE.ids,
  abilityIds: HERO_TABLE.abilityIds,
  /* The hero byte is a 1-based roster position, and `HERO_TABLE.heroIds` is
   * that roster — unlike `mapIds`, which carries a pushed-on hole. */
  heroIds: HERO_TABLE.heroIds,
};

/** Counts code points, so a Cyrillic title gets the same budget as a Latin one. */
const textLength = (value: string): number => [...value].length;

/** Trims to the limit on a code-point boundary, with an ellipsis when it bites. */
function clamp(value: string, limit: number): string {
  const chars = [...value];
  return chars.length <= limit ? value : chars.slice(0, limit - 1).join('').trimEnd() + '…';
}

/**
 * What one section gets called.
 *
 * A single-section board keeps its title unchanged — there is nothing to tell
 * apart, and appending `(1/1)` to it would be noise. Everything else needs to
 * be distinguishable in a list of five by the same author, so the section's own
 * heading is appended where it has one and its position where it does not.
 */
function titleFor(buildTitle: string, sectionName: string | null, index: number, total: number): string {
  if (total === 1) return clamp(buildTitle, MAX_TITLE);
  const suffix = sectionName !== null && sectionName.trim() !== '' ? sectionName.trim() : `${index + 1}/${total}`;
  const combined = `${buildTitle} — ${suffix}`;
  // The heading alone beats a title cut off mid-word: it is the half that says
  // which of the author's guides this one is.
  if (textLength(combined) <= MAX_TITLE) return combined;
  return clamp(textLength(suffix) <= MAX_TITLE ? suffix : combined, MAX_TITLE);
}

interface OldUser {
  id: number;
  nickname: string;
  nickname_key: string;
  password_hash: string;
  failed_attempts: number;
  locked_until: number | null;
  role: string;
  banned_at: number | null;
  created_at: number;
}

interface OldBuild {
  id: number;
  slug: string;
  user_id: number;
  title: string;
  body: string;
  payload: string;
  referral: string | null;
  codec_version: number;
  hero_id: string | null;
  section_count: number;
  status: string;
  published_at: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

const sqlite = new Database(dbPath, { readonly: true });

const oldUsers = sqlite.prepare(`SELECT * FROM users`).all() as OldUser[];
/*
 * Soft-deleted builds are left behind: their author deleted them, and a
 * migration is not the moment to undo that. Drafts come across as drafts.
 */
const oldBuilds = sqlite
  .prepare(`SELECT * FROM builds WHERE deleted_at IS NULL ORDER BY id`)
  .all() as OldBuild[];

const byId = new Map(oldUsers.map((user) => [user.id, user]));

const users = oldUsers
  .filter((user) => !excluded.has(user.nickname))
  .map((user) => ({
    legacyId: user.id,
    nickname: user.nickname,
    /*
     * Recomputed rather than copied. The old column was written by the same
     * `nicknameKey` this imports, so the two agree — but the uniqueness of
     * every account on the new site rests on this value, and deriving it here
     * means the import cannot carry a key that disagrees with its own nickname.
     */
    nicknameKey: nicknameKey(user.nickname),
    /*
     * The scrypt hash, verbatim. This is the whole reason the import reads the
     * old database rather than its public API: without it every one of these
     * accounts would arrive with no way to sign into it, and the guides would
     * belong to people who could never edit them again. The format is
     * self-describing and unchanged, so these verify as they always did.
     */
    passwordHash: user.password_hash,
    failedAttempts: user.failed_attempts,
    lockedUntil: user.locked_until,
    role: user.role === 'admin' ? 'admin' : 'user',
    bannedAt: user.banned_at,
    createdAt: user.created_at,
  }));

const kept = new Set(users.map((user) => user.legacyId));

interface ExportedGuide {
  legacySlug: string;
  legacyTitle: string;
  section: number;
  sections: number;
  authorLegacyId: number;
  title: string;
  body: string;
  payload: string;
  tier: Tier | null;
  tierSource: TierSource;
  price: number;
  referral: string;
  status: 'draft' | 'published';
  publishedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

const guides: ExportedGuide[] = [];
const skipped: { slug: string; reason: string }[] = [];

for (const build of oldBuilds) {
  const author = byId.get(build.user_id);
  if (author === undefined) {
    skipped.push({ slug: build.slug, reason: `author ${build.user_id} is missing` });
    continue;
  }
  if (!kept.has(build.user_id)) {
    skipped.push({ slug: build.slug, reason: `author ${author.nickname} is excluded` });
    continue;
  }

  const decoded = decodeLegacyPayload(build.payload, tables);
  if (!decoded.ok) {
    skipped.push({ slug: build.slug, reason: decoded.reason });
    continue;
  }

  const { sections, hero, heroUnknown } = decoded.board;
  const tiers = tiersForBoard(
    sections.map((section) => section.name),
    build.title,
  );

  sections.forEach((section, index) => {
    /*
     * A section with nothing in it is a card the author added and never
     * filled. It carried no information on the old site and would be an empty
     * guide on this one.
     */
    const filled = section.slots.filter((slot) => slot !== null).length;
    const spells = section.spells.filter((spell) => spell !== null).length;
    if (filled === 0 && spells === 0 && (section.name ?? '') === '') return;

    const state = createEmptyState();
    state.hero = hero;
    state.heroUnknown = heroUnknown;
    // Same fifteen positions in both models, so this is a copy and not a remap.
    section.slots.forEach((slot, at) => {
      state.slots[at] = slot as LegacySlot | null;
    });
    // Same seven keys in the same wire order, so this is a copy too.
    section.spells.forEach((spell, at) => {
      state.spells[at] = spell as LegacySlot | null;
    });

    const payload = encodeBuild(state, ID_TABLE, HERO_TABLE);
    /*
     * Decoded with the live validator before it is written anywhere. An import
     * that produces a payload the running server would reject is an import that
     * fills the database with rows whose own pages will not render.
     */
    const check = validatePayload(payload, ID_TABLE, HERO_TABLE);
    if (!check.ok) {
      skipped.push({
        slug: `${build.slug}#${index + 1}`,
        reason: `re-encoded payload rejected: ${JSON.stringify(check.rejection)}`,
      });
      return;
    }

    const { tier, source } = tiers[index]!;
    const price = priceOfSlots(section.slots, costOf);

    guides.push({
      legacySlug: build.slug,
      legacyTitle: build.title,
      section: index + 1,
      sections: sections.length,
      authorLegacyId: build.user_id,
      title: titleFor(build.title, section.name, index, sections.length),
      /*
       * The old body described the whole board, so every guide split out of it
       * gets the same text. Dropping it would lose the author's only prose;
       * splitting it is not possible, since nothing in it says which paragraph
       * belongs to which section.
       */
      body: build.body,
      payload,
      tier,
      tierSource: source,
      price,
      referral: build.referral ?? '',
      /*
       * A published guide stays published only if it can be: the new server
       * requires a tier and a price to publish, and a draft is a far better
       * outcome than a row that exists but breaks the rule its own API
       * enforces. Whatever lands here as a draft is listed in the summary.
       */
      status: build.status === 'published' && tier !== null && price > 0 ? 'published' : 'draft',
      publishedAt: build.published_at,
      createdAt: build.created_at,
      updatedAt: build.updated_at,
    });
  });
}

sqlite.close();

const bundle = {
  source: dbPath,
  excluded: [...excluded],
  users,
  guides,
  skipped,
};

writeFileSync(outPath, JSON.stringify(bundle, null, 2));

const drafts = guides.filter((guide) => guide.status === 'draft');
/*
 * A guide lands as a draft for one of two unrelated reasons, and conflating
 * them reads as a bug in the tier parser when half of them were never the
 * parser's business: it was already a draft on the old site, or its tier could
 * not be read. The first keeps whatever tier was parsed; the second has none.
 */
const noTier = drafts.filter((guide) => guide.tier === null);
const wasDraft = drafts.filter((guide) => guide.tier !== null);
const perAuthor = new Map<number, number>();
for (const guide of guides) perAuthor.set(guide.authorLegacyId, (perAuthor.get(guide.authorLegacyId) ?? 0) + 1);

console.log(`read ${oldUsers.length} accounts and ${oldBuilds.length} builds from ${dbPath}`);
console.log(`exporting ${users.length} accounts (excluded: ${[...excluded].join(', ') || 'none'})`);
console.log(`exporting ${guides.length} guides from ${oldBuilds.length} boards`);
console.log(`most guides by one author: ${Math.max(0, ...perAuthor.values())}`);
if (noTier.length > 0) {
  console.log(`\n${noTier.length} arrive as drafts — no tier could be read, so they cannot be published as-is:`);
  for (const guide of noTier) {
    console.log(`  ${byId.get(guide.authorLegacyId)?.nickname} — ${guide.title}`);
  }
}
if (wasDraft.length > 0) {
  console.log(`\n${wasDraft.length} were already drafts on the old site — kept as drafts, tier prefilled:`);
  for (const guide of wasDraft) {
    console.log(`  ${byId.get(guide.authorLegacyId)?.nickname} — ${guide.title} (tier ${guide.tier})`);
  }
}
if (skipped.length > 0) {
  console.log(`\n${skipped.length} skipped:`);
  for (const entry of skipped) console.log(`  ${entry.slug}: ${entry.reason}`);
}
console.log(`\nwrote ${outPath}`);
