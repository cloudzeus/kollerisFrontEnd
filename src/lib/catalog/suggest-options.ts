/**
 * Suggest constants shared by the server query and the header dropdown.
 *
 * Separate from `suggest.ts` for the same reason as everywhere else here: that
 * module is `server-only`, and importing it from the client component would
 * drag Prisma into the browser bundle.
 */

/** Below this a query matches most of the catalogue and helps nobody. */
export const SUGGEST_MIN_LENGTH = 2;

/** Rows the dropdown shows before deferring to the results page. */
export const SUGGEST_PRODUCT_LIMIT = 6;
export const SUGGEST_TAXONOMY_LIMIT = 4;

/** Debounce before the request goes out, ms. */
export const SUGGEST_DEBOUNCE_MS = 180;
