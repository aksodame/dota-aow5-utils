import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { BUILDS_PER_LINKED_PROVIDER, MAX_BUILDS_CEILING, MAX_BUILDS_PER_USER } from 'aow5-api-contract';
import { openDb, runMigrations, type Db } from './open.ts';
import {
  findIdentity,
  linkIdentity,
  listIdentities,
  profileUrl,
  profilesOf,
  profilesOfUsers,
  signInWithProvider,
  unlinkIdentity,
  type ProviderProfile,
} from './identities.ts';
import { buildLimitFor, createLocalUser, findUserById, findUserByNickname } from './users.ts';

const MIGRATIONS = fileURLToPath(new URL('../../drizzle', import.meta.url));
const NOW = 1_700_000_000;

function fixture(): Db {
  const { db } = openDb({ path: ':memory:' });
  runMigrations(db, MIGRATIONS);
  return db;
}

const steam = (id: string, nickname = 'Вася'): ProviderProfile => ({
  provider: 'steam',
  providerId: id,
  nickname,
  avatar: '',
});

const discord = (id: string, nickname = 'someone'): ProviderProfile => ({
  provider: 'discord',
  providerId: id,
  nickname,
  avatar: '',
});

test('the first sign-in opens an account, and the second finds it', () => {
  const db = fixture();
  const first = signInWithProvider(db, steam('76561197960287930'), NOW);
  const again = signInWithProvider(db, steam('76561197960287930'), NOW + 60);

  assert.equal(again.id, first.id, 'the same Steam account is the same person');
  assert.equal(listIdentities(db, first.id).length, 1);
  assert.equal(findIdentity(db, 'steam', '76561197960287930')?.userId, first.id);
});

test('two provider accounts sharing a display name are two people', () => {
  /*
   * The property the old Steam-only schema had and the local-only one did not.
   * A display name is chosen by its owner; the id is issued by the provider.
   * Only the second can be an identity.
   */
  const db = fixture();
  const one = signInWithProvider(db, steam('76561197960287930', 'Вася'), NOW);
  const two = signInWithProvider(db, steam('76561197960287931', 'Вася'), NOW);
  assert.notEqual(one.id, two.id);
});

test('nothing links automatically, however alike two accounts look', () => {
  /*
   * A Discord account whose name matches an existing user gets its *own*
   * account. Matching them up is how somebody takes over a profile by
   * registering the right name somewhere else.
   */
  const db = fixture();
  const viaSteam = signInWithProvider(db, steam('76561197960287930', 'Вася'), NOW);
  const viaDiscord = signInWithProvider(db, discord('123456789', 'Вася'), NOW);

  assert.notEqual(viaDiscord.id, viaSteam.id);
  assert.equal(listIdentities(db, viaSteam.id).length, 1);
  assert.equal(listIdentities(db, viaDiscord.id).length, 1);
});

test('a signed-in person can link a second provider', () => {
  const db = fixture();
  const user = signInWithProvider(db, steam('76561197960287930'), NOW);

  assert.deepEqual(linkIdentity(db, user.id, discord('123456789'), NOW), { ok: true });
  assert.deepEqual(
    listIdentities(db, user.id)
      .map((row) => row.provider)
      .sort(),
    ['discord', 'steam'],
  );

  // Signing in with the newly linked account arrives at the same person.
  assert.equal(signInWithProvider(db, discord('123456789'), NOW + 60).id, user.id);
});

test('a provider account belonging to somebody else is refused, not moved', () => {
  const db = fixture();
  const mine = signInWithProvider(db, steam('76561197960287930'), NOW);
  const theirs = signInWithProvider(db, discord('123456789'), NOW);

  assert.deepEqual(linkIdentity(db, mine.id, discord('123456789'), NOW), { ok: false, reason: 'taken' });
  // And the other account still has it.
  assert.equal(findIdentity(db, 'discord', '123456789')?.userId, theirs.id);
});

test('one account per provider per person, so unlinking is unambiguous', () => {
  const db = fixture();
  const user = signInWithProvider(db, steam('76561197960287930'), NOW);
  assert.deepEqual(linkIdentity(db, user.id, steam('76561197960287999'), NOW), {
    ok: false,
    reason: 'already-linked',
  });
});

test('linking the account you already have is not an error', () => {
  // Pressing "link Steam" twice should not read as a failure.
  const db = fixture();
  const user = signInWithProvider(db, steam('76561197960287930'), NOW);
  assert.deepEqual(linkIdentity(db, user.id, steam('76561197960287930'), NOW), { ok: true });
});

test('the last door cannot be removed', () => {
  /*
   * There is no password recovery here, so unlinking the only identity from an
   * account with no password would lock its owner out permanently — and their
   * builds with them.
   */
  const db = fixture();
  const user = signInWithProvider(db, steam('76561197960287930'), NOW);
  assert.deepEqual(unlinkIdentity(db, user.id, 'steam'), { ok: false, reason: 'last-door' });

  // With a second one, either may go.
  linkIdentity(db, user.id, discord('123456789'), NOW);
  assert.deepEqual(unlinkIdentity(db, user.id, 'steam'), { ok: true });
  assert.deepEqual(unlinkIdentity(db, user.id, 'discord'), { ok: false, reason: 'last-door' });
});

test('a password counts as a door, so the last provider may go', () => {
  const db = fixture();
  const user = createLocalUser(db, { nickname: 'Вася', passwordHash: 'scrypt$N=1,r=1,p=1$x$y' }, NOW);
  linkIdentity(db, user.id, steam('76561197960287930'), NOW);
  assert.deepEqual(unlinkIdentity(db, user.id, 'steam'), { ok: true });
});

test('unlinking something that was never linked says so', () => {
  const db = fixture();
  const user = signInWithProvider(db, steam('76561197960287930'), NOW);
  assert.deepEqual(unlinkIdentity(db, user.id, 'discord'), { ok: false, reason: 'not-linked' });
});

test('a provider refreshes the name it supplied, but never a chosen one', () => {
  const db = fixture();

  // No password: the provider owns the display name, so a rename follows.
  const theirs = signInWithProvider(db, steam('76561197960287930', 'old name'), NOW);
  const renamed = signInWithProvider(db, steam('76561197960287930', 'new name'), NOW + 60);
  assert.equal(renamed.nickname, 'new name');
  assert.equal(renamed.id, theirs.id);

  // With a password, the name was chosen here and stays chosen here.
  const local = createLocalUser(db, { nickname: 'Вася', passwordHash: 'scrypt$N=1,r=1,p=1$x$y' }, NOW);
  linkIdentity(db, local.id, discord('123456789'), NOW);
  signInWithProvider(db, discord('123456789', 'something else'), NOW + 60);
  assert.equal(findUserById(db, local.id)?.nickname, 'Вася');
});

test('a provider account does not occupy a name a local account could want', () => {
  /*
   * The nickname key is null for an account with no password, so somebody
   * signing in through Steam as `Вася` does not stop a local sign-up under that
   * name — and does not become findable by it either.
   */
  const db = fixture();
  signInWithProvider(db, steam('76561197960287930', 'Вася'), NOW);
  assert.equal(findUserByNickname(db, 'Вася'), undefined, 'no password means no claim on the name');

  const local = createLocalUser(db, { nickname: 'Вася', passwordHash: 'scrypt$N=1,r=1,p=1$x$y' }, NOW);
  assert.equal(findUserByNickname(db, 'ВАСЯ')?.id, local.id, 'and the local one is found case-folded');
});

test('a linked provider buys five more build slots, and two buy ten', () => {
  /*
   * The other half of what linking is for. The comment queue holds an
   * unverified author's words; the cap holds their fifth build — both because
   * an account costs nothing to open and a Steam account does not.
   */
  const db = fixture();
  const user = createLocalUser(db, { nickname: 'local', passwordHash: 'x' }, NOW);
  assert.equal(buildLimitFor(db, user.id), MAX_BUILDS_PER_USER);

  assert.deepEqual(linkIdentity(db, user.id, steam('76561197960287931'), NOW), { ok: true });
  assert.equal(buildLimitFor(db, user.id), MAX_BUILDS_PER_USER + BUILDS_PER_LINKED_PROVIDER);

  assert.deepEqual(linkIdentity(db, user.id, discord('987654321'), NOW), { ok: true });
  assert.equal(buildLimitFor(db, user.id), MAX_BUILDS_CEILING, 'both providers is the ceiling');
});

test('a linked account is somewhere a reader can go', () => {
  const db = fixture();
  const user = signInWithProvider(db, steam('76561198012345678'), NOW);
  linkIdentity(db, user.id, discord('310432161893580800'), NOW);

  assert.deepEqual(profilesOf(db, user.id), [
    { provider: 'steam', url: 'https://steamcommunity.com/profiles/76561198012345678' },
    { provider: 'discord', url: 'https://discord.com/users/310432161893580800' },
  ]);
});

test('the door somebody arrived through leads, whichever one it was', () => {
  // The case the old Steam-first order got wrong. Somebody who signed up with
  // Discord and attached Steam afterwards is their Discord account to everybody
  // who knows them, and the name row has to introduce them as that.
  const db = fixture();
  const user = signInWithProvider(db, discord('310432161893580800'), NOW);
  linkIdentity(db, user.id, steam('76561198012345678'), NOW + 3600);

  assert.deepEqual(profilesOf(db, user.id), [
    { provider: 'discord', url: 'https://discord.com/users/310432161893580800' },
    { provider: 'steam', url: 'https://steamcommunity.com/profiles/76561198012345678' },
  ]);
});

test('two links stamped the same second still order the same way every time', () => {
  // `created_at` is seconds, so signing up and linking within one is a real
  // tie — and an author whose marks moved between two renders of the same page
  // would look like two different people.
  const db = fixture();
  const first = signInWithProvider(db, discord('310432161893580801'), NOW);
  linkIdentity(db, first.id, steam('76561198000000002'), NOW);
  const second = signInWithProvider(db, steam('76561198000000003'), NOW);
  linkIdentity(db, second.id, discord('310432161893580802'), NOW);

  assert.equal(profilesOf(db, first.id)[0]?.provider, 'steam');
  assert.equal(profilesOf(db, second.id)[0]?.provider, 'steam');
});

test('an account with nothing linked has nowhere to point', () => {
  const db = fixture();
  const user = createLocalUser(db, { nickname: 'local-only', passwordHash: 'hash' }, NOW);
  assert.deepEqual(profilesOf(db, user.id), []);
});

test('an id that is not a provider id gets no link at all', () => {
  // Both providers key their pages on a decimal id. Anything else is a row
  // nothing should be linking to, rather than a URL built out of it.
  assert.equal(profileUrl('steam', 'gabelogannewell'), null);
  assert.equal(profileUrl('discord', ''), null);
  assert.equal(profileUrl('steam', '../../admin'), null);
  assert.equal(profileUrl('steam', '76561198012345678'), 'https://steamcommunity.com/profiles/76561198012345678');
});

test('a page of authors costs one query, and names its own rows', () => {
  const db = fixture();
  const one = signInWithProvider(db, steam('76561198000000001'), NOW);
  const two = signInWithProvider(db, discord('310432161893580801'), NOW);
  const three = createLocalUser(db, { nickname: 'nobody', passwordHash: 'hash' }, NOW);

  const byUser = profilesOfUsers(db, [one.id, two.id, three.id, one.id]);
  assert.equal(byUser.get(one.id)?.[0]?.provider, 'steam');
  assert.equal(byUser.get(two.id)?.[0]?.provider, 'discord');
  // An account with no identities is absent rather than an empty entry: the
  // caller defaults, and a map that answers for everybody hides a missing row.
  assert.equal(byUser.has(three.id), false);
  assert.deepEqual(profilesOfUsers(db, []), new Map());
});
