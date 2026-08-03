import "server-only";
import { cache } from "react";
import { getTranslations } from "next-intl/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/i18n/routing";
import type { ProductCardData } from "@/lib/catalog/queries";

/** Product detail, read from the projection. */

export type ProductSpecRow = {
  fieldKey: string;
  fieldGroup: string;
  label: string;
  value: string;
  unit: string | null;
};

export type ProductDetail = {
  id: string;
  mtrl: number;
  slug: string;
  name: string;
  shortDescription: string | null;
  longDescription: string | null;
  sku: string;
  mpn: string;
  ean: string;
  brand: { name: string; slug: string; logo: string | null } | null;
  category: { name: string; slug: string } | null;
  images: Array<{ id: string; url: string }>;
  priceNet: number | null;
  priceListNet: number | null;
  vatRate: number;
  qty: number;
  inStock: boolean;
  weight: number | null;
  width: number | null;
  height: number | null;
  length: number | null;
  guaranteeMonths: number | null;
  specs: ProductSpecRow[];
  specGroups: Array<{ group: string; label: string; rows: ProductSpecRow[] }>;
};

/** The four headings above the spec table — message keys, not words. */
const SPEC_GROUPS = ["identification", "physical", "technical", "performance"] as const;

function num(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export const getProductBySlug = cache(
  async (slug: string, locale: Locale): Promise<ProductDetail | null> => {
    const product = await prisma.product.findFirst({
      where: { slug, isActive: true },
      include: {
        images: { orderBy: [{ isFeature: "desc" }, { order: "asc" }], take: 8 },
        translations: true,
        specs: { where: { locale }, orderBy: { order: "asc" } },
      },
    });
    if (!product) return null;

    // Greek specs are the fallback: en/it spec rows are frequently absent even
    // when the translated name exists.
    let specs = product.specs;
    if (specs.length === 0 && locale !== "el") {
      specs = await prisma.productSpec.findMany({
        where: { productId: product.id, locale: "el" },
        orderBy: { order: "asc" },
      });
    }

    const translation =
      product.translations.find((t) => t.locale === locale) ??
      product.translations.find((t) => t.locale === "el");

    const [brand, category] = await Promise.all([
      product.mtrmark != null
        ? prisma.brand.findFirst({
            where: { mtrmark: product.mtrmark },
            select: { slug: true, logo: true, nameEl: true, nameEn: true, nameIt: true },
          })
        : null,
      product.mtrcategory != null
        ? prisma.category.findFirst({
            where: { erpType: "CATEGORY", erpCode: String(product.mtrcategory) },
            select: { slug: true, nameEl: true, nameEn: true, nameIt: true },
          })
        : null,
    ]);

    const pick = (row: { nameEl: string; nameEn: string; nameIt: string }) =>
      locale === "en" ? row.nameEn || row.nameEl : locale === "it" ? row.nameIt || row.nameEl : row.nameEl;

    const specRows: ProductSpecRow[] = specs.map((s) => ({
      fieldKey: s.fieldKey,
      fieldGroup: s.fieldGroup,
      label: s.label ?? s.fieldKey,
      value: s.value,
      unit: s.unit,
    }));

    const t = await getTranslations({ locale, namespace: "pdp.specGroups" });
    const specGroups = SPEC_GROUPS
      .map((group) => ({
        group,
        label: t(group),
        rows: specRows.filter((r) => r.fieldGroup === group),
      }))
      .filter((g) => g.rows.length > 0);

    return {
      id: product.id,
      mtrl: product.mtrl,
      slug: product.slug,
      name: translation?.name?.trim() || product.name,
      shortDescription: translation?.shortDescription ?? null,
      longDescription: translation?.longDescription ?? null,
      sku: product.code,
      mpn: product.code2 || "—",
      ean: product.code1 || "—",
      brand: brand ? { name: pick(brand), slug: brand.slug, logo: brand.logo } : null,
      category: category ? { name: pick(category), slug: category.slug } : null,
      images: product.images.map((i) => ({ id: i.id, url: i.url })),
      priceNet: num(product.priceNet),
      priceListNet: num(product.priceList),
      vatRate: num(product.vatRate) ?? 24,
      qty: num(product.qty) ?? 0,
      inStock: product.inStock,
      weight: num(product.weight),
      width: num(product.width),
      height: num(product.height),
      length: num(product.length),
      guaranteeMonths: product.guaranteeMonths,
      specs: specRows,
      specGroups,
    };
  },
);

/** Related products: same subgroup first, then same category. */
export const getRelatedProducts = cache(
  async (mtrl: number, locale: Locale, limit = 5): Promise<ProductCardData[]> => {
    const source = await prisma.product.findUnique({
      where: { mtrl },
      select: { cccSubgroup2: true, mtrgroup: true, mtrcategory: true },
    });
    if (!source) return [];

    // Widening order: same subgroup, then group, then category.
    const scopes: Prisma.ProductWhereInput[] = [];
    if (source.cccSubgroup2 != null) scopes.push({ cccSubgroup2: source.cccSubgroup2 });
    if (source.mtrgroup != null) scopes.push({ mtrgroup: source.mtrgroup });
    if (source.mtrcategory != null) scopes.push({ mtrcategory: source.mtrcategory });

    // One level at a time rather than three queries up front — most products
    // fill the row from their own subgroup.
    const collected: Array<Awaited<ReturnType<typeof fetchScope>>[number]> = [];
    const seen = new Set<number>([mtrl]);

    for (const scope of scopes) {
      if (collected.length >= limit) break;
      const rows = await fetchScope(scope, [...seen], limit - collected.length);
      for (const row of rows) {
        if (seen.has(row.mtrl)) continue;
        seen.add(row.mtrl);
        collected.push(row);
      }
    }

    const brandRows = await prisma.brand.findMany({
      where: { mtrmark: { in: collected.map((c) => c.mtrmark).filter((m): m is number => m != null) } },
      select: { mtrmark: true, slug: true, nameEl: true, nameEn: true, nameIt: true },
    });
    const brands = new Map(
      brandRows.map((b) => [
        b.mtrmark!,
        { slug: b.slug, name: locale === "en" ? b.nameEn : locale === "it" ? b.nameIt : b.nameEl },
      ]),
    );

    return collected.map((row) => {
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
    });
  },
);

function fetchScope(scope: Prisma.ProductWhereInput, excludeMtrl: number[], take: number) {
  return prisma.product.findMany({
    where: { isActive: true, inStock: true, mtrl: { notIn: excludeMtrl }, ...scope },
    orderBy: [{ onSale: "desc" }, { mtrl: "desc" }],
    take,
    select: {
      id: true,
      mtrl: true,
      slug: true,
      name: true,
      code: true,
      code2: true,
      mtrmark: true,
      priceNet: true,
      priceList: true,
      vatRate: true,
      qty: true,
      inStock: true,
      images: { where: { isFeature: true }, take: 1, select: { url: true } },
      translations: { select: { locale: true, name: true } },
    },
  });
}
