import { createHash } from "node:crypto";
import { slugify } from "@/lib/greek";

/**
 * What a product's child rows look like, and whether they need rewriting.
 *
 * Pure on purpose — no Prisma, no `server-only` — so the one decision that can
 * silently leave stale data behind ("these rows are unchanged, skip them") is
 * testable without a database.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * Every product write used to delete and re-insert all of its images,
 * translations, specs, colours and sizes: ten statements inside a transaction,
 * for every product in every delivery, whether anything had changed or not.
 * Almost nothing ever has — a delivery is usually a price or a stock level — so
 * that was ten statements of pure churn per product, and dead tuples piling up
 * in `product_specs` and `product_images` for autovacuum to chase.
 *
 * There is no hash column to compare against (and adding one is a manual
 * migration), so the comparison is against the rows themselves, read in one
 * batched query per chunk. Each table is judged on its own: a product whose
 * specs changed rewrites its specs and nothing else.
 *
 * ── The direction of every doubt ───────────────────────────────────────────
 *
 * A false "changed" costs one rewrite, which is exactly what used to happen on
 * every sync. A false "unchanged" leaves the storefront showing old data. So
 * every normalisation below is chosen so that uncertainty reads as a change —
 * never the other way round.
 */

export type ImageRow = { url: string; isFeature: boolean; order: number };

export type TranslationRow = {
  locale: string;
  name: string;
  shortDescription: string | null;
  longDescription: string | null;
  searchKey: string;
};

export type SpecRow = {
  locale: string;
  fieldKey: string;
  fieldGroup: string;
  label: string | null;
  value: string;
  /** A Prisma `Decimal` when read back, a number when built. */
  valueNumeric: number | { toString(): string } | null;
  unit: string | null;
  order: number;
};

export type ColorRow = { externalId: string; name: string; order: number };

export type SizeRow = {
  externalId: string;
  label: string;
  family: string | null;
  order: number;
};

export type ChildRows = {
  images: ImageRow[];
  translations: TranslationRow[];
  specs: SpecRow[];
  colors: ColorRow[];
  sizes: SizeRow[];
};

export type ChildTable = keyof ChildRows;

export const CHILD_TABLES: readonly ChildTable[] = [
  "images",
  "translations",
  "specs",
  "colors",
  "sizes",
];

/** `undefined` and `null` are the same thing once Prisma has written them. */
function nullable<T>(value: T | null | undefined): T | null {
  return value === undefined ? null : value;
}

/**
 * `valueNumeric` is `Decimal(14, 4)`: whatever is written comes back rounded to
 * four places. Compared at that precision so a spec like "1.23456" does not
 * read as changed on every single sync.
 *
 * Postgres rounds half away from zero and `Math.round` rounds half up, so a
 * negative value sitting exactly on a half can still disagree — which costs a
 * rewrite, never a missed change.
 */
function numeric4(value: SpecRow["valueNumeric"]): string | null {
  if (value == null) return null;
  const n = Number(typeof value === "number" ? value : value.toString());
  if (!Number.isFinite(n)) return String(value);
  return (Math.round(n * 10_000) / 10_000).toString();
}

/**
 * Field-by-field, in a fixed order, so the canonical form never depends on
 * the key order of whatever object happened to be passed in. Fields the sync
 * does not write (`ProductImage.width`/`height`, row ids) are left out: they
 * are not the sync's to compare.
 */
const CANONICAL: { [K in ChildTable]: (row: ChildRows[K][number]) => unknown[] } = {
  images: (r) => [r.url, Boolean(r.isFeature), Number(r.order)],
  translations: (r) => [
    r.locale,
    r.name,
    nullable(r.shortDescription),
    nullable(r.longDescription),
    r.searchKey,
  ],
  specs: (r) => [
    r.locale,
    r.fieldKey,
    r.fieldGroup,
    nullable(r.label),
    r.value,
    numeric4(r.valueNumeric),
    nullable(r.unit),
    Number(r.order),
  ],
  colors: (r) => [r.externalId, r.name, Number(r.order)],
  sizes: (r) => [r.externalId, r.label, nullable(r.family), Number(r.order)],
};

/**
 * A content hash of one table's rows for one product.
 *
 * Order-insensitive: rows come back from the database in whatever order the
 * planner likes, and the `order` column — which IS compared — is what the
 * storefront sorts by.
 */
export function tableFingerprint<K extends ChildTable>(
  table: K,
  rows: ReadonlyArray<ChildRows[K][number]>,
): string {
  const canonical = rows
    .map((row) => JSON.stringify(CANONICAL[table](row as never)))
    .sort();
  return createHash("sha256").update(`${table}\n${canonical.join("\n")}`).digest("hex");
}

/**
 * Which tables differ between what is stored and what should be.
 *
 * `stored` undefined means "not known" — a product that does not exist yet, or
 * a caller that did not read the rows — and then every table is rewritten,
 * which is the old behaviour and always correct.
 */
export function changedChildTables(
  desired: ChildRows,
  stored: ChildRows | undefined,
): ChildTable[] {
  if (!stored) return [...CHILD_TABLES];
  return CHILD_TABLES.filter(
    (table) =>
      tableFingerprint(table, desired[table] as never) !==
      tableFingerprint(table, stored[table] as never),
  );
}

// ─── Slugs ──────────────────────────────────────────────────────────────────

/** The slug a product would get if nothing else had it. */
export function slugRoot(base: string, fallback: string): string {
  return slugify(base) || slugify(fallback) || "item";
}

/**
 * `root`, `root-2`, `root-3` … `root-<to>`, starting at suffix `from`.
 *
 * Suffix 1 is the bare root, matching the numbering `uniqueSlug` has always
 * used, so a product allocated here gets the same slug it would have got when
 * the sync loaded every slug in the table.
 */
export function slugCandidates(root: string, from: number, to: number): string[] {
  const out: string[] = [];
  for (let n = Math.max(1, from); n <= to; n++) out.push(n === 1 ? root : `${root}-${n}`);
  return out;
}

/**
 * The first free candidate up to suffix `upTo`, or null when every one of
 * them is taken and the caller has to look further.
 *
 * Null rather than "keep counting": beyond `upTo` the caller has not asked the
 * database, so a slug out there is not known to be free.
 */
export function pickFreeSlug(root: string, taken: ReadonlySet<string>, upTo: number): string | null {
  for (const candidate of slugCandidates(root, 1, upTo)) {
    if (!taken.has(candidate)) return candidate;
  }
  return null;
}
