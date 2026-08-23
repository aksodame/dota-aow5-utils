import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkNickname, nicknameKey } from './nickname.ts';

const accept = (raw: string) => {
  const verdict = checkNickname(raw);
  assert.equal(verdict.ok, true, `expected ${JSON.stringify(raw)} to be accepted, got ${JSON.stringify(verdict)}`);
  return verdict as { ok: true; nickname: string; key: string };
};

const reject = (raw: unknown, error: string) => {
  const verdict = checkNickname(raw);
  assert.equal(verdict.ok, false, `expected ${JSON.stringify(raw)} to be rejected`);
  assert.equal((verdict as { ok: false; error: string }).error, error);
};

test('ordinary names in either script are accepted', () => {
  for (const name of ['Vasya', 'вася', 'user_1', 'a-b-c', 'abc', 'Пётр', 'x'.repeat(24), 'КрысаБоец']) {
    accept(name);
  }
});

test('length is counted in code points, not UTF-16 units', () => {
  reject('ab', 'too-short');
  accept('abc');
  accept('я'.repeat(24));
  reject('я'.repeat(25), 'too-long');
});

test('separators may not lead, trail or double up', () => {
  reject('-abc', 'bad-separator');
  reject('abc_', 'bad-separator');
  reject('a__b', 'bad-separator');
  reject('a-_b', 'bad-separator');
  accept('a_b-c');
});

test('a name has to contain a letter', () => {
  reject('1_2', 'no-letter');
  reject('123', 'no-letter');
});

test('anything outside the two allowed scripts is refused', () => {
  for (const name of ['a b', 'a.b', 'a@b', 'abc😀', 'αβγ', '日本語', 'مرحبا']) {
    reject(name, 'bad-character');
  }
});

test('control characters are stripped rather than smuggled through', () => {
  // stripControl removes them, so what is left is judged on its own merits.
  assert.equal(accept('vas\u0000ya').nickname, 'vasya');
});

test('mixing Latin and Cyrillic is refused — this is the homoglyph defence', () => {
  // `аdmin` with a Cyrillic а renders identically to `admin`.
  reject('аdmin', 'mixed-script');
  reject('Vася', 'mixed-script');
  reject('вasya', 'mixed-script');
});

test('the key folds case in both scripts', () => {
  assert.equal(nicknameKey('Вася'), nicknameKey('вася'));
  assert.equal(nicknameKey('ВАСЯ'), nicknameKey('вася'));
  assert.equal(nicknameKey('Vasya'), nicknameKey('VASYA'));
  // The one SQLite's NOCASE would get wrong, which is why the key exists.
  assert.notEqual(nicknameKey('Вася'), 'Вася');
});

test('the key folds ё to е, so Пётр and Петр are one name', () => {
  assert.equal(nicknameKey('Пётр'), nicknameKey('Петр'));
  // The ё survives in what gets displayed, though.
  assert.equal(accept('Пётр').nickname, 'Пётр');
});

test('the key is idempotent', () => {
  for (const name of ['Вася', 'Пётр', 'Vasya_1']) {
    assert.equal(nicknameKey(nicknameKey(name)), nicknameKey(name));
  }
});

test('decomposed й is composed before it is judged', () => {
  const decomposed = 'йва';
  assert.equal(decomposed.normalize('NFC'), 'йва');
  assert.equal(accept(decomposed).nickname, 'йва');
});

test('reserved names are refused in every casing and both scripts', () => {
  for (const name of ['admin', 'Admin', 'ADMIN', 'админ', 'АДМИН', 'moderator', 'deleted', 'deleted_12', 'removed3']) {
    reject(name, 'reserved');
  }
  // `удалён` folds to `удален`, which is the entry in the list.
  reject('удалён', 'reserved');
});

test('the homoglyph gap that the single-script rule does NOT close', () => {
  // Documented rather than papered over: these are two different names that
  // render identically, and closing that needs a full confusables table.
  const latin = 'cop';
  const cyrillic = 'сор';
  accept(latin);
  accept(cyrillic);
  assert.notEqual(nicknameKey(latin), nicknameKey(cyrillic));
});

test('a non-string is refused rather than coerced', () => {
  for (const value of [undefined, null, 42, {}, []]) reject(value, 'required');
});
