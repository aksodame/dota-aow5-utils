import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BUILTIN_FAHHH,
  BUILTIN_JACKPOT,
  BUILTIN_UNDERTAKER,
  DEFAULT_SOUNDS,
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

  const at = (id: string, quality: number, level: number) => resolveSound(settings, { id, quality, level });

  assert.equal(at('item_A', 6, 9), 'mine.mp3', 'the item itself outranks both grades');
  assert.equal(at('item_B', 6, 9), 'mythic.mp3', 'rarity outranks level');
  assert.equal(at('item_B', 3, 9), 'nine.mp3', 'and level is what is left when rarity says nothing');
  assert.equal(at('item_B', 3, 2), null, 'nothing to say is silence, not a fallback sound');
});
