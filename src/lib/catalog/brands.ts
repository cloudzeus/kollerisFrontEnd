import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/i18n/routing";

/** Brands index + brand detail data, all from the local projection. */

function pick(
  row: { nameEl: string; nameEn: string; nameIt: string },
  locale: Locale,
): string {
  if (locale === "en") return row.nameEn || row.nameEl;
  if (locale === "it") return row.nameIt || row.nameEl;
  return row.nameEl;
}

export type BrandListItem = {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  productCount: number;
  inStockCount: number;
};

export const getBrandsIndex = cache(
  async (locale: Locale): Promise<BrandListItem[]> => {
    const rows = await prisma.brand.findMany({
      where: { productCount: { gt: 0 } },
      orderBy: [{ productCount: "desc" }, { nameEl: "asc" }],
      select: {
        id: true,
        slug: true,
        logo: true,
        productCount: true,
        inStockCount: true,
        nameEl: true,
        nameEn: true,
        nameIt: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: pick(row, locale),
      logo: row.logo,
      productCount: row.productCount,
      inStockCount: row.inStockCount,
    }));
  },
);

export type BrandDetail = BrandListItem & { mtrmark: number | null };

export const getBrandBySlug = cache(
  async (slug: string, locale: Locale): Promise<BrandDetail | null> => {
    const row = await prisma.brand.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        logo: true,
        mtrmark: true,
        productCount: true,
        inStockCount: true,
        nameEl: true,
        nameEn: true,
        nameIt: true,
      },
    });
    if (!row) return null;

    return {
      id: row.id,
      slug: row.slug,
      name: pick(row, locale),
      logo: row.logo,
      mtrmark: row.mtrmark,
      productCount: row.productCount,
      inStockCount: row.inStockCount,
    };
  },
);

export type SpecialtyGroup = {
  categorySlug: string;
  categoryName: string;
  categoryImage: string | null;
  productCount: number;
  brands: Array<{ slug: string; name: string; count: number }>;
};

/**
 * "Ποιο brand για ποια δουλειά" — the biggest categories, each with the brands
 * that actually stock them.
 *
 * Derived from the catalogue rather than curated: a hand-kept list would drift
 * the moment a brand's range changes, and there is no CMS for it yet.
 */
export const getBrandSpecialties = cache(
  async (locale: Locale, groups = 4, brandsPerGroup = 6): Promise<SpecialtyGroup[]> => {
    const categories = await prisma.category.findMany({
      where: { erpType: "CATEGORY", productCount: { gt: 0 } },
      orderBy: { productCount: "desc" },
      take: groups,
      select: {
        slug: true,
        erpCode: true,
        mainImage: true,
        productCount: true,
        nameEl: true,
        nameEn: true,
        nameIt: true,
      },
    });

    const codes = categories
      .map((c) => Number.parseInt(c.erpCode, 10))
      .filter((n) => !Number.isNaN(n));

    // One grouped query for all four categories, not one per category.
    const pairs = await prisma.product.groupBy({
      by: ["mtrcategory", "mtrmark"],
      where: { isActive: true, mtrcategory: { in: codes }, mtrmark: { not: null } },
      _count: { _all: true },
    });

    const brandRows = await prisma.brand.findMany({
      where: { mtrmark: { not: null } },
      select: { mtrmark: true, slug: true, nameEl: true, nameEn: true, nameIt: true },
    });
    const brandByMtrmark = new Map(
      brandRows.map((b) => [b.mtrmark!, { slug: b.slug, name: pick(b, locale) }]),
    );

    return categories.map((category) => {
      const code = Number.parseInt(category.erpCode, 10);
      const brands = pairs
        .filter((p) => p.mtrcategory === code && p.mtrmark != null)
        .map((p) => {
          const brand = brandByMtrmark.get(p.mtrmark!);
          return brand ? { ...brand, count: p._count._all } : null;
        })
        .filter((b): b is { slug: string; name: string; count: number } => b !== null)
        .sort((a, b) => b.count - a.count)
        .slice(0, brandsPerGroup);

      return {
        categorySlug: category.slug,
        categoryName: pick(category, locale),
        categoryImage: category.mainImage,
        productCount: category.productCount,
        brands,
      };
    });
  },
);

/** Headline figures for the brands hero. */
export const getBrandsStats = cache(async () => {
  const [brandCount, inStockBrandCount, productCount, inStockCount] = await Promise.all([
    prisma.brand.count({ where: { productCount: { gt: 0 } } }),
    prisma.brand.count({ where: { inStockCount: { gt: 0 } } }),
    prisma.product.count({ where: { isActive: true } }),
    prisma.product.count({ where: { isActive: true, inStock: true } }),
  ]);
  return { brandCount, inStockBrandCount, productCount, inStockCount };
});
