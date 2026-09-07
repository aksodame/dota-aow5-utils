/**
 * Whether the report is published.
 *
 * Off. The document, its route, the notice everybody used to meet on arrival
 * and the letter bar along the bottom are all hidden behind this one constant,
 * and in their place the header carries a green strip saying why — the author
 * took the report down by agreement with the developer, while the developer
 * works through what was sent. Flip this back to `true` to publish it again.
 *
 * A plain constant rather than an env var or a query flag: this is an editorial
 * decision that ships with a commit, and it has to be readable by `routes.ts`,
 * which is loaded by `node --test` with no Vite around it.
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
 * its title, the notice's four bullet points — because `SITE` is one static
 * object; that is a summary in a minified bundle, not the document.
 */
/*
 * Annotated `boolean` rather than left to infer `false`. Without it the type is
 * the literal, every guard on it narrows to dead code, and the compiler starts
 * objecting to the other branch of a switch that is meant to be flipped back.
 */
export const isReportEnabled: boolean = false;
