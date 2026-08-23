/**
 * Everything that reads or writes a person.
 *
 * A user is never deleted. Banning sets `bannedAt`, which hides their builds
 * and comments everywhere and makes their sessions resolve to nobody — but the
 * rows stay, because a thread that loses a reply reshuffles around it and a
 * moderator looking at why somebody was banned needs to see what they wrote.
 */
import { eq } from 'drizzle-orm';
import type { PublicUser } from 'aow5-api-contract';
import { placeholderPersona } from '../steam/profile.ts';
import type { Db } from './open.ts';
import { users } from './schema.ts';

export type UserRow = typeof users.$inferSelect;

export interface ProfileInput {
  steamId: string;
  persona: string;
  avatarUrl: string;
  profileUrl: string;
  createdAt: number | null;
}

/** How stale a stored profile may get before the next sign-in refreshes it. */
export const PROFILE_TTL_SECONDS = 7 * 24 * 60 * 60;

export function findUserBySteamId(db: Db, steamId: string): UserRow | undefined {
  return db.select().from(users).where(eq(users.steamId, steamId)).get();
}

export function findUserById(db: Db, id: number): UserRow | undefined {
  return db.select().from(users).where(eq(users.id, id)).get();
}

/**
 * Records a sign-in.
 *
 * `profile` is null when Steam could not be reached, which is deliberately not
 * an error: an existing user keeps the profile already stored, and a first-time
 * visitor gets a placeholder that the next sign-in replaces. Steam having a bad
 * day is not a reason to refuse somebody entry.
 */
export function upsertUserFromSteam(db: Db, steamId: string, profile: ProfileInput | null, now: number): UserRow {
  const existing = findUserBySteamId(db, steamId);

  if (existing !== undefined) {
    if (profile === null) return existing;
    db.update(users)
      .set({
        persona: profile.persona,
        avatarUrl: profile.avatarUrl,
        profileUrl: profile.profileUrl,
        profileSyncedAt: now,
        ...(profile.createdAt !== null ? { steamCreatedAt: profile.createdAt } : {}),
      })
      .where(eq(users.id, existing.id))
      .run();
    return findUserById(db, existing.id) ?? existing;
  }

  const inserted = db
    .insert(users)
    .values({
      steamId,
      persona: profile?.persona ?? placeholderPersona(steamId),
      avatarUrl: profile?.avatarUrl ?? '',
      profileUrl: profile?.profileUrl ?? `https://steamcommunity.com/profiles/${steamId}`,
      // Zero, not `now`, when the profile is missing — so the next sign-in
      // treats it as stale and tries again rather than waiting a week.
      profileSyncedAt: profile === null ? 0 : now,
      ...(profile?.createdAt != null ? { steamCreatedAt: profile.createdAt } : {}),
      createdAt: now,
    })
    .returning()
    .get();

  return inserted;
}

export function profileIsStale(user: UserRow, now: number): boolean {
  return now - user.profileSyncedAt > PROFILE_TTL_SECONDS;
}

/**
 * Whether this user is still wearing the name we invented for them.
 *
 * `profileSyncedAt` is left at zero when Steam told us nothing, so this is the
 * cheap test for "we never actually learned who they are" — and it is the
 * difference between refreshing in the background and refreshing before
 * answering, because a wrong name in the header is not something to fix later.
 */
export function hasPlaceholderProfile(user: UserRow): boolean {
  return user.profileSyncedAt === 0 || user.persona === placeholderPersona(user.steamId);
}

/** The subset of a user that anyone is allowed to see. */
export function toPublicUser(user: UserRow): PublicUser {
  return {
    steamId: user.steamId,
    persona: user.persona,
    avatarUrl: user.avatarUrl,
    profileUrl: user.profileUrl,
  };
}
