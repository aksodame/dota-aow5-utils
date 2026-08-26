import assert from 'node:assert/strict';
import test from 'node:test';
import {
  importedSoundId,
  MAX_PACK_SOUNDS,
  packRef,
  packedSound,
  parsePackRef,
  readManifest,
  readPack,
  readPacks,
  referencedHashes,
} from './packs.ts';
import { MAX_SOUND_BYTES } from './sounds.ts';

/**
 * The reader, because it is the one part of this feature that meets a stranger.
 *
 * A pack manifest arrives from a URL somebody pasted, and everything downstream
 * of here — what gets fetched, how many bytes are accepted, what is written to
 * disk — is decided by what this file agrees to. So the tests are mostly about
 * what it refuses.
 */

const HASH = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

const sound = (over: Record<string, unknown> = {}) => ({
  url: 'https://example.com/boom.mp3',
  sha256: HASH,
  bytes: 41233,
  license: 'CC0',
  ...over,
});

const manifest = (sounds: Record<string, unknown>) => ({ name: 'Jackpots', sounds });

test('a well-formed pack reads back whole', () => {
  const { pack, dropped } = readPack('jackpots', manifest({ boom: sound({ credit: 'someone' }) }), null);
  assert.deepEqual(dropped, []);
  assert.equal(pack?.name, 'Jackpots');
  assert.equal(pack?.source, null, 'a pack assembled by hand came from nowhere, and says so');
  assert.deepEqual(pack?.sounds['boom'], {
    url: 'https://example.com/boom.mp3',
    sha256: HASH,
    bytes: 41233,
    license: 'CC0',
    credit: 'someone',
  });
});

test('one bad entry costs that entry and nothing beside it', () => {
  const { pack, dropped } = readPack(
    'jackpots',
    manifest({ good: sound(), bad: sound({ sha256: 'nope' }) }),
    null,
  );
  assert.deepEqual(Object.keys(pack?.sounds ?? {}), ['good']);
  assert.deepEqual(dropped, ['bad'], 'and the install is told, rather than quietly shrinking');
});

test('http is not fetched, whatever the hash says', () => {
  // The hash would catch a swapped file, so this is not what keeps the audio
  // honest — it is that there is no reason to ask for plain http at all.
  const { pack } = readPack('p', manifest({ a: sound({ url: 'http://example.com/a.mp3' }) }), null);
  assert.equal(pack, null);
  assert.equal(readPack('p', manifest({ a: sound({ url: 'file:///C:/a.mp3' }) }), null).pack, null);
  assert.equal(readPack('p', manifest({ a: sound({ url: 'not a url' }) }), null).pack, null);
});

test('a sound with no declared size cannot be shown as a cost, so it is not accepted', () => {
  for (const bytes of [undefined, 0, -1, 1.5, 'small', MAX_SOUND_BYTES + 1]) {
    assert.equal(readPack('p', manifest({ a: sound({ bytes }) }), null).pack, null, `bytes: ${String(bytes)}`);
  }
  assert.ok(readPack('p', manifest({ a: sound({ bytes: MAX_SOUND_BYTES }) }), null).pack, 'the ceiling itself is fine');
});

test('a hash is 64 hex, and case is not a difference', () => {
  const { pack } = readPack('p', manifest({ a: sound({ sha256: HASH.toUpperCase() }) }), null);
  assert.equal(pack?.sounds['a']?.sha256, HASH, 'lowercased, so the store has one name per file');
  assert.equal(readPack('p', manifest({ a: sound({ sha256: 'a'.repeat(63) }) }), null).pack, null);
  assert.equal(readPack('p', manifest({ a: sound({ sha256: 'g'.repeat(64) }) }), null).pack, null);
});

test('an id that would change what a reference points at is not an id', () => {
  // `pack:p/a/b` splits at the first slash, so a sound called `a/b` would be
  // read back as something else entirely. Refused at the door instead.
  assert.equal(readPack('p', manifest({ 'a/b': sound() }), null).pack, null);
  assert.equal(readPack('a/b', manifest({ a: sound() }), null).pack, null);
  assert.equal(readPack('..', manifest({ a: sound() }), null).pack, null, 'nor anything that looks like a path');
  assert.equal(readPack('p', manifest({ '../x': sound() }), null).pack, null);
});

test('a pack with nothing left in it is not a pack', () => {
  // Otherwise it sits in the settings list looking installed, and can never
  // play anything.
  const { pack, dropped } = readPack('p', manifest({ a: sound({ url: 'http://x/a.mp3' }) }), null);
  assert.equal(pack, null);
  assert.deepEqual(dropped, ['a']);
});

test('a licence nobody stated is unknown, not blank', () => {
  const { pack } = readPack('p', manifest({ a: sound({ license: undefined }) }), null);
  assert.equal(pack?.sounds['a']?.license, 'unknown', 'a blank row reads as "none needed", which we cannot claim');
  assert.equal(pack?.sounds['a']?.credit, null);
});

test('a manifest longer than the cap keeps the cap and drops the rest', () => {
  const many: Record<string, unknown> = {};
  for (let i = 0; i < MAX_PACK_SOUNDS + 5; i++) many[`s${i}`] = sound();
  const { pack, dropped } = readPack('p', manifest(many), null);
  assert.equal(Object.keys(pack?.sounds ?? {}).length, MAX_PACK_SOUNDS);
  assert.equal(dropped.length, 5, 'and says which five, rather than silently truncating');
});

test('a fetched manifest names itself, or is named after where it came from', () => {
  const from = (raw: unknown, url: string) => readManifest(raw, url).pack?.id;
  assert.equal(from({ id: 'jackpots', sounds: { a: sound() } }, 'https://x.dev/p.json'), 'jackpots');
  assert.equal(from(manifest({ a: sound() }), 'https://x.dev/p.json'), 'jackpots', 'the display name, slugified');
  assert.equal(from({ name: 'Мои звуки', sounds: { a: sound() } }, 'https://raw.gh.dev/p.json'), 'raw.gh.dev');
  assert.equal(from({ sounds: { a: sound() } }, 'https://raw.gh.dev/p.json'), 'raw.gh.dev');
});

test('a fetched pack remembers the URL it came from', () => {
  const { pack } = readManifest(manifest({ a: sound() }), 'https://x.dev/p.json');
  assert.equal(pack?.source, 'https://x.dev/p.json', 'so the settings list can show where the sounds are from');
});

test('the config block is keyed by id, and a broken pack is dropped whole', () => {
  const packs = readPacks({
    good: { name: 'Good', source: 'https://x.dev/p.json', sounds: { a: sound() } },
    empty: { name: 'Empty', sounds: {} },
    'not an id': { sounds: { a: sound() } },
    nonsense: 42,
  });
  assert.deepEqual(Object.keys(packs), ['good']);
  assert.equal(packs['good']?.id, 'good', 'the key is the id, so a hand edit cannot make the two disagree');
});

test('a reference goes out and comes back the same', () => {
  assert.equal(packRef('jackpots', 'vine-boom'), 'pack:jackpots/vine-boom');
  assert.deepEqual(parsePackRef('pack:jackpots/vine-boom'), { pack: 'jackpots', sound: 'vine-boom' });
  assert.equal(parsePackRef('builtin:jackpot'), null);
  assert.equal(parsePackRef('C:/sounds/a.mp3'), null);
  assert.equal(parsePackRef('pack:jackpots'), null, 'half a reference points at nothing');
  assert.equal(parsePackRef('pack:/boom'), null);
  assert.equal(parsePackRef('pack:jackpots/'), null);
});

test('a reference into a pack that is gone resolves to nothing, not to a crash', () => {
  const packs = readPacks({ p: { sounds: { a: sound() } } });
  assert.equal(packedSound(packs, packRef('p', 'a'))?.sha256, HASH);
  assert.equal(packedSound(packs, packRef('p', 'missing')), null);
  assert.equal(packedSound(packs, packRef('missing', 'a')), null);
  assert.equal(packedSound(packs, 'builtin:jackpot'), null);
});

test('a file two packs share is wanted by both', () => {
  // The store is keyed by content, so removing one pack must not delete a file
  // the other still plays.
  const packs = readPacks({
    one: { sounds: { a: sound() } },
    two: { sounds: { b: sound(), c: sound({ sha256: OTHER }) } },
  });
  assert.deepEqual([...referencedHashes(packs)].sort(), [HASH, OTHER].sort());
  assert.deepEqual([...referencedHashes({ two: packs['two']! })].sort(), [HASH, OTHER].sort());
  assert.deepEqual([...referencedHashes({})], []);
});

test('an imported sound is named so a person can pick it out of a list', () => {
  assert.equal(importedSoundId('Coin Drop', 411642), 'coin-drop-411642');
  assert.equal(importedSoundId('COINS!!!', 7), 'coins-7');
  // The catalogue id carries the uniqueness, so two sounds with one name are
  // two entries and re-importing one replaces itself.
  assert.notEqual(importedSoundId('coin', 1), importedSoundId('coin', 2));
  assert.equal(importedSoundId('coin', 1), importedSoundId('coin', 1));
});

test('a name that slugs to nothing still gives a usable id', () => {
  // A Cyrillic or CJK title has no ASCII to keep, and an id is not the place to
  // start transliterating.
  assert.equal(importedSoundId('Мои звуки', 99), '99');
  assert.equal(importedSoundId('', 99), '99');
  assert.equal(importedSoundId('...', 99), '99');
});

test('an imported id is a legal pack id, whatever the name was', () => {
  for (const name of ['Coin Drop', 'a/b/c', '  ..spaced.. ', 'Мои звуки', 'x'.repeat(200)]) {
    const id = importedSoundId(name, 5);
    const { pack } = readPack('p', { sounds: { [id]: sound() } }, null);
    assert.ok(pack?.sounds[id], `${name} -> ${id} must survive the reader`);
  }
});
