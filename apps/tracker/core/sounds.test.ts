import assert from 'node:assert/strict';
import test from 'node:test';
import { BUILTIN_JACKPOT, DEFAULT_SOUNDS, LIMIT, readSoundSettings, soundLabel, VOLUME } from './sounds.ts';

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
