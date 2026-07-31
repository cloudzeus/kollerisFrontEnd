import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/i18n/routing";
import { searchKey } from "@/lib/greek";
import type { SuggestResult, SuggestProduct } from "@/lib/catalog/suggest-types";
import {
  SUGGEST_MIN_LENGTH as MIN_LENGTH,
  SUGGEST_PRODUCT_LIMIT as PRODUCT_LIMIT,
  SUGGEST_TAXONOMY_LIMIT as TAXONOMY_LIMIT,
} from "@/lib/catalog/suggest-options";

/**
 * Search-as-you-type.
 *
 * A DELIBERATELY separate query from the results page. The listing needs
 * facets, counts, sorting and pagination; a dropdown needs six rows in under
 * 100ms. Reusing `getPlpData` here would mean running nine facet aggregations
 * per keystroke.
 *
 * Ranking, in order:
 *   1. exact code — someone pasting an SKU wants that SKU, not the best fuzzy
 *      match for its digits, and on a trade catalogue this is the commonest
 *      search there is
 *   2. products whose normalised key contains the normalised query
 *   3. categories and brands, so "milwaukee" offers the brand page rather than
 *      only the first six of its 139 products
 *
 * `searchKey` strips accents, case and final sigma on both sides, so "κνιπεξ"
 * matches ΚΝΙΠΕΞ and "wera" matches Wera.
 */

export { SUGGEST_MIN_LENGTH } from "@/lib/catalog/suggest-options";

function num(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const CARD = {
  id: true,
  slug: true,
  name: true,
  code: true,
  code1: true,
  code2: true,
  mtrmark: true,
  priceNet: true,
  vatRate: true,
  qty: true,
  inStock: true,
  images: { where: { isFeature: true }, take: 1, select: { url: true } },
  translations: { select: { locale: true, name: true } },
} as const;

/**
 * A product whose CODE / EAN / MPN is exactly the query.
 *
 * Shared by the header dropdown and the results page, where it drives the
 * "exact match" band: someone pasting a code from a parts list wants that part,
 * and burying it as result nine of 340 is a failure even though the search
 * technically worked.
 */
export const findByExactCode = cache(
  async (rawQuery: string, locale: Locale): Promise<SuggestProduct | null> => {
    const query = rawQuery.trim().slice(0, 64);
    if (query.length < MIN_LENGTH) return null;

    const candidates = [query, query.toUpperCase(), query.replace(/\s/g, "")];
    const [row, brands] = await Promise.all([
      prisma.product.findFirst({
        where: {
          isActive: true,
          OR: [
            { code: { in: candidates } },
            { code1: { in: candidates } },
            { code2: { in: candidates } },
          ],
        },
        select: CARD,
      }),
      prisma.brand.findMany({
        where: { mtrmark: { not: null } },
        select: { mtrmark: true, nameEl: true, nameEn: true, nameIt: true },
      }),
    ]);
    if (!row) return null;

    const names = new Map(brands.map((b) => [b.mtrmark!, pick(b, locale)]));
    return {
      id: row.id,
      slug: row.slug,
      name: row.translations.find((t) => t.locale === locale)?.name?.trim() || row.name,
      sku: row.code,
      mpn: row.code2 || null,
      brandName: row.mtrmark != null ? (names.get(row.mtrmark) ?? null) : null,
      image: row.images[0]?.url ?? null,
      priceNet: num(row.priceNet),
      vatRate: num(row.vatRate) ?? 24,
      inStock: row.inStock,
      qty: num(row.qty) ?? 0,
    };
  },
);

export async function getSuggestions(
  rawQuery: string,
  locale: Locale,
): Promise<SuggestResult> {
  const query = rawQuery.trim().slice(0, 64);
  const empty: SuggestResult = {
    query,
    exact: null,
    products: [],
    categories: [],
    brands: [],
    totalProducts: 0,
  };

  if (query.length < MIN_LENGTH) return empty;

  const key = searchKey(query);
  const codeCandidates = [query, query.toUpperCase(), query.replace(/\s/g, "")];

  /*
   * All six queries in ONE round-trip.
   *
   * The brand-name lookup used to run AFTER the others, because it depended on
   * the mtrmark values they returned — a second round-trip to a Postgres that
   * is 60ms away, on every keystroke. There are only ~151 brands, so fetching
   * the lot in parallel and looking up locally is strictly cheaper than being
   * clever about which ones are needed.
   */
  const [exactRow, rows, total, categoryRows, brandRows, allBrands] = await Promise.all([
    // Exact code — indexed equality, so this costs nothing even when it misses.
    prisma.product.findFirst({
      where: {
        isActive: true,
        OR: [
          { code: { in: codeCandidates } },
          { code1: { in: codeCandidates } },
          { code2: { in: codeCandidates } },
        ],
      },
      select: CARD,
    }),
    prisma.product.findMany({
      where: { isActive: true, searchKey: { contains: key } },
      // In stock first: suggesting something we cannot ship is a wasted row.
      orderBy: [{ inStock: "desc" }, { qty: "desc" }],
      take: PRODUCT_LIMIT + 1,
      select: CARD,
    }),
    prisma.product.count({ where: { isActive: true, searchKey: { contains: key } } }),
    prisma.category.findMany({
      where: { productCount: { gt: 0 }, nameEl: { contains: query, mode: "insensitive" } },
      orderBy: { productCount: "desc" },
      take: TAXONOMY_LIMIT,
      select: { slug: true, nameEl: true, nameEn: true, nameIt: true, productCount: true },
    }),
    prisma.brand.findMany({
      where: { productCount: { gt: 0 }, nameEl: { contains: query, mode: "insensitive" } },
      orderBy: { productCount: "desc" },
      take: TAXONOMY_LIMIT,
      select: { slug: true, nameEl: true, nameEn: true, nameIt: true, logo: true, productCount: true },
    }),
    prisma.brand.findMany({
      where: { mtrmark: { not: null } },
      select: { mtrmark: true, nameEl: true, nameEn: true, nameIt: true },
    }),
  ]);

  const brandNames = new Map(allBrands.map((b) => [b.mtrmark!, pick(b, locale)]));

  const toProduct = (row: (typeof rows)[number]): SuggestProduct => ({
    id: row.id,
    slug: row.slug,
    name: row.translations.find((t) => t.locale === locale)?.name?.trim() || row.name,
    sku: row.code,
    mpn: row.code2 || null,
    brandName: row.mtrmark != null ? (brandNames.get(row.mtrmark) ?? null) : null,
    image: row.images[0]?.url ?? null,
    priceNet: num(row.priceNet),
    vatRate: num(row.vatRate) ?? 24,
    inStock: row.inStock,
    qty: num(row.qty) ?? 0,
  });

  const exact = exactRow ? toProduct(exactRow) : null;

  return {
    query,
    exact,
    // The exact hit gets its own row above the list; repeating it there would
    // spend one of six slots saying the same thing twice.
    products: rows
      .filter((row) => row.id !== exact?.id)
      .slice(0, PRODUCT_LIMIT)
      .map(toProduct),
    categories: categoryRows.map((c) => ({
      slug: c.slug,
      name: pick(c, locale),
      count: c.productCount,
    })),
    brands: brandRows.map((b) => ({
      slug: b.slug,
      name: pick(b, locale),
      logo: b.logo,
      count: b.productCount,
    })),
    totalProducts: total,
  };
}

function pick(
  row: { nameEl: string; nameEn: string; nameIt: string },
  locale: Locale,
): string {
  if (locale === "en") return row.nameEn || row.nameEl;
  if (locale === "it") return row.nameIt || row.nameEl;
  return row.nameEl;
}
