/**
 * What the translations screen shows.
 *
 * Split from `coverage.ts` because that module is `server-only` and the screen
 * that renders these numbers is a client component.
 */

export type TranslatableSource = "categories" | "products" | "offers";

export type SourceCoverage = {
  id: TranslatableSource;
  label: string;
  hint: string;
  total: number;
  /** Rows still showing Greek, per target language. */
  missing: { en: number; it: number };
  /** Whether this screen can fill the gaps itself. */
  translatable: boolean;
};

/**
 * Interface copy written straight into the components.
 *
 * Not a source this screen can fix — it is a code change, not a data one — but
 * it is by far the largest gap, and a translations screen that quietly omitted
 * it would be reporting a shop as translated while most of what a visitor reads
 * stays Greek. Measured with a script over `src/app/[locale]` and
 * `src/components`, admin excluded.
 */
export const HARDCODED_UI = {
  strings: 3375,
  files: 78,
  inMessages: 14,
};
