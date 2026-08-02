import "server-only";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/i18n/routing";

/**
 * Finding a picture to put in a widget.
 *
 * Marketing almost never wants a new photograph — they want the one already on
 * a product. This is the search behind that: type a name or a code, get
 * products with their images, pick a frame.
 *
 * Search runs against `searchKey`, the same trigram-indexed column the
 * storefront's own search uses, so an operator typing a supplier code finds what
 * a customer typing it would.
 */

export type PickerProduct = {
  id: string;
  slug: string;
  code: string;
  name: string;
  brand: string | null;
  images: Array<{ url: string; width: number | null; height: number | null; isFeature: boolean }>;
};

export type PickerCategory = {
  id: string;
  slug: string;
  name: string;
  productCount: number;
  image: string | null;
};

/** Names are columns rather than rows on both Category and Brand — pick the
 *  one for this locale, falling back to Greek so nothing renders blank. */
function categoryName(
  row: { nameEl: string; nameEn: string; nameIt: string },
  locale: Locale,
): string {
  const byLocale = { el: row.nameEl, en: row.nameEn, it: row.nameIt } as const;
  // Greek is the fallback rather than empty: a category with no English name
  // should read as its Greek one, not as a blank row nobody can pick.
  return byLocale[locale]?.trim() || row.nameEl;
}

/**
 * Products matching a query, with their photography.
 *
 * Products with no image are excluded. Offering one to somebody looking for a
 * picture wastes the click, and the reason is never visible from the row.
 */
export async function searchProductsForPicker(
  query: string,
  locale: Locale,
  limit = 24,
): Promise<PickerProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const rows = await prisma.product.findMany({
    where: {
      isActive: true,
      images: { some: {} },
      OR: [
        { searchKey: { contains: q.toLowerCase() } },
        { code: { contains: q, mode: "insensitive" } },
        { code1: { contains: q, mode: "insensitive" } },
        { code2: { contains: q, mode: "insensitive" } },
      ],
    },
    take: limit,
    include: {
      translations: { where: { locale }, select: { name: true }, take: 1 },
      images: {
        orderBy: [{ isFeature: "desc" }, { order: "asc" }],
        select: { url: true, width: true, height: true, isFeature: true },
      },
    },
  });

  // Brands join on `mtrmark`, not by relation, so they come in one extra query
  // over the marks actually present rather than a per-row lookup.
  const marks = [...new Set(rows.map((r) => r.mtrmark).filter((m): m is number => m != null))];
  const brands = marks.length
    ? await prisma.brand.findMany({
        where: { mtrmark: { in: marks } },
        select: { mtrmark: true, nameEl: true, nameEn: true, nameIt: true },
      })
    : [];
  const brandByMark = new Map(
    brands.map((b) => [b.mtrmark, categoryName(b, locale)] as const),
  );

  return rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    code: p.code,
    name: p.translations[0]?.name ?? p.name,
    brand: p.mtrmark != null ? (brandByMark.get(p.mtrmark) ?? null) : null,
    // The same CDN file is attached to a product more than once often enough
    // that a picker shows nine tiles for six photographs. The url is the only
    // identity an image has here, so it is the one deduplicated on.
    images: p.images.filter(
      (img, i, all) => all.findIndex((other) => other.url === img.url) === i,
    ),
  }));
}

/**
 * Everything one product can lend to a composition.
 *
 * The banner editor binds a cell to a product and then wants its parts — the
 * photographs especially — laid out by hand. Searching again for a product
 * already chosen is the kind of step that makes a tool feel like a form.
 */
export async function productAssets(
  slug: string,
  locale: Locale,
): Promise<{ name: string; images: string[] } | null> {
  const row = await prisma.product.findUnique({
    where: { slug },
    select: {
      name: true,
      translations: { where: { locale }, select: { name: true }, take: 1 },
      images: {
        orderBy: [{ isFeature: "desc" }, { order: "asc" }],
        select: { url: true },
      },
    },
  });
  if (!row) return null;

  return {
    name: row.translations[0]?.name ?? row.name,
    // Deduplicated by url for the same reason the picker is: the same CDN file
    // is attached twice often enough to show nine tiles for six photographs.
    images: [...new Set(row.images.map((i) => i.url))],
  };
}

export type PickerBrand = { slug: string; name: string; logo: string | null; productCount: number };

/**
 * Brands for the offer wizard.
 *
 * Ordered by catalogue weight with no query, so an empty search offers the ones
 * a campaign is plausibly about rather than whichever sorts first.
 */
export async function searchBrandsForPicker(query: string, locale: Locale): Promise<PickerBrand[]> {
  const q = query.trim();
  const rows = await prisma.brand.findMany({
    where: {
      isEshop: true,
      ...(q.length >= 2 ? { OR: [{ nameEl: { contains: q, mode: "insensitive" } }, { slug: { contains: q } }] } : {}),
    },
    select: { slug: true, nameEl: true, nameEn: true, nameIt: true, logo: true, productCount: true },
    orderBy: { productCount: "desc" },
    take: 40,
  });
  return rows.map((r) => ({
    slug: r.slug,
    name: categoryName(r, locale),
    logo: r.logo,
    productCount: r.productCount,
  }));
}

/**
 * Categories for the category picker.
 *
 * Ordered by product count with no query, so an empty search shows the ones
 * worth featuring rather than whichever happens to sort first.
 */
export async function searchCategoriesForPicker(
  query: string,
  locale: Locale,
  limit = 40,
): Promise<PickerCategory[]> {
  const q = query.trim();

  const rows = await prisma.category.findMany({
    where:
      q.length >= 2
        ? {
            OR: [
              { nameEl: { contains: q, mode: "insensitive" } },
              { nameEn: { contains: q, mode: "insensitive" } },
              { slug: { contains: q, mode: "insensitive" } },
            ],
          }
        : undefined,
    take: limit,
    orderBy: { productCount: "desc" },
    select: {
      id: true,
      slug: true,
      nameEl: true,
      nameEn: true,
      nameIt: true,
      productCount: true,
      mainImage: true,
      heroImage: true,
    },
  });

  return rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: categoryName(c, locale),
    productCount: c.productCount,
    image: c.heroImage ?? c.mainImage,
  }));
}
