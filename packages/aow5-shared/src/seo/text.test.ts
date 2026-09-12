import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampWidth, oneLine, textWidth, wrapWidth } from './text.ts';

test('a Han character is twice the width of a Latin one', () => {
  assert.equal(textWidth('abcd'), 4);
  assert.equal(textWidth('配装'), 4);
  assert.equal(textWidth('i'), 0.5, 'the narrow band');
});

test('Cyrillic measures like Latin', () => {
  assert.equal(textWidth('Сборки'), 6);
});

test('an astral character is measured once, not twice', () => {
  // A CJK extension-B ideograph: two UTF-16 code units, one wide glyph.
  assert.equal(textWidth('\u{20000}'), 2);
  assert.equal('\u{20000}'.length, 2, 'and .length would have said 2 units');
});

test('clampWidth leaves anything inside the budget alone', () => {
  assert.equal(clampWidth('short', 20), 'short');
});

test('clampWidth backs up to a word boundary when one is close', () => {
  const out = clampWidth('Frost-lock Axe for the deep tiers', 20);
  assert.ok(out.endsWith('…'), out);
  assert.ok(textWidth(out) <= 20, `${out} is ${textWidth(out)}`);
  assert.ok(!out.includes('dee…'), 'it should not cut mid-word when a space is near');
});

test('clampWidth cuts Chinese at the character, having no spaces to find', () => {
  const out = clampWidth('浏览自定义游戏的配装攻略与装备搭配', 10);
  assert.ok(textWidth(out) <= 10, `${out} is ${textWidth(out)}`);
  assert.ok(out.endsWith('…'));
});

test('clampWidth does not leave dangling punctuation before the ellipsis', () => {
  assert.ok(!clampWidth('Axe, Frozen Plain, tier six and beyond', 14).includes(',…'));
});

test('oneLine collapses the newlines a body is stored with', () => {
  assert.equal(oneLine('  first\n\nsecond\tthird  '), 'first second third');
});

test('wrapWidth splits on spaces and respects the budget', () => {
  const lines = wrapWidth('one two three four five six seven', 12, 2);
  assert.equal(lines.length, 2);
  for (const line of lines) assert.ok(textWidth(line) <= 12, line);
});

test('wrapWidth breaks a word that is wider than the whole line', () => {
  const lines = wrapWidth('配装攻略与装备搭配指南', 8, 2);
  assert.ok(lines.length <= 2);
  for (const line of lines) assert.ok(textWidth(line) <= 8, line);
});

test('wrapWidth truncates rather than returning more lines than asked for', () => {
  const lines = wrapWidth('a b c d e f g h i j k l m n o p q r s t u v', 6, 2);
  assert.equal(lines.length, 2);
  assert.ok(lines[1]?.endsWith('…'), lines[1]);
});

test('wrapWidth on text that fits returns one line and no ellipsis', () => {
  assert.deepEqual(wrapWidth('Frost-lock Axe', 40, 2), ['Frost-lock Axe']);
});
