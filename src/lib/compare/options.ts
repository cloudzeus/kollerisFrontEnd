/**
 * Compare options and view types.
 *
 * Separate from `compare.ts` (which is `server-only` — it reads cookies and
 * Prisma) so the card checkbox and the tray can share the same constants
 * without pulling `next/headers` into the browser bundle. Same split as
 * `cart/options.ts` and `catalog/plp-options.ts`.
 */

export const COMPARE_COOKIE = "KOLLERIS_COMPARE";

/**
 * Four columns.
 *
 * Not an arbitrary cap: at 1440 the matrix gives each column 240–290px, which
 * is the narrowest a Greek product name renders at without wrapping to four
 * lines. A fifth column would either overflow the shell or force a horizontal
 * scroller, and horizontal scrollers are out on this project.
 */
export const COMPARE_MAX = 4;

export const COMPARE_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // a week

/**
 * Which spec fields may be ranked, and which way is better.
 *
 * Deliberately short. A field earns a place here only when the direction is
 * unambiguous AND the projection stores it as a single measurement with a
 * unit — see `numeric.ts` for why "1,500 RPM" makes this a real hazard.
 * Anything absent is displayed and diffed, never crowned.
 */
export const SPEC_DIRECTION: Record<string, "higher" | "lower"> = {
  torque: "higher",
  maxTorque: "higher",
  maxSpeed: "higher",
  wattage: "higher",
  amperage: "higher",
  dutyCycle: "higher",
  noiseLevel: "lower",
};

/** Row groups, in display order. `commercial` is built from product columns. */
export const COMPARE_GROUPS = [
  { key: "commercial", label: "Εμπορικά στοιχεία" },
  { key: "identification", label: "Ταυτότητα" },
  { key: "technical", label: "Τεχνικά χαρακτηριστικά" },
  { key: "performance", label: "Απόδοση" },
  { key: "physical", label: "Φυσικά χαρακτηριστικά" },
] as const;

export type CompareGroupKey = (typeof COMPARE_GROUPS)[number]["key"];

export type CompareCell = {
  /** Already formatted for display, unit included. `null` when absent. */
  text: string | null;
  /** Set only when the value is safely comparable AND the field is ranked. */
  numeric: number | null;
};

export type CompareRow = {
  key: string;
  label: string;
  cells: CompareCell[];
  /** True when at least two columns carry different text. */
  differs: boolean;
  /**
   * Winning column index, or null. Null on ties, on unranked fields, and
   * whenever any column's value could not be parsed honestly.
   */
  bestIndex: number | null;
  direction: "higher" | "lower" | null;
};

export type CompareRowGroup = {
  key: string;
  label: string;
  rows: CompareRow[];
  differingRows: number;
};

export type CompareColumn = {
  id: string;
  slug: string;
  name: string;
  sku: string;
  brandName: string | null;
  brandSlug: string | null;
  image: string | null;
  priceNet: number | null;
  priceListNet: number | null;
  vatRate: number;
  qty: number;
  inStock: boolean;
};

export type CompareAdvice = {
  key: string;
  badge: string;
  title: string;
  reason: string;
  columnIndex: number;
};

export type CompareView = {
  columns: CompareColumn[];
  groups: CompareRowGroup[];
  totalRows: number;
  differingRows: number;
  /** "ΚΛΕΙΔΙΑ ALLEN" — the shared classification, for the header line. */
  scopeLabel: string | null;
  scopeKey: string | null;
  advice: CompareAdvice[];
  /**
   * Slugs asked for but not rendered — unknown, delisted, or from another
   * subcategory. Shown as a note rather than silently dropped.
   */
  dropped: string[];
};

/** Compact shape for the sticky tray; the tray never needs prices or specs. */
export type CompareTrayItem = {
  slug: string;
  name: string;
  image: string | null;
  brandName: string | null;
};

export type CompareTrayView = {
  items: CompareTrayItem[];
  scopeLabel: string | null;
  /** Slugs, in cookie order — used to build the `?ids=` link. */
  slugs: string[];
};

/**
 * The comparison scope.
 *
 * Comparing a hammer against a torque wrench produces forty rows of "—". So a
 * selection is locked to ONE classification: the narrowest the first-picked
 * product has. SoftOne's hierarchy is CATEGORY → GROUP → SUBGROUP and most
 * products carry all three, so in practice this is the subgroup.
 *
 * Pure and free of Prisma on purpose — the PLP tags every card with its scope
 * key so the grid can grey out the picks that would be refused, without a
 * second query.
 */
export function scopeKeyOf(product: {
  cccSubgroup2: number | null;
  mtrgroup: number | null;
  mtrcategory: number | null;
}): string | null {
  if (product.cccSubgroup2 != null) return `sub:${product.cccSubgroup2}`;
  if (product.mtrgroup != null) return `grp:${product.mtrgroup}`;
  if (product.mtrcategory != null) return `cat:${product.mtrcategory}`;
  return null;
}

export type CompareSelection = { scopeKey: string | null; slugs: string[] };

const EMPTY: CompareSelection = { scopeKey: null, slugs: [] };

/** `sub:311`, `grp:12`, `cat:5` — anything else is a tampered or stale cookie. */
export function isScopeKey(value: string): boolean {
  const [kind, code] = value.split(":");
  return ["sub", "grp", "cat"].includes(kind) && Number.isInteger(Number(code)) && code !== "";
}

export function parseCompareCookie(raw: string | undefined | null): CompareSelection {
  if (!raw) return EMPTY;
  const [scopeKey, list = ""] = raw.split("|");
  if (!scopeKey || !isScopeKey(scopeKey)) return EMPTY;

  const slugs = [
    ...new Set(
      list
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.length <= 140),
    ),
  ].slice(0, COMPARE_MAX);

  return slugs.length ? { scopeKey, slugs } : EMPTY;
}

export function serialiseCompareCookie({ scopeKey, slugs }: CompareSelection): string {
  return `${scopeKey}|${slugs.join(",")}`;
}

/** Parses `?ids=a,b,c`. Accepts an array too, since Next allows repeated keys. */
export function parseIdsParam(value: string | string[] | undefined): string[] {
  const joined = Array.isArray(value) ? value.join(",") : (value ?? "");
  return [
    ...new Set(
      joined
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.length <= 140),
    ),
  ].slice(0, COMPARE_MAX);
}
