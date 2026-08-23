import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFtsQuery } from './ftsQuery.ts';
import { openDb } from '../db/open.ts';

/**
 * Every expression this builds is also run against a real FTS5 table.
 *
 * A unit test that only checks the string would pass just as happily on an
 * expression SQLite refuses to parse, which is the exact failure this file
 * exists to prevent.
 */
function runsAgainstFts5(match: string | null): boolean {
  if (match === null) return true;
  const { sqlite } = openDb({ path: ':memory:' });
  try {
    sqlite.exec("create virtual table t using fts5(title, tokenize='unicode61 remove_diacritics 2')");
    sqlite.prepare('insert into t(title) values (?)').run('axe jungle route');
    sqlite.prepare('select rowid from t where t match ?').all(match);
    return true;
  } catch {
    return false;
  } finally {
    sqlite.close();
  }
}

test('an ordinary search becomes quoted terms with a prefix on the last', () => {
  const query = buildFtsQuery('axe jungle');
  assert.deepEqual(query.terms, ['axe', 'jungle']);
  assert.equal(query.match, '"axe" AND "jungle"*');
  assert.ok(runsAgainstFts5(query.match));
});

test('an empty search is not a query', () => {
  for (const raw of ['', '   ', '\n\t', '*', '-', '""', '()']) {
    assert.equal(buildFtsQuery(raw).match, null, `${JSON.stringify(raw)} should produce no query`);
  }
});

test('every FTS5 operator is disarmed rather than passed through', () => {
  // Each of these parses as syntax in FTS5, and half of them throw. What a
  // person means by typing them into a search box is the literal text.
  for (const raw of [
    'axe AND jungle',
    'axe OR jungle',
    'axe NOT jungle',
    'axe NEAR jungle',
    '"unclosed quote',
    'axe*',
    '^axe',
    'title:axe',
    'axe -jungle',
    'a(b)c',
    'axe**',
    '((((',
    'axe" OR "1"="1',
  ]) {
    const query = buildFtsQuery(raw);
    assert.ok(runsAgainstFts5(query.match), `FTS5 refused the expression built from ${JSON.stringify(raw)}`);
  }
});

test('a bare operator word survives as a literal term, not as syntax', () => {
  // "AND" is quoted, so it searches for the word rather than combining nothing.
  const query = buildFtsQuery('axe AND');
  assert.ok(query.match?.includes('"AND"'), query.match ?? 'no match built');
  assert.ok(runsAgainstFts5(query.match));
});

test('Cyrillic searches work, which is why the tokenizer is unicode61', () => {
  const query = buildFtsQuery('топор лес');
  assert.deepEqual(query.terms, ['топор', 'лес']);
  assert.ok(runsAgainstFts5(query.match));
});

test('an item id survives being searched for', () => {
  // Underscores are not syntax, so this stays one term. The dot and hyphen in
  // other ids do split, which is the right behaviour for a search box.
  const query = buildFtsQuery('item_0099');
  assert.deepEqual(query.terms, ['item_0099']);
  assert.ok(runsAgainstFts5(query.match));
});

test('single characters are dropped rather than scanning the whole index', () => {
  assert.deepEqual(buildFtsQuery('a b axe').terms, ['axe']);
});

test('the number of terms and their length are both capped', () => {
  const many = buildFtsQuery('aa bb cc dd ee ff gg hh ii jj kk ll');
  assert.equal(many.terms.length, 8);

  const long = buildFtsQuery('x'.repeat(200));
  assert.equal(long.terms[0]?.length, 40);
  assert.ok(runsAgainstFts5(long.match));
});

test('a term is matched literally, so a search cannot inject a second clause', () => {
  const query = buildFtsQuery('axe" OR title:"secret');
  // Both quotes were stripped before quoting, so what remains is terms.
  assert.ok(!query.match?.includes('title:'), query.match ?? '');
  assert.ok(runsAgainstFts5(query.match));
});
