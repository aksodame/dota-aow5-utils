/**
 * What `/api/health` reports.
 *
 * `__APP_VERSION__` is substituted by tsup at build time (see tsup.config.ts).
 * `typeof` on an undeclared identifier is legal and yields 'undefined', so this
 * also works when the file is run straight from source by `node --test` or
 * `tsx`, where nothing has been substituted.
 */
declare const __APP_VERSION__: string | undefined;

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
