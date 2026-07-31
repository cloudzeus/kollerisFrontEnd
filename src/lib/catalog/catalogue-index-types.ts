/**
 * Catalogue index wire types.
 *
 * Split from `catalogue-index.ts` (which is `server-only` — it touches Prisma)
 * so the taxonomy finder, a client component, can import the shape it filters.
 * Same split as `cart/options.ts` and `compare/options.ts`.
 */

export type CatalogueTier = "feature" | "standard" | "tail";

export type CatalogueNode = {
  slug: string;
  name: string;
  level: "CATEGORY" | "GROUP" | "SUBGROUP";
  count: number;
  childCount: number;
  /** Ancestors, outermost first — "ΕΡΓΑΛΕΙΑ ΧΕΙΡΟΣ" › "ΚΛΕΙΔΙΑ". */
  path: string[];
  /** `searchKey(name + path)`, precomputed so filtering is a plain `includes`. */
  key: string;
};
