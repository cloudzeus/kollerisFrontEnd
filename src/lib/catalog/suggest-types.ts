/**
 * Suggest wire types.
 *
 * Split from `suggest.ts` (which is `server-only` — it touches Prisma) so the
 * header dropdown can import the shapes it renders. Same split as
 * `cart/options.ts` and `compare/options.ts`.
 */

export type SuggestProduct = {
  id: string;
  slug: string;
  name: string;
  /** Kolleris code. */
  sku: string;
  /** Manufacturer code, when it differs. */
  mpn: string | null;
  brandName: string | null;
  image: string | null;
  priceNet: number | null;
  vatRate: number;
  inStock: boolean;
  qty: number;
};

export type SuggestTaxonomy = {
  slug: string;
  name: string;
  count: number;
};

export type SuggestBrand = SuggestTaxonomy & { logo: string | null };

export type SuggestResult = {
  query: string;
  /** Set when the query is an exact CODE / EAN / MPN. */
  exact: SuggestProduct | null;
  products: SuggestProduct[];
  categories: SuggestTaxonomy[];
  brands: SuggestBrand[];
  /** Everything matching, not just the six shown — drives the "see all" row. */
  totalProducts: number;
};
