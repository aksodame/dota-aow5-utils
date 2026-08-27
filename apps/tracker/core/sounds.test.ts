import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BUILTIN_FAHHH,
  BUILTIN_JACKPOT,
  BUILTIN_UNDERTAKER,
  DEFAULT_SOUNDS,
  GOLD,
  LIMIT,
  readSoundSettings,
  resolveSound,
  soundLabel,
  VOLUME,
} from './sounds.ts';

/**
 * The reader, because it is the part that meets a hand-edited file — and the
 * one where a wrong answer is silent: sounds that do not play look exactly like
 * sounds nobody bound.
 */

test('a config that never heard of sounds gets the defaults, binding included', () => {
  const s = readSoundSettings(undefined);
  assert.equal(s.enabled, true);
  assert.equal(s.limitSeconds, LIMIT.default);
  assert.deepEqual(s.bindings, { item_M504: BUILTIN_JACKPOT }, 'Crimson Heart, out of the box');
});

test('the default bindings are copied, never handed out', () => {
  // A caller mutating what it read must not edit the constant every later read
  // is built from.
  const s = readSoundSettings(undefined);
  s.bindings['item_OTHER'] = 'x';
  assert.deepEqual(DEFAULT_SOUNDS.bindings, { item_M504: BUILTIN_JACKPOT });
});

test('a fresh install rings on the top two grades, and on nothing below them', () => {
  // The five grades under Legendary are where the noise would come from, and
  // they ship empty. `loadConfig` is what hands this to a new profile.
  assert.deepEqual(DEFAULT_SOUNDS.byQuality, { 5: BUILTIN_FAHHH, 6: BUILTIN_UNDERTAKER });
  assert.deepEqual(DEFAULT_SOUNDS.byLevel, {}, 'the level ladder is left to the player');
});

test('an upgrade is never handed those rules, defaults or not', () => {
  // The one case this must not get wrong. A settings block that cannot be read
  // is a first launch *or* a file older than the rules, and only a reader that
  // answers silence for both leaves the second one alone — see `loadConfig`,
  // which is the only place that can tell them apart.
  assert.deepEqual(readSoundSettings(undefined).byQuality, {});
  assert.deepEqual(readSoundSettings('nonsense').byQuality, {});
  assert.deepEqual(readSoundSettings({ bindings: {} }).byQuality, {});
});

test('an empty binding list is a decision and is kept empty', () => {
  // Removing the last binding writes `{}`. Treating that as "absent" would put
  // the jackpot back on the next launch, which is the app arguing with you.
  const s = readSoundSettings({ bindings: {} });
  assert.deepEqual(s.bindings, {});
});

test('null means play it to the end; a number is clamped to the slider', () => {
  assert.equal(readSoundSettings({ limitSeconds: null }).limitSeconds, null);
  assert.equal(readSoundSettings({ limitSeconds: 900 }).limitSeconds, LIMIT.max);
  assert.equal(readSoundSettings({ limitSeconds: 0 }).limitSeconds, LIMIT.min);
  assert.equal(readSoundSettings({ limitSeconds: 'soon' }).limitSeconds, LIMIT.default, 'not a number, not a decision');
});

test('a broken volume costs the volume and nothing else', () => {
  const s = readSoundSettings({ volume: 'loud', bindings: { item_A: 'C:/sounds/a.mp3' } });
  assert.equal(s.volume, VOLUME.default);
  assert.deepEqual(s.bindings, { item_A: 'C:/sounds/a.mp3' }, 'the bindings survived the bad field beside them');
  assert.equal(readSoundSettings({ volume: 40 }).volume, VOLUME.max);
});

test('a binding to nothing is dropped rather than played', () => {
  const s = readSoundSettings({ bindings: { item_A: '', item_B: 42, item_C: 'ok.wav' } });
  assert.deepEqual(s.bindings, { item_C: 'ok.wav' });
});

test('a sound is named by its file, not by where it lives', () => {
  assert.equal(soundLabel(BUILTIN_JACKPOT), 'jackpot');
  assert.equal(soundLabel('C:\\Users\\me\\Sounds\\coins.mp3'), 'coins.mp3');
  assert.equal(soundLabel('/home/me/coins.ogg'), 'coins.ogg');
});

test('a file written before the rules existed has no rules, and stays quiet', () => {
  const s = readSoundSettings({ bindings: { item_A: 'a.mp3' } });
  assert.deepEqual(s.byQuality, {}, 'an upgrade does not start ringing at a whole tier');
  assert.deepEqual(s.byLevel, {});
});

test('a rule for a grade that does not exist is not a rule', () => {
  const s = readSoundSettings({
    byQuality: { 6: 'mythic.mp3', 9: 'nope.mp3', soon: 'nope.mp3', 3: '' },
    byLevel: { 10: 'ten.mp3', 0: 'nope.mp3', 11: 'nope.mp3' },
  });
  assert.deepEqual(s.byQuality, { 6: 'mythic.mp3' });
  assert.deepEqual(s.byLevel, { 10: 'ten.mp3' });
});

test('the item wins, then its rarity, then its level', () => {
  const settings = readSoundSettings({
    bindings: { item_A: 'mine.mp3' },
    byQuality: { 6: 'mythic.mp3' },
    byLevel: { 9: 'nine.mp3' },
  });

  // No floor in this settings block, so the gold is only here to satisfy the
  // signature — the test above it is about the three rules and nothing else.
  const at = (id: string, quality: number, level: number) =>
    resolveSound(settings, { id, quality, level, gold: 0 });

  assert.equal(at('item_A', 6, 9), 'mine.mp3', 'the item itself outranks both grades');
  assert.equal(at('item_B', 6, 9), 'mythic.mp3', 'rarity outranks level');
  assert.equal(at('item_B', 3, 9), 'nine.mp3', 'and level is what is left when rarity says nothing');
  assert.equal(at('item_B', 3, 2), null, 'nothing to say is silence, not a fallback sound');
});

test('a muted item is silent whatever else it matches', () => {
  const settings = readSoundSettings({
    bindings: { item_A: 'mine.mp3' },
    byQuality: { 6: 'mythic.mp3' },
    byLevel: { 9: 'nine.mp3' },
    muted: ['item_A', 'item_B'],
  });

  const at = (id: string, quality: number, level: number) =>
    resolveSound(settings, { id, quality, level, gold: 0 });

  // Over a binding too, and that is the point of it: one place to look when
  // something has gone quiet, rather than two rules that disagree.
  assert.equal(at('item_A', 6, 9), null, 'a mute outranks the item’s own sound');
  assert.equal(at('item_B', 6, 9), null, 'and the tier rule it would otherwise ring on');
  assert.equal(at('item_C', 6, 9), 'mythic.mp3', 'muting one item does not quiet the tier');
});

test('a mute list is read as ids, deduplicated, and never as anything else', () => {
  assert.deepEqual(readSoundSettings({ muted: ['item_A', 'item_A', 'item_B'] }).muted, ['item_A', 'item_B']);
  assert.deepEqual(readSoundSettings({ muted: ['item_A', '', 7, null] }).muted, ['item_A'], 'entry by entry');
  assert.deepEqual(readSoundSettings({ muted: 'item_A' }).muted, [], 'a string is not a list of them');
  assert.deepEqual(readSoundSettings({}).muted, [], 'absent is nothing muted');
});

test('an id the tables have never heard of stays muted', () => {
  // Unlike the grade rules, which are checked against ladders that cannot
  // change: an item id can be renamed by a pak, and dropping it here would
  // un-mute something the player had already turned off.
  const s = readSoundSettings({ muted: ['item_from_a_later_pak'] });
  assert.deepEqual(s.muted, ['item_from_a_later_pak']);
});

test('a floor keeps the tier rule and drops what is under it', () => {
  const settings = readSoundSettings({
    bindings: { item_CHEAP: 'mine.mp3' },
    byQuality: { 6: 'mythic.mp3' },
    minGold: 10_000,
  });

  const at = (id: string, gold: number) => resolveSound(settings, { id, quality: 6, level: 1, gold });

  assert.equal(at('item_A', 10_000), 'mythic.mp3', 'the floor is a floor, not a step above one');
  assert.equal(at('item_A', 9_999), null, 'and a Mythic worth less than it stays quiet');
  // The same argument as the mute: an item that rang despite being under a
  // floor the player set is a silence with no visible cause.
  assert.equal(at('item_CHEAP', 100), null, 'the floor outranks the item’s own sound');
});

test('the mute is asked before the floor, and both before the rules', () => {
  const settings = readSoundSettings({
    byQuality: { 6: 'mythic.mp3' },
    muted: ['item_MUTED'],
    minGold: 1_000,
  });

  const at = (id: string, gold: number) => resolveSound(settings, { id, quality: 6, level: 1, gold });

  assert.equal(at('item_MUTED', 999_999), null, 'a mute is not something a price can argue with');
  assert.equal(at('item_A', 999), null);
  assert.equal(at('item_A', 1_000), 'mythic.mp3');
});

test('no floor means no floor, whatever an item is worth', () => {
  const settings = readSoundSettings({ byQuality: { 6: 'mythic.mp3' } });
  assert.equal(settings.minGold, null, 'absent is off, never a number');
  assert.equal(resolveSound(settings, { id: 'item_A', quality: 6, level: 1, gold: 0 }), 'mythic.mp3');
});

test('a floor that is not a number is no floor at all', () => {
  // The one mistake this field can make that costs a player drops they were
  // listening for, so every unusable value lands on off rather than on a guess.
  assert.equal(readSoundSettings({ minGold: 'lots' }).minGold, null);
  assert.equal(readSoundSettings({ minGold: null }).minGold, null);
  assert.equal(readSoundSettings({ minGold: Infinity }).minGold, null, 'not finite, not a price');
  assert.equal(readSoundSettings({ minGold: -50 }).minGold, GOLD.min, 'clamped, not dropped');
  assert.equal(readSoundSettings({ minGold: 9e9 }).minGold, GOLD.max);
  assert.equal(readSoundSettings({ minGold: 1234.7 }).minGold, 1235, 'gold is whole');
});

test('a fresh install has no floor and nothing muted', () => {
  assert.equal(DEFAULT_SOUNDS.minGold, null);
  assert.deepEqual(DEFAULT_SOUNDS.muted, []);
});
