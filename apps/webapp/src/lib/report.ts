/**
 * The two switches the report hangs on, and they are independent on purpose.
 *
 * `isReportEnabled` publishes the document. `isPausedNoticeEnabled` publishes
 * the green strip that explains its absence. Both are off, which is a third
 * state rather than an accident: the report is down and nothing on the site
 * says so. A silent wait.
 *
 * Independent because the notice outlives the decision that produced it. The
 * report can come back without the strip, the strip can go up on its own the
 * day there is something worth saying, and neither move requires touching the
 * other. Chaining the notice to `!isReportEnabled` would have made "report
 * down, saying nothing" unreachable — and that is the state we are in.
 *
 * Plain constants rather than env vars or query flags: these are editorial
 * decisions that ship with a commit, and one of them has to be readable by
 * `routes.ts`, which `node --test` loads with no Vite around it.
 */

/**
 * Whether the report is published.
 *
 * Off. The document, its route, the notice everybody used to meet on arrival,
 * the footer link and the letter bar along the bottom are all behind this one
 * constant. Flip it back to `true` to publish it again.
 *
 * Nothing is deleted from the source. `ROUTES.report`, the three documents and
 * every string they need stay exactly where they are, so turning the report
 * back on is one word and no archaeology.
 *
 * It is deleted from the *build*, though, and that is worth knowing: the value
 * is a literal, so Rollup folds every `isReportEnabled &&` guard away, drops
 * `ReportPage` and `report/documents.ts` with them, and never emits the three
 * `report.*.md` chunks. There is no asset URL left to find. What does still
 * ship is the handful of strings in `i18n/site.ts` that describe the report —
 * its title, the notice's four bullet points, the paused strip's own text —
 * because `SITE` is one static object that every page reads. That is a
 * summary sitting in a minified bundle, not the document.
 */
/*
 * Annotated `boolean` rather than left to infer `false`. Without it the type is
 * the literal, every guard on it narrows to dead code, and the compiler starts
 * objecting to the other branch of a switch that is meant to be flipped back.
 */
export const isReportEnabled: boolean = false;

/**
 * Whether the header says anything about the report being down.
 *
 * Off too. When it is on it puts a green strip where the red teaser used to
 * be — thanks to the people who read the report and wrote in, and a line
 * saying it came down by agreement while the developer works through it.
 *
 * Only consulted while `isReportEnabled` is false. The header has one slot for
 * a strip and the red one wins it: a page cannot both advertise the report and
 * explain its absence.
 *
 * Unlike the flag above, this one does not take its markup out of the build.
 * Rollup folds the outer ternary in `SiteHeader` and drops the red strip with
 * it, but does not fold again on the result, so the green strip's JSX and its
 * three translations ride along in the bundle unrendered. Harmless — the
 * `paused` strings are in `SITE`, which every page reads, so they would ship
 * either way. It is worth knowing only if you assumed this hid the text.
 */
export const isPausedNoticeEnabled: boolean = false;
