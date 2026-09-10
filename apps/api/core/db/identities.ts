/**
 * The external accounts that vouch for a user.
 *
 * One row per provider per person. Everything here is deliberately dull — find
 * a link, make a link, break a link — because the interesting decisions are all
 * in what the callers *do not* do: nothing in this module ever matches an
 * incoming provider account to an existing user by name or by email. See the
 * note on the table.
 */
import { and, eq, inArray } from 'drizzle-orm';
import type { ProfileLink } from 'aow5-api-contract';
import type { Db } from './open.ts';
import { identities, users } from './schema.ts';
import { createProviderUser, findUserById, refreshProviderProfile, type UserRow } from './users.ts';

export type IdentityRow = typeof identities.$inferSelect;
/** `local` is not here: a password is not an account somewhere else. */
export type ExternalProvider = IdentityRow['provider'];

/** What a provider told us, already normalised by whichever strategy read it. */
export interface ProviderProfile {
  provider: ExternalProvider;
  /** That provider's own id, as text. Never parsed into a number — see the column. */
  providerId: string;
  nickname: string;
  avatar: string;
}

export function findIdentity(db: Db, provider: ExternalProvider, providerId: string): IdentityRow | undefined {
  return db
    .select()
    .from(identities)
    .where(and(eq(identities.provider, provider), eq(identities.providerId, providerId)))
    .get();
}

/**
 * Where a provider account can be read about.
 *
 * Both providers key their public page on the same id this table stores, and
 * both ids are decimal — a 64-bit SteamID, a Discord snowflake — so anything
 * else is a row nothing should be linking to, and gets no link rather than a
 * URL built out of somebody's typing.
 *
 * Steam's `/profiles/<id>` form is used rather than `/id/<vanity>`: the vanity
 * name is a thing its owner can change and this is not, and the numeric form
 * redirects to whatever they are calling themselves today.
 */
export function profileUrl(provider: ExternalProvider, providerId: string): string | null {
  if (!/^\d{1,32}$/.test(providerId)) return null;
  return provider === 'steam'
    ? `https://steamcommunity.com/profiles/${providerId}`
    : `https://discord.com/users/${providerId}`;
}

/**
 * Steam first, because on a site about a Steam game it is the profile a reader
 * came looking for. A stable order also keeps two authors' name rows from
 * drawing their marks in different orders for no reason.
 */
const PROVIDER_ORDER: ExternalProvider[] = ['steam', 'discord'];

function toProfileLinks(rows: readonly IdentityRow[]): ProfileLink[] {
  return rows
    .slice()
    .sort((a, b) => PROVIDER_ORDER.indexOf(a.provider) - PROVIDER_ORDER.indexOf(b.provider))
    .flatMap((row) => {
      const url = profileUrl(row.provider, row.providerId);
      return url === null ? [] : [{ provider: row.provider, url }];
    });
}

/** The links behind one account, for a page that shows one author. */
export function profilesOf(db: Db, userId: number): ProfileLink[] {
  return toProfileLinks(listIdentities(db, userId));
}

/**
 * The same for a page of them, in one query.
 *
 * A browse page draws ten authors and a thread twenty commenters; a query each
 * is the shape that makes a list slow for no reason anybody can see — the same
 * argument `verified` is carried on the summary for.
 */
export function profilesOfUsers(db: Db, userIds: readonly number[]): Map<number, ProfileLink[]> {
  const out = new Map<number, ProfileLink[]>();
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return out;

  const rows = db.select().from(identities).where(inArray(identities.userId, unique)).all();
  const byUser = new Map<number, IdentityRow[]>();
  for (const row of rows) {
    const list = byUser.get(row.userId);
    if (list === undefined) byUser.set(row.userId, [row]);
    else list.push(row);
  }
  for (const [userId, list] of byUser) out.set(userId, toProfileLinks(list));
  return out;
}

/** Every door into one account, for the settings screen and for `/me`. */
export function listIdentities(db: Db, userId: number): IdentityRow[] {
  return db.select().from(identities).where(eq(identities.userId, userId)).all();
}

/**
 * Signs somebody in through a provider, opening an account if this is the first
 * time they have used it.
 *
 * The whole flow in one transaction, because the alternative is a find, then an
 * insert, then a second insert, with two sign-ins arriving together able to
 * interleave between any pair of them. better-sqlite3 is synchronous, so there
 * is no await for a second request to slip through.
 *
 * **A new account, never an existing one.** If this provider account is not
 * already linked, a fresh user is created — it is not attached to whichever
 * account happens to share a display name or an email address. Matching on a
 * provider's email is how accounts get taken over by anybody who can get that
 * address issued to them, and Steam supplies no email to match on anyway.
 * Linking a second provider to an account you are *already signed into* is a
 * different operation, and that is `linkIdentity` below.
 */
export function signInWithProvider(db: Db, profile: ProviderProfile, now: number): UserRow {
  return db.transaction((tx) => {
    const existing = findIdentity(tx, profile.provider, profile.providerId);

    if (existing !== undefined) {
      tx.update(identities)
        .set({ label: profile.nickname, updatedAt: now })
        .where(and(eq(identities.provider, profile.provider), eq(identities.providerId, profile.providerId)))
        .run();

      const user = findUserById(tx, existing.userId);
      if (user === undefined) throw new Error(`identity ${profile.provider}:${profile.providerId} has no user`);
      return refreshProviderProfile(tx, user, profile, now);
    }

    const user = createProviderUser(tx, { nickname: profile.nickname, avatar: profile.avatar }, now);
    tx.insert(identities)
      .values({
        provider: profile.provider,
        providerId: profile.providerId,
        userId: user.id,
        label: profile.nickname,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return user;
  });
}

/**
 * Attaches a provider to the account somebody is already signed into.
 *
 * Refused rather than moved when that provider account belongs to somebody
 * else: silently re-pointing a link would hand one person's Steam account to
 * another's profile, and the two accounts may both have builds.
 */
export function linkIdentity(
  db: Db,
  userId: number,
  profile: ProviderProfile,
  now: number,
): { ok: true } | { ok: false; reason: 'taken' | 'already-linked' } {
  return db.transaction((tx) => {
    const existing = findIdentity(tx, profile.provider, profile.providerId);
    if (existing !== undefined) {
      return existing.userId === userId ? { ok: true as const } : { ok: false as const, reason: 'taken' as const };
    }
    // One account per provider per user, so "unlink" is unambiguous.
    const already = tx
      .select()
      .from(identities)
      .where(and(eq(identities.userId, userId), eq(identities.provider, profile.provider)))
      .get();
    if (already !== undefined) return { ok: false as const, reason: 'already-linked' as const };

    tx.insert(identities)
      .values({
        provider: profile.provider,
        providerId: profile.providerId,
        userId,
        label: profile.nickname,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return { ok: true as const };
  });
}

/**
 * Removes a link, unless it is the last way into the account.
 *
 * An account with no password and no identities is one nobody can ever sign
 * into again, and there is no password recovery on this site — so this is the
 * one place that has to count what is left before taking something away.
 */
export function unlinkIdentity(
  db: Db,
  userId: number,
  provider: ExternalProvider,
): { ok: true } | { ok: false; reason: 'last-door' | 'not-linked' } {
  return db.transaction((tx) => {
    const mine = tx
      .select()
      .from(identities)
      .where(and(eq(identities.userId, userId), eq(identities.provider, provider)))
      .get();
    if (mine === undefined) return { ok: false as const, reason: 'not-linked' as const };

    const user = tx.select().from(users).where(eq(users.id, userId)).get();
    const others = tx.select().from(identities).where(eq(identities.userId, userId)).all().length - 1;
    if (others === 0 && (user === undefined || user.passwordHash === null)) {
      return { ok: false as const, reason: 'last-door' as const };
    }

    tx.delete(identities)
      .where(and(eq(identities.userId, userId), eq(identities.provider, provider)))
      .run();
    return { ok: true as const };
  });
}
