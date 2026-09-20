/**
 * Adds second-season builds to a development database that already has rows.
 *
 * `seed-dev.ts` builds a database from nothing: it creates its own authors, and
 * running it twice collides on their nicknames, so the only way to re-run it is
 * `--reset`. That is the wrong tool for a local database somebody has been
 * clicking around in — accounts made by hand, comments written by hand — and it
 * is also the only way the seeded S2 content arrived, which is how a dev
 * database ends up with nothing to show on a site whose browse filter and
 * editor both open on the newest season.
 *
 * So this one adds. It picks authors that already exist and have room under the
 * per-user cap, files builds under S2 heroes, and puts a Life Soul in most of
 * them. Everything goes through the same core modules the API does — the same
 * reasoning as `seed-dev.ts`, and the same guarantee: nothing here is a row the
 * server could not have produced.
 *
 *   node scripts/add-s2-builds.ts                 # ./aow5.db, 8 builds
 *   node scripts/add-s2-builds.ts --count=20
 *   node scripts/add-s2-builds.ts ./other.db
 */
import { sql } from 'drizzle-orm';
import { createBuild } from '../core/db/builds.ts';
import { generateSlug } from '../core/builds/slug.ts';
import { openDb, runMigrations } from '../core/db/open.ts';
import { validatePayload } from '../core/codec/validatePayload.ts';
import { HERO_TABLE, ID_TABLE } from '../core/codec/tables.ts';
import { createEmptyState, encodeBuild, groupsInPanel } from 'aow5-shared/codec';
import { categoryOfMap, isHeroInSeason, listedMaps } from 'aow5-shared/data';
import { ABILITY_SLOTS, SLOT_KIND } from 'aow5-shared/types';
import { MAX_BUILDS_PER_USER } from 'aow5-api-contract';
import heroes from 'aow5-shared/public/data/heroes.json' with { type: 'json' };
import maps from 'aow5-shared/public/data/maps.json' with { type: 'json' };
import index from 'aow5-shared/public/data/items.index.json' with { type: 'json' };
import names from 'aow5-shared/public/data/locale.en.names.json' with { type: 'json' };
import mapNames from 'aow5-shared/public/data/locale.en.maps.json' with { type: 'json' };

const args = process.argv.slice(2);
const countArg = args.find((a) => a.startsWith('--count='))?.slice('--count='.length);
const count = Number(countArg ?? 8);
if (!Number.isInteger(count) || count < 1) throw new Error(`--count must be a positive integer, got ${countArg}`);
const dbPath = args.find((a) => !a.startsWith('--')) ?? './aow5.db';

const nameOf = (id: string) => (names.names as Record<string, string>)[id] ?? id;
const mapNameOf = (id: string) => (mapNames.maps as Record<string, { name: string }>)[id]?.name ?? id;

const NOW = Math.floor(Date.now() / 1000);
const { db } = openDb({ path: dbPath });
runMigrations(db, 'drizzle');

const rows = index.rows as Array<[number, string, string, number, number, number, string, number]>;
/** Playable items a slot of this kind accepts, best-quality first. */
const pool = (kind: number) => rows.filter((r) => (r[7] & kind) !== 0).sort((a, b) => b[3] - a[3] || b[4] - a[4]);
const equipment = pool(SLOT_KIND.EQUIP);
const runeItems = pool(SLOT_KIND.RUNE);
const potions = pool(SLOT_KIND.POTION);
const souls = pool(SLOT_KIND.SOUL);
const SOUL_SLOT = groupsInPanel('soul')[0]?.start ?? -1;

if (souls.length === 0) throw new Error('the emitted index flags no Life Souls; run the parser first');
if (SOUL_SLOT < 0) throw new Error('the loadout layout names no soul slot');

const rooms = listedMaps(
  maps.maps.map((m) => ({ ...m, name: (mapNames.maps as Record<string, { name: string }>)[m.id]?.name ?? m.id })),
);
/** Heroes the second season actually offers — the API refuses any other pair. */
const s2Heroes = heroes.heroes.filter((h) => h.playable && isHeroInSeason(h.id, 2));
if (s2Heroes.length === 0) throw new Error('no playable hero is in season 2');

/**
 * Authors that already exist and can take another build.
 *
 * The cap is enforced by `createBuild`, which answers `'limit-reached'` rather
 * than throwing — so picking authors with room is what keeps a run from
 * quietly producing fewer builds than it says it did.
 */
const authors = db
  .all<{ id: number; nickname: string; n: number }>(
    sql`select u.id as id, u.nickname as nickname, count(b.id) as n
        from users u left join builds b on b.user_id = u.id
        group by u.id having n < ${MAX_BUILDS_PER_USER - 1}
        order by n asc, u.id asc`,
  )
  .map((r) => ({ id: Number(r.id), nickname: String(r.nickname) }));
if (authors.length === 0) throw new Error('every existing user is at the build cap; use seed-dev.ts instead');

const ANGLES = ['soul opener', 'refined soul', 'S2 first clear', 'cube run', 'soul burst', 'no-soul control'];
const PRICES = [0, 1800, 12000, 48000, 260000];

let made = 0;
for (let i = 0; i < count; i += 1) {
  const room = rooms[(i * 5) % rooms.length]!;
  const hero = s2Heroes[i % s2Heroes.length]!;
  const author = authors[i % authors.length]!;

  const pick = <T>(list: T[], n: number) => list[(i * 17 + n * 13) % list.length]!;

  const state = createEmptyState();
  state.hero = hero.id;
  state.maps = [room.id];
  for (let slot = 0; slot < 3; slot += 1) state.slots[slot] = { k: 'id', id: pick(potions, slot)[1] };
  for (let slot = 3; slot <= 8; slot += 1) state.slots[slot] = { k: 'id', id: pick(equipment, slot)[1] };
  for (let slot = 9; slot <= 11; slot += 1) state.slots[slot] = { k: 'id', id: pick(runeItems, slot)[1] };
  state.slots[13] = { k: 'id', id: pick(equipment, 13)[1] };
  state.slots[14] = { k: 'id', id: pick(equipment, 14)[1] };
  // Most of them, not all: the empty soul slot and the `f` key still showing
  // the shared heal are states worth having on screen too.
  const wearsSoul = i % 4 !== 3;
  if (wearsSoul) state.slots[SOUL_SLOT] = { k: 'id', id: pick(souls, SOUL_SLOT)[1] };

  ABILITY_SLOTS.forEach((key, n) => {
    const candidates = (hero.bySlot as Record<string, string[] | undefined>)[key] ?? [];
    const candidate = candidates[i % Math.max(1, candidates.length)];
    if (candidate !== undefined) state.spells[n] = { k: 'id', id: candidate };
  });

  const payload = encodeBuild(state, ID_TABLE, HERO_TABLE);
  const check = validatePayload(payload, ID_TABLE, HERO_TABLE);
  if (!check.ok) throw new Error(`build ${i}: payload rejected — ${JSON.stringify(check.rejection)}`);

  const soulValue = state.slots[SOUL_SLOT];
  const soulName = soulValue?.k === 'id' ? nameOf(soulValue.id) : null;
  const build = createBuild(
    db,
    {
      userId: author.id,
      slug: generateSlug(),
      fields: {
        title: `${mapNameOf(room.id)}, ${ANGLES[i % ANGLES.length]}`,
        body:
          `Second season, ${mapNameOf(room.id)}.\n\n` +
          (soulName === null
            ? 'No Life Soul on this one — the f key is the plain Emergency Heal.'
            : `${soulName} in the soul slot, which is what the f key does here.`),
      },
      payload,
      referral: '',
      price: PRICES[(i * 3) % PRICES.length]!,
      video: null,
      tier: categoryOfMap(room),
      season: 2,
      // Every other soul build leads with `f`, so the browse row and the card
      // both show a headline that is an item rather than an ability.
      mainSpell: wearsSoul && i % 2 === 0 ? 'f' : 'q',
      priority: [],
      facets: check.facets,
      status: 'published',
    },
    NOW - i * 7_000,
  );
  if (build === 'limit-reached') throw new Error(`author ${author.nickname} hit the cap; pick fewer builds`);
  made += 1;
}

console.log(`added ${made} S2 build(s) to ${dbPath}; ${Math.ceil((made * 3) / 4)} wear a Life Soul`);
