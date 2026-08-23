/**
 * Turning what somebody typed into an FTS5 MATCH expression.
 *
 * FTS5 has a query language, and a search box does not. `AND`, `OR`, `NOT`,
 * `NEAR`, `*`, `^`, `:`, `-` and `"` all mean something in it, so pasting user
 * input straight in is at best a syntax error and at worst a query that means
 * something the person did not ask for. Every one of those characters is
 * removed here, and each surviving term is quoted — inside double quotes FTS5
 * treats a term as a literal string, which is exactly what a search box means.
 *
 * This is the most valuable test in the API: it is pure, it is the boundary
 * between user input and a query language, and every case in its test file is
 * something that would otherwise have thrown at runtime.
 */

/** Beyond this, somebody is pasting an essay rather than searching. */
const MAX_TERMS = 8;
const MAX_TERM_LENGTH = 40;

/**
 * Everything FTS5 reads as syntax.
 *
 * Replaced with a space rather than deleted, so `foo-bar` searches for two
 * terms instead of silently becoming the single word `foobar`.
 */
const SYNTAX = /["'()*^:{}[\]~+\-\\/,.!?;=<>|&%$#@`]/g;

export interface FtsQuery {
  /** The MATCH expression, or null when there is nothing to search for. */
  match: string | null;
  /** The terms that survived, for highlighting or for saying what was searched. */
  terms: string[];
}

export function buildFtsQuery(raw: string): FtsQuery {
  const terms = raw
    .replace(SYNTAX, ' ')
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term !== '')
    // A single character matches most of the table and costs a full scan of the
    // index to say so.
    .filter((term) => [...term].length >= 2)
    .map((term) => [...term].slice(0, MAX_TERM_LENGTH).join(''))
    .slice(0, MAX_TERMS);

  if (terms.length === 0) return { match: null, terms: [] };

  /*
   * Every term quoted, and the last one given a prefix wildcard.
   *
   * The wildcard goes outside the quotes because that is where FTS5 wants it,
   * and only on the last term because that is the one still being typed — a
   * search for "axe jun" should find "axe jungle" while "axe" stays exact.
   */
  const quoted = terms.map((term, index) =>
    index === terms.length - 1 ? `"${term}"*` : `"${term}"`,
  );

  return { match: quoted.join(' AND '), terms };
}
