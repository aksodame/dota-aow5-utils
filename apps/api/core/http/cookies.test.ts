import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCookies } from './cookies.ts';

test('an ordinary header parses', () => {
  assert.deepEqual(parseCookies('a=1; b=two; c=three'), { a: '1', b: 'two', c: 'three' });
});

test('no header is no cookies, not a crash', () => {
  assert.deepEqual(parseCookies(undefined), {});
  assert.deepEqual(parseCookies(''), {});
});

test('a session token survives a malformed neighbour', () => {
  // The failure this tolerance exists for: one bad pair from an extension must
  // not sign the user out.
  assert.deepEqual(parseCookies('broken; aow5_session=abc.def-ghi_jkl'), { aow5_session: 'abc.def-ghi_jkl' });
  assert.deepEqual(parseCookies('=nothing; aow5_session=keep'), { aow5_session: 'keep' });
});

test('values are percent-decoded, and an invalid escape is kept verbatim', () => {
  assert.deepEqual(parseCookies('r=%2Fbuilder'), { r: '/builder' });
  assert.deepEqual(parseCookies('r=100%'), { r: '100%' });
});

test('a value containing = is not truncated at it', () => {
  // base64 padding is the case that matters — a token ending in = is common.
  assert.deepEqual(parseCookies('t=YWJjZA=='), { t: 'YWJjZA==' });
});

test('a quoted value is unwrapped', () => {
  assert.deepEqual(parseCookies('a="quoted"'), { a: 'quoted' });
});
