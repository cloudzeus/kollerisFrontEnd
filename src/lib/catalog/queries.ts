import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/i18n/routing";

/**
 * Read queries against the local catalogue projection.
 *
 * Everything here hits our own Postgres, never HDCtool — that is the whole
 * point of the projection (BACKEND_ALIGNMENT.md §2). `cache()` dedupes within a
 * single render pass; page-level `revalidate` handles cross-request caching.
 */

/** Picks the right translated column for the active locale, Greek as fallback. */
function localised<T extends { nameEl: string; nameEn: string; nameIt: string }>(
  row: T,
  locale: Locale,
): string {
  if (locale === "en") return row.nameEn || row.nameEl;
  if (locale === "it") return row.nameIt || row.nameEl;
  return row.nameEl;
}

export type CategoryTile = {
  id: string;
  slug: string;
  name: string;
  image: string | null;
  productCount: number;
  childCount: number;
};

/**
 * Root categories for the homepage grid and the "ΑΓΟΡΑ ΑΝΑ ΚΑΤΗΓΟΡΙΑ" band.
 *
 * Only categories that actually have products — the ERP tree carries nodes with
 * zero eshop-listed SKUs (ΑΝΥΨΩΤΙΚΑ is one), and a tile reading "0 ΚΩΔ." is
 * worse than no tile.
 */
export const getRootCategories = cache(
  async (locale: Locale, limit?: number): Promise<CategoryTile[]> => {
    const rows = await prisma.category.findMany({
      where: { erpType: "CATEGORY", productCount: { gt: 0 } },
      orderBy: [{ productCount: "desc" }, { nameEl: "asc" }],
      take: limit,
      select: {
        id: true,
        slug: true,
        nameEl: true,
        nameEn: true,
        nameIt: true,
        mainImage: true,
        productCount: true,
        childCount: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: localised(row, locale),
      image: row.mainImage,
      productCount: row.productCount,
      childCount: row.childCount,
    }));
  },
);

export type MenuCategory = CategoryTile & {
  children: Array<{ id: string; slug: string; name: string; productCount: number }>;
};

/**
 * Category tree for the mega-menu and the mobile drawer: root categories with
 * their immediate children, both filtered to nodes that actually have products.
 *
 * One query for roots, one for children — not one per root. There are 23 roots,
 * so the naive version would be 24 round trips on every page render.
 */
export const getMenuTree = cache(
  async (locale: Locale, childrenPerCategory = 5): Promise<MenuCategory[]> => {
    const roots = await prisma.category.findMany({
      where: { erpType: "CATEGORY", productCount: { gt: 0 } },
      orderBy: [{ productCount: "desc" }, { nameEl: "asc" }],
      select: {
        id: true,
        slug: true,
        nameEl: true,
        nameEn: true,
        nameIt: true,
        mainImage: true,
        productCount: true,
        childCount: true,
      },
    });

    const children = await prisma.category.findMany({
      where: {
        parentId: { in: roots.map((r) => r.id) },
        productCount: { gt: 0 },
      },
      orderBy: [{ productCount: "desc" }, { nameEl: "asc" }],
      select: {
        id: true,
        parentId: true,
        slug: true,
        nameEl: true,
        nameEn: true,
        nameIt: true,
        productCount: true,
      },
    });

    const byParent = new Map<string, typeof children>();
    for (const child of children) {
      if (!child.parentId) continue;
      const list = byParent.get(child.parentId) ?? [];
      if (list.length < childrenPerCategory) list.push(child);
      byParent.set(child.parentId, list);
    }

    return roots.map((root) => ({
      id: root.id,
      slug: root.slug,
      name: localised(root, locale),
      image: root.mainImage,
      productCount: root.productCount,
      childCount: root.childCount,
      children: (byParent.get(root.id) ?? []).map((child) => ({
        id: child.id,
        slug: child.slug,
        name: localised(child, locale),
        productCount: child.productCount,
      })),
    }));
  },
);

export type BrandTile = {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  productCount: number;
};

/** Brands with at least one listed product, biggest first. */
export const getTopBrands = cache(
  async (locale: Locale, limit = 16): Promise<BrandTile[]> => {
    const rows = await prisma.brand.findMany({
      where: { productCount: { gt: 0 } },
      orderBy: { productCount: "desc" },
      take: limit,
      select: {
        id: true,
        slug: true,
        nameEl: true,
        nameEn: true,
        nameIt: true,
        logo: true,
        productCount: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: localised(row, locale),
      logo: row.logo,
      productCount: row.productCount,
    }));
  },
);

export type ProductCardData = {
  id: string;
  mtrl: number;
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
  /**
   * Compare scope (`sub:311`). Set only where a comparison is offered — the PLP
   * and the brand grid — so a card can be greyed out before the click rather
   * than after the server refuses it. See `lib/compare/options.ts`.
   */
  scopeKey?: string | null;
};

const PRODUCT_CARD_SELECT = {
  id: true,
  mtrl: true,
  slug: true,
  name: true,
  code2: true,
  code: true,
  mtrmark: true,
  mtrcategory: true,
  priceNet: true,
  priceList: true,
  vatRate: true,
  qty: true,
  inStock: true,
  images: {
    where: { isFeature: true },
    take: 1,
    select: { url: true },
  },
  translations: {
    select: { locale: true, name: true },
  },
} as const;

type ProductRow = {
  id: string;
  mtrl: number;
  slug: string;
  name: string;
  code: string;
  code2: string;
  mtrmark: number | null;
  mtrcategory: number | null;
  priceNet: unknown;
  priceList: unknown;
  vatRate: unknown;
  qty: unknown;
  inStock: boolean;
  images: Array<{ url: string }>;
  translations: Array<{ locale: string; name: string }>;
};

/** Prisma returns Decimal; the UI wants plain numbers. */
function num(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toCard(
  row: ProductRow,
  locale: Locale,
  brands: Map<number, { name: string; slug: string }>,
): ProductCardData {
  const translated = row.translations.find((t) => t.locale === locale)?.name;
  const brand = row.mtrmark != null ? brands.get(row.mtrmark) : undefined;

  return {
    id: row.id,
    mtrl: row.mtrl,
    slug: row.slug,
    name: translated?.trim() || row.name,
    sku: row.code2 || row.code,
    brandName: brand?.name ?? null,
    brandSlug: brand?.slug ?? null,
    image: row.images[0]?.url ?? null,
    priceNet: num(row.priceNet),
    priceListNet: num(row.priceList),
    vatRate: num(row.vatRate) ?? 24,
    qty: num(row.qty) ?? 0,
    inStock: row.inStock,
  };
}

/** MTRMARK → brand, so product cards can show a brand without a join per row. */
const getBrandsByMtrmark = cache(
  async (locale: Locale): Promise<Map<number, { name: string; slug: string }>> => {
    const rows = await prisma.brand.findMany({
      where: { mtrmark: { not: null } },
      select: { mtrmark: true, slug: true, nameEl: true, nameEn: true, nameIt: true },
    });
    return new Map(
      rows.map((row) => [row.mtrmark!, { name: localised(row, locale), slug: row.slug }]),
    );
  },
);

/**
 * Homepage featured products.
 *
 * A true "most sold" ranking needs HDCtool's ERP sales query
 * (`/api/public/most-sold-products`, which runs SQL 141 against SoftOne). That
 * arrives with the merchandising phase; this is the stand-in.
 *
 * Deliberately spread across categories, max 2 per category. Ranking purely by
 * discount or recency returns eight variants of the same product line — the
 * first version of this query filled the whole band with safety boots, which
 * reads as a shoe shop rather than a tool merchant.
 */
export const getFeaturedProducts = cache(
  async (locale: Locale, limit = 8, perCategory = 2): Promise<ProductCardData[]> => {
    const [rows, brands] = await Promise.all([
      prisma.product.findMany({
        // Over-fetch so there is enough to spread across categories.
        where: { isActive: true, inStock: true, priceNet: { gt: 0 } },
        orderBy: [{ onSale: "desc" }, { erpInsertedAt: "desc" }, { mtrl: "desc" }],
        take: limit * 12,
        select: PRODUCT_CARD_SELECT,
      }),
      getBrandsByMtrmark(locale),
    ]);

    const perCategoryCount = new Map<number | null, number>();
    const picked: ProductRow[] = [];

    for (const row of rows as ProductRow[]) {
      const key = row.mtrcategory ?? null;
      const used = perCategoryCount.get(key) ?? 0;
      if (used >= perCategory) continue;
      perCategoryCount.set(key, used + 1);
      picked.push(row);
      if (picked.length === limit) break;
    }

    // Thin catalogue (or few categories) — top up rather than under-fill the grid.
    if (picked.length < limit) {
      const seen = new Set(picked.map((p) => p.id));
      for (const row of rows as ProductRow[]) {
        if (picked.length === limit) break;
        if (!seen.has(row.id)) picked.push(row);
      }
    }

    return picked.map((row) => toCard(row, locale, brands));
  },
);

/** Newest additions, for the "ΝΕΕΣ ΑΦΙΞΕΙΣ" promo tile copy. */
export const getCatalogueStats = cache(async () => {
  const [products, inStock, brands, categories] = await Promise.all([
    prisma.product.count({ where: { isActive: true } }),
    prisma.product.count({ where: { isActive: true, inStock: true } }),
    prisma.brand.count({ where: { productCount: { gt: 0 } } }),
    prisma.category.count({ where: { erpType: "CATEGORY", productCount: { gt: 0 } } }),
  ]);
  const subcategories = await prisma.category.count({
    where: { erpType: { in: ["GROUP", "SUBGROUP"] }, productCount: { gt: 0 } },
  });

  return { products, inStock, brands, categories, subcategories };
});
