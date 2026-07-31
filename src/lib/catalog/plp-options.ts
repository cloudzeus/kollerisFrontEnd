/**
 * PLP option lists and result types.
 *
 * Deliberately separate from `plp.ts`: that module is `server-only` (it touches
 * Prisma), while the toolbar and sidebar are client components that need these
 * same constants. Importing them from `plp.ts` pulled `node:module` into the
 * client bundle and broke the build.
 */

export const SORT_OPTIONS = [
  { value: "relevance", label: "Προτεινόμενα" },
  { value: "price-asc", label: "Τιμή: χαμηλή → υψηλή" },
  { value: "price-desc", label: "Τιμή: υψηλή → χαμηλή" },
  { value: "name-asc", label: "Όνομα Α → Ω" },
  { value: "newest", label: "Νεότερα πρώτα" },
] as const;

export type SortValue = (typeof SORT_OPTIONS)[number]["value"];

export const PER_PAGE_OPTIONS = [24, 48, 96] as const;
export const PER_ROW_OPTIONS = [2, 3, 4, 5] as const;

export type FacetItem = { slug: string; label: string; count: number; active: boolean };

export type PlpFacets = {
  subcategories: FacetItem[];
  brands: FacetItem[];
  availability: FacetItem[];
  priceBounds: { min: number; max: number };
  flags: { sale: number; isNew: number };
};

/**
 * Price bands offered in the filter.
 *
 * Fixed round numbers rather than fractions of the catalogue maximum: a band
 * reading "< 487 €" is arithmetic, not a choice anyone recognises. `max: null`
 * means open-ended.
 */
export const PRICE_BANDS: Array<{ label: string; min: number | null; max: number | null }> = [
  { label: "Έως 50 €", min: null, max: 50 },
  { label: "50 – 150 €", min: 50, max: 150 },
  { label: "150 – 500 €", min: 150, max: 500 },
  { label: "Έως 500 €", min: null, max: 500 },
  { label: "Άνω των 500 €", min: 500, max: null },
];
