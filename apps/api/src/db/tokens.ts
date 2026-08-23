/**
 * The injection tokens, in a file that imports nothing.
 *
 * They lived in `db.module.ts` until a provider in that same module needed one:
 * the provider imports the module for the token, the module imports the
 * provider to register it, and at the moment the provider's decorators run the
 * token is still `undefined`. Nest then falls back to the reflected parameter
 * type and fails with "can't resolve dependencies … argument Function at index
 * [0]", which says nothing about the real cause.
 *
 * A leaf file cannot take part in a cycle, so this is the fix and also the
 * reason it stays separate.
 */
export const DB = Symbol('Db');
export const SQLITE = Symbol('Sqlite');
