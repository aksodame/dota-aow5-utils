/**
 * Fills a development database with builds worth looking at.
 *
 * Sign-in goes through Steam, which a laptop cannot do against localhost — so
 * without this there is no way to get a build into a dev database at all, and
 * the browse page, the filters and the build page all render their empty state
 * forever.
 *
 * It goes through the same core modules the API does — `signInWithProvider`,
 * `createBuild`, `validatePayload`, `generateSlug` — rather than raw SQL, so
 * anything this produces is something the server could have produced. That is
 * not fussiness: the first attempt at this wrote its own readable slugs, and
 * `seed0001` and `enderTemple` both contain characters base58 excludes, so
 * every row it made was listed by the browse query and then 404ed on its own
 * page. Using the real generator makes that unrepresentable.
 *
 * Everything but the slugs is deterministic, so two runs with the same count
 * produce the same builds and a screenshot stays reproducible.
 *
 *   node scripts/seed-dev.ts                    # ./aow5.db, 12 builds
 *   node scripts/seed-dev.ts --count=60         # enough to page through
 *   node scripts/seed-dev.ts --reset --count=60 # empty it first
 *   node scripts/seed-dev.ts ./other.db
 */
import { dirname } from 'node:path';
import { createBuild } from '../core/db/builds.ts';
import { addComment } from '../core/db/comments.ts';
import { generateSlug } from '../core/builds/slug.ts';
import { setLike } from '../core/db/likes.ts';
import { openDb, runMigrations } from '../core/db/open.ts';
import { signInWithProvider } from '../core/db/identities.ts';
import { createLocalUser, isVerified } from '../core/db/users.ts';

/**
 * Not a real hash, and it does not need to be: nothing signs into a seeded
 * local account. What the column does here is mark the account as one that has
 * a password — which is what makes it a door, and what keeps `unlinkIdentity`
 * from being the last one.
 */
const SEED_PASSWORD_HASH = 'seed$not-a-real-hash';
import { validatePayload } from '../core/codec/validatePayload.ts';
import { HERO_TABLE, ID_TABLE } from '../core/codec/tables.ts';
import { builds, comments, likes, users } from '../core/db/schema.ts';
import { createEmptyState, encodeBuild, groupsInPanel } from 'aow5-shared/codec';
import { TIER_KEYS, categoryOfMap, listedMaps, seasonsOfHero, tierShort, type SeasonKey } from 'aow5-shared/data';
import { ABILITY_SLOTS, SLOT_KIND } from 'aow5-shared/types';
import { MAX_BUILDS_PER_USER } from 'aow5-api-contract';
import heroes from 'aow5-shared/public/data/heroes.json' with { type: 'json' };
import maps from 'aow5-shared/public/data/maps.json' with { type: 'json' };
import index from 'aow5-shared/public/data/items.index.json' with { type: 'json' };
import names from 'aow5-shared/public/data/locale.en.names.json' with { type: 'json' };
import mapNames from 'aow5-shared/public/data/locale.en.maps.json' with { type: 'json' };
/*
 * The two files a *priority* needs, read rather than imported.
 *
 * `items.full.json` is 1.3 MB and `rolls.json` is the table its stats roll
 * against; importing the first as JSON would hand tsc a megabyte-long literal
 * type for the sake of a dev script.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { ItemFull, RollTables } from 'aow5-shared/types';
import { affixPool } from 'aow5-shared/data';
import type { BuildItemPriority } from 'aow5-api-contract';

const sharedData = dirname(createRequire(import.meta.url).resolve('aow5-shared/package.json')) + '/public/data';
const readData = <T>(file: string): T => JSON.parse(readFileSync(`${sharedData}/${file}`, 'utf8')) as T;
const fullItems = readData<Record<string, ItemFull>>('items.full.json');
const rollTables = readData<RollTables>('rolls.json');

const args = process.argv.slice(2);
const reset = args.includes('--reset');
const countArg = args.find((a) => a.startsWith('--count='))?.slice('--count='.length);
const count = Number(countArg ?? 12);
if (!Number.isInteger(count) || count < 1) throw new Error(`--count must be a positive integer, got ${countArg}`);
const dbPath = args.find((a) => !a.startsWith('--')) ?? './aow5.db';

const NOW = Math.floor(Date.now() / 1000);
const { db } = openDb({ path: dbPath });
runMigrations(db, 'drizzle');

if (reset) {
  // Children first: `builds_fts` is kept in step by AFTER DELETE triggers on
  // builds, and deleting the parent last is what lets them fire.
  db.delete(comments).run();
  db.delete(likes).run();
  db.delete(builds).run();
  db.delete(users).run();
  console.log('reset: every table emptied');
}

const rows = index.rows as Array<[number, string, string, number, number, number, string, number]>;
const nameOf = (id: string) => (names.names as Record<string, string>)[id] ?? id;
const mapNameOf = (id: string) => (mapNames.maps as Record<string, { name: string }>)[id]?.name ?? id;

/** Playable items a slot of this kind accepts, best-quality first. */
function pool(kind: number) {
  return rows.filter((r) => (r[7] & kind) !== 0).sort((a, b) => b[3] - a[3] || b[4] - a[4]);
}

const equipment = pool(SLOT_KIND.EQUIP);
const runeItems = pool(SLOT_KIND.RUNE);
const potions = pool(SLOT_KIND.POTION);
/*
 * Life Souls, and where one is worn.
 *
 * S2 only, and the seed has to reflect that: a soul on a first-season build is
 * a slot the game does not have, and the browse list would be showing something
 * nobody can reproduce.
 */
const souls = pool(SLOT_KIND.SOUL);
const SOUL_SLOT = groupsInPanel('soul')[0]?.start ?? -1;

/**
 * The rooms builds are filed under, in the order the site lists them.
 *
 * Mirrors `apps/webapp/src/lib/maps.ts`: seeding a build under a room the
 * browse filter does not offer produces a row nobody can reach through the UI,
 * which looks like a filter bug rather than like seed data.
 */
/*
 * The rooms the site offers, in the order it lists them.
 *
 * Through the shared helper rather than a local copy: seeding a build under a
 * room the browse filter does not offer produces a row nobody can reach through
 * the UI, which looks like a filter bug rather than like seed data.
 */
const rooms = listedMaps(
  maps.maps.map((m) => ({ ...m, name: (mapNames.maps as Record<string, { name: string }>)[m.id]?.name ?? m.id })),
);

const playableHeroes = heroes.heroes.filter((h) => h.playable);

/** Title shapes, so a list of sixty is scannable and search has something to bite. */
const ANGLES = [
  'first clear',
  'speed farm',
  'no shield',
  'budget start',
  'boss rush',
  'stacking armour',
  'one-shot opener',
  'ranged only',
  'crit build',
  'kiting setup',
  'solo, no revives',
  'ready around 4b',
];

/**
 * Comment bodies, so the thread under a build is not permanently empty.
 *
 * Short and in three languages, because the panel has to hold a Cyrillic name
 * beside a CJK one without the row falling apart — which is the layout question
 * seed data is actually here to answer.
 */
const REMARKS = [
  'Ran this twice tonight, the rune swap before the boss is the whole build.',
  'Works, but I went two potions instead of three and never missed the third.',
  'Спасибо, на восьмом тире зашло с первого раза.',
  '这套很稳，装备顺序照抄了。',
  'What do you drop if the second slot never drops for you?',
  'Solid write-up. The core item is the expensive part; everything else I had already.',
];

/**
 * A price for each build, in gold.
 *
 * Spans every magnitude the site has a suffix for — hundreds through billions —
 * so the browse row's formatter is exercised at each step rather than at one.
 * Zero is in the list on purpose: "the author did not say" is a state both
 * price sorts have to place, and it is the default for every row that existed
 * before the column did.
 */
const PRICES = [
  0, 850, 4_200, 26_500, 180_000, 1_250_000, 9_400_000, 74_000_000, 320_000_000, 1_500_000_000, 2_800_000_000,
  3_900_000_000,
];

/**
 * Videos for some builds, so the panel is exercised in both states.
 *
 * Real ids, but the point is the id shape rather than the content — the widget
 * loads nothing until somebody presses play, so a seeded build costs no
 * request to YouTube just by being listed.
 */
const VIDEOS = ['aqz-KE-bpKQ', 'jNQXAC9IVRw', 'BHACKCNDMW8'];

const PERSONAS = [
  'AgroMorphius',
  'Yazuki',
  'Тень',
  'MoonlitFox',
  '铁匠',
  'Bramblewick',
  'nullptr',
  'Свет',
  'Kestrel',
  'Дядя Ваня',
  'PixelPriest',
  'Orenmir',
];

/** Five builds per author is a database constraint, not a preference. */
const authorCount = Math.ceil(count / MAX_BUILDS_PER_USER);

/*
 * Every fourth account is a local one with no provider behind it.
 *
 * Which makes it *unverified*, and unverified is a state the site draws: a grey
 * badge beside the nickname, and comments that wait for a moderator. A seed
 * where everybody arrived through Steam is a seed where neither is ever on
 * screen, so half the feature only exists in tests.
 */
const unverified = (i: number): boolean => i % 4 === 3;

const authors = Array.from({ length: authorCount }, (_, i) => {
  const nickname =
    PERSONAS[i % PERSONAS.length] + (i >= PERSONAS.length ? ` ${Math.floor(i / PERSONAS.length) + 1}` : '');
  return unverified(i)
    ? createLocalUser(db, { nickname, passwordHash: SEED_PASSWORD_HASH }, NOW)
    : signInWithProvider(
        db,
        {
          provider: 'steam',
          providerId: `765611980000${String(100 + i).padStart(5, '0')}`,
          nickname,
          avatar: '',
        },
        NOW,
      );
});

/**
 * A pool of readers to hang likes on.
 *
 * Likes need a real person behind them — the table has a foreign key — and an
 * author may not like their own build, so this is a separate set from the
 * authors above.
 */
const readers = Array.from({ length: 40 }, (_, i) =>
  unverified(i)
    ? createLocalUser(db, { nickname: `reader${i}`, passwordHash: SEED_PASSWORD_HASH }, NOW)
    : signInWithProvider(
        db,
        { provider: 'steam', providerId: `765611980000${String(500 + i).padStart(5, '0')}`, nickname: `reader${i}`, avatar: '' },
        NOW,
      ),
);

/** Whether a provider vouches for somebody, which is what "verified" means. */
const isVouchedFor = (user: { id: number }): boolean => isVerified(db, user.id);

let made = 0;
let drafts = 0;
let commentsMade = 0;
const perTier = new Map<string, number>();

for (let i = 0; i < count; i += 1) {
  const room = rooms[i % rooms.length]!;
  const hero = playableHeroes[(i * 3) % playableHeroes.length]!;
  const author = authors[Math.floor(i / MAX_BUILDS_PER_USER)]!;

  /*
   * The season, taken from the hero rather than left to the column's default.
   *
   * Without this every seeded build was S1, while the editor and the browse
   * filter both open on the newest season — so a freshly seeded database looked
   * like an empty site. Axe is in both, which is what gives each season rows.
   */
  const heroSeasons = seasonsOfHero(hero.id);
  const season: SeasonKey = heroSeasons[i % Math.max(1, heroSeasons.length)] ?? 1;

  const state = createEmptyState();
  state.hero = hero.id;
  state.maps = [room.id];

  // Deterministic but different per build, so no two rows preview identically.
  const pick = <T>(list: T[], n: number) => list[(i * 17 + n * 13) % list.length]!;
  for (let slot = 0; slot < 3; slot += 1) state.slots[slot] = { k: 'id', id: pick(potions, slot)[1] };
  for (let slot = 3; slot <= 8; slot += 1) state.slots[slot] = { k: 'id', id: pick(equipment, slot)[1] };
  for (let slot = 9; slot <= 11; slot += 1) state.slots[slot] = { k: 'id', id: pick(runeItems, slot)[1] };
  state.slots[13] = { k: 'id', id: pick(equipment, 13)[1] };
  state.slots[14] = { k: 'id', id: pick(equipment, 14)[1] };
  /*
   * A Life Soul on most second-season builds, and none at all on the first.
   * Most rather than all, so both states are on screen: the soul slot filled,
   * and the `f` key still showing the shared heal it stands in for.
   */
  if (season === 2 && SOUL_SLOT >= 0 && souls.length > 0 && i % 4 !== 3) {
    state.slots[SOUL_SLOT] = { k: 'id', id: pick(souls, SOUL_SLOT)[1] };
  }

  ABILITY_SLOTS.forEach((key, n) => {
    const candidates = (hero.bySlot as Record<string, string[] | undefined>)[key] ?? [];
    const candidate = candidates[i % Math.max(1, candidates.length)];
    if (candidate !== undefined) state.spells[n] = { k: 'id', id: candidate };
  });

  /*
   * A priority on the first two pieces of gear, so both halves of the panel are
   * on screen: one card that ranks stats and names a fixed one, and one that
   * only says how far to reforge. The rest of the board is left alone, because
   * a build where every card is filled in is not what a real one looks like.
   */
  const priority: BuildItemPriority[] = [3, 4].flatMap((slot) => {
    const value = state.slots[slot];
    const item = value?.k === 'id' ? fullItems[value.id] : undefined;
    if (item === undefined) return [];
    const keys = affixPool(rollTables, item.values);
    if (keys.length === 0) return [];

    // Reversed on the second card, so the stored order is visibly the author's
    // rather than the item's own.
    const ranked = slot === 3 ? keys : [...keys].reverse();
    return [
      {
        slot,
        // The second card carries a level and nothing else, which is the other
        // shape a real priority takes: "get this one to nine, I do not mind how".
        reforge: slot === 3 ? Math.min(rollTables.maxReforgeLevel, 3 + (i % 7)) : rollTables.maxReforgeLevel,
        fixed: slot === 3 ? (ranked[0] as string) : null,
        enhanced: slot === 3 && ranked.length > 1 ? (ranked[1] as string) : null,
        // The first card wants a divine-forged copy and the second does not, so
        // the seed shows the panel both ways.
        divine: slot === 3,
        stats: ranked.map((key, n) => ({ key, target: slot === 3 && n === 0 ? 0 : null })),
        note:
          slot === 3
            ? 'The shield half of the passive is the point — the damage number can roll low.'
            : '',
      },
    ];
  });

  const payload = encodeBuild(state, ID_TABLE, HERO_TABLE);
  const check = validatePayload(payload, ID_TABLE, HERO_TABLE);
  if (!check.ok) throw new Error(`build ${i}: payload rejected — ${JSON.stringify(check.rejection)}`);

  const angle = ANGLES[i % ANGLES.length]!;
  const title = `${mapNameOf(room.id)}, ${angle}`;
  const core = state.slots[3];
  const body =
    `Cleared with ${hero.names['en'] ?? hero.short} on ${mapNameOf(room.id)} (tier ${room.tier}).\n\n` +
    `Core is ${core?.k === 'id' ? nameOf(core.id) : 'whatever drops first'}; everything else is flexible.\n` +
    'Runes go on defence until the boss, then swap.';

  // Every seventh one is a draft, so My Creations has both states to draw and
  // the browse list has something it must not show.
  const status = i % 7 === 6 ? 'draft' : 'published';

  const build = createBuild(
    db,
    {
      userId: author.id,
      slug: generateSlug(),
      fields: { title, body },
      payload,
      referral: i % 3 === 0 ? 'AOW5DEV' : '',
      // Coprime stride, so a run of twelve covers every magnitude exactly once.
      price: PRICES[(i * 5) % PRICES.length]!,
      // Every third build has one, so the build page is seeded with and without.
      video: i % 3 === 1 ? { id: VIDEOS[i % VIDEOS.length]!, start: i % 2 === 0 ? 0 : 42 } : null,
      // The room's own category, which is what an author would pick beside it.
      // The API refuses the two disagreeing, so the seed must not invent a
      // mismatch — and three rooms are curated onto a different tier than the
      // game's own name claims, which is exactly why this goes through
      // `categoryOfMap` rather than reading `room.tier`.
      tier: categoryOfMap(room),
      season,
      /*
       * Two builds in three name their headline, and the rest leave it to the
       * kit order — both states are on screen that way, which is the whole
       * reason a seed exists. `w` and `r` rather than `q`, because `q` is what
       * the fallback already picks and a seed where the two agree would never
       * show the field doing anything.
       */
      /*
       * ...except a build wearing a Life Soul, every so often, which leads with
       * `f`. That is the one key whose meaning comes from the loadout rather
       * than the kit, and it is the only way to see a row led by a soul rather
       * than by the Emergency Heal every build in the list also has.
       */
      mainSpell:
        state.slots[SOUL_SLOT] != null && i % 6 === 0 ? 'f' : i % 3 === 0 ? null : i % 3 === 1 ? 'w' : 'r',
      priority,
      facets: check.facets,
      status,
    },
    // Spread over the past few weeks so `sort=new` is a different order from
    // `sort=top` rather than an accident of insertion.
    NOW - i * 9_000,
  );
  if (build === 'limit-reached') throw new Error(`author ${author.nickname} hit the cap; the maths above is wrong`);

  /*
   * A spread of like counts, so `sort=top` has a real order and the tie case —
   * two builds on the same count — actually occurs. The pattern is arbitrary
   * but fixed, which is what keeps runs comparable.
   */
  const likeCount = (i * 7) % 23;
  for (let n = 0; n < likeCount; n += 1) {
    const reader = readers[(i + n) % readers.length]!;
    if (reader.id !== author.id) setLike(db, build.id, reader.id, true, NOW);
  }

  /*
   * A thread on some builds and nothing on others, so the panel is exercised in
   * both states. Spaced by more than the server's fifteen-second repost window
   * and never twice from the same reader on the same build, because both rules
   * are enforced by `addComment`'s callers rather than by the table — seed data
   * that violates them would be data the API could not have produced.
   *
   * One build gets a thread longer than `PAGE_SIZE`, because otherwise the
   * cursor and the "show more" button under the list are never exercised by
   * anything but production.
   */
  const commentCount = status === 'published' ? (i === 1 ? 25 : i % 4) : 0;
  for (let n = 0; n < commentCount; n += 1) {
    const reader = readers[(i * 5 + n * 3) % readers.length]!;
    if (reader.id === author.id) continue;
    /*
     * Held exactly when the API would hold it: the reader has no provider
     * linked. Seeding an approved comment from an unverified account would be
     * a row the running server could not have produced, and the moderation
     * queue would be empty in the one environment it is meant to be looked at
     * in.
     */
    addComment(
      db,
      build.id,
      reader.id,
      REMARKS[(i + n) % REMARKS.length]!,
      NOW - (commentCount - n) * 3_600,
      isVouchedFor(reader),
    );
  }
  commentsMade += commentCount;

  made += 1;
  if (status === 'draft') drafts += 1;
  const filed = categoryOfMap(room);
  perTier.set(filed, (perTier.get(filed) ?? 0) + 1);
}

console.log(`${made} builds — ${made - drafts} published, ${drafts} drafts, ${commentsMade} comments`);
console.log(`${authors.length} authors (cap is ${MAX_BUILDS_PER_USER} each), ${rooms.length} rooms in rotation`);
console.log(
  'per tier: ' +
    [...perTier.entries()]
      .sort((a, b) => TIER_KEYS.indexOf(a[0] as never) - TIER_KEYS.indexOf(b[0] as never))
      .map(([tier, n]) => `${tierShort(tier as never)}=${n}`)
      .join(' '),
);
