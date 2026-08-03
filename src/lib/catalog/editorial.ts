import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/i18n/routing";
import type { ProductCardData } from "@/lib/catalog/queries";
import { scopeKeyOf } from "@/lib/compare/options";

/**
 * Data for the three editorial pages: new arrivals, offers, and the company
 * page.
 *
 * They share a file because they share the same idea — every number on them is
 * read from the catalogue at request time. A company page that claims "46 years
 * of stock" and a new-arrivals page that says "new" are both worthless if the
 * claim is hardcoded copy, and both are unarguable if the figure comes from the
 * warehouse.
 */

const CARD = {
  id: true,
  mtrl: true,
  slug: true,
  name: true,
  code: true,
  code2: true,
  mtrmark: true,
  mtrcategory: true,
  mtrgroup: true,
  cccSubgroup2: true,
  priceNet: true,
  priceList: true,
  vatRate: true,
  qty: true,
  inStock: true,
  erpInsertedAt: true,
  images: { where: { isFeature: true }, take: 1, select: { url: true } },
  translations: { select: { locale: true, name: true } },
} as const;

function num(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

type Row = { nameEl: string; nameEn: string; nameIt: string };
const pick = (row: Row, locale: Locale) =>
  locale === "en" ? row.nameEn || row.nameEl : locale === "it" ? row.nameIt || row.nameEl : row.nameEl;

async function brandMap(locale: Locale) {
  const rows = await prisma.brand.findMany({
    where: { mtrmark: { not: null } },
    select: { mtrmark: true, slug: true, nameEl: true, nameEn: true, nameIt: true },
  });
  return new Map(rows.map((b) => [b.mtrmark!, { slug: b.slug, name: pick(b, locale) }]));
}

type Loaded = Awaited<ReturnType<typeof prisma.product.findMany<{ select: typeof CARD }>>>[number];

function toCard(
  row: Loaded,
  brands: Map<number, { slug: string; name: string }>,
  locale: Locale,
): ProductCardData {
  const brand = row.mtrmark != null ? brands.get(row.mtrmark) : undefined;
  return {
    id: row.id,
    mtrl: row.mtrl,
    slug: row.slug,
    name: row.translations.find((t) => t.locale === locale)?.name?.trim() || row.name,
    sku: row.code2 || row.code,
    brandName: brand?.name ?? null,
    brandSlug: brand?.slug ?? null,
    image: row.images[0]?.url ?? null,
    priceNet: num(row.priceNet),
    priceListNet: num(row.priceList),
    vatRate: num(row.vatRate) ?? 24,
    qty: num(row.qty) ?? 0,
    inStock: row.inStock,
    scopeKey: scopeKeyOf(row),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// New arrivals
// ─────────────────────────────────────────────────────────────────────────────

export type ArrivalPeriod = {
  /** `2025-01`, used as the key and the anchor id. */
  key: string;
  label: string;
  /** ISO date of the first arrival in the period, for `<time datetime>`. */
  date: string;
  count: number;
  brands: string[];
  products: ProductCardData[];
};

export type NewArrivals = {
  periods: ArrivalPeriod[];
  /** Rolling windows for the header strip. */
  last30: number;
  last90: number;
  lastYear: number;
  total: number;
  newestAt: string | null;
};

/**
 * Month names in the visitor's language.
 *
 * A hardcoded Greek list is a translation nobody remembers to make — and one
 * `Intl` already ships for every locale, correctly capitalised per language.
 */
const monthNames = (locale: Locale): string[] => {
  const format = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" });
  return Array.from({ length: 12 }, (_, m) => format.format(Date.UTC(2000, m, 1)));
};

/**
 * Arrivals grouped by the month they entered the ERP.
 *
 * `Product.isNew` is false on every row in the projection, so "new" is derived
 * from `erpInsertedAt` — which IS populated, on all 5.305 products, back to
 * 2015. Grouping by month rather than listing newest-first is the whole point
 * of the page: a flat grid of 200 products cannot tell you whether the range
 * moved last week or two years ago.
 */
export const getNewArrivals = cache(
  async (locale: Locale, periodLimit = 6, perPeriod = 10): Promise<NewArrivals> => {
    const MONTHS = monthNames(locale);
    const now = new Date();
    const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

    const [rows, brands, last30, last90, lastYear, total] = await Promise.all([
      prisma.product.findMany({
        where: { isActive: true, erpInsertedAt: { not: null } },
        orderBy: [{ erpInsertedAt: "desc" }, { mtrl: "desc" }],
        // Enough rows to fill `periodLimit` months even when one month is thin.
        take: periodLimit * perPeriod * 4,
        select: CARD,
      }),
      brandMap(locale),
      prisma.product.count({ where: { isActive: true, erpInsertedAt: { gte: daysAgo(30) } } }),
      prisma.product.count({ where: { isActive: true, erpInsertedAt: { gte: daysAgo(90) } } }),
      prisma.product.count({ where: { isActive: true, erpInsertedAt: { gte: daysAgo(365) } } }),
      prisma.product.count({ where: { isActive: true, erpInsertedAt: { not: null } } }),
    ]);

    const buckets = new Map<string, Loaded[]>();
    for (const row of rows) {
      const at = row.erpInsertedAt!;
      const key = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}`;
      (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(row);
    }

    // The per-month COUNT has to come from the database: `rows` is capped, so
    // counting it would under-report any month bigger than the cap.
    const monthCounts = await prisma.$queryRaw<Array<{ month: string; n: bigint }>>`
      SELECT to_char(date_trunc('month', "erpInsertedAt"), 'YYYY-MM') AS month, count(*) AS n
      FROM products
      WHERE "isActive" AND "erpInsertedAt" IS NOT NULL
      GROUP BY 1
    `;
    const countByMonth = new Map(monthCounts.map((r) => [r.month, Number(r.n)]));

    const periods: ArrivalPeriod[] = [...buckets.entries()]
      .slice(0, periodLimit)
      .map(([key, items]) => {
        const [year, month] = key.split("-").map(Number);
        return {
          key,
          label: `${MONTHS[month - 1]} ${year}`,
          date: items[0].erpInsertedAt!.toISOString(),
          count: countByMonth.get(key) ?? items.length,
          brands: [
            ...new Set(
              items
                .map((i) => (i.mtrmark != null ? brands.get(i.mtrmark)?.name : null))
                .filter((n): n is string => !!n),
            ),
          ].slice(0, 6),
          products: items.slice(0, perPeriod).map((row) => toCard(row, brands, locale)),
        };
      });

    return {
      periods,
      last30,
      last90,
      lastYear,
      total,
      newestAt: rows[0]?.erpInsertedAt?.toISOString() ?? null,
    };
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Offers
// ─────────────────────────────────────────────────────────────────────────────

export type OffersView = {
  products: ProductCardData[];
  total: number;
  /** Biggest reduction on offer, as a percentage. */
  bestPercent: number | null;
};

/**
 * Products genuinely on offer.
 *
 * Currently ALWAYS EMPTY, and correctly so. There is no promotional price in
 * the HDCtool feed; the struck-through price this page used to show was the
 * standing gap between two SoftOne price lists, which put 68% of the catalogue
 * permanently "on sale". That was removed on the client's instruction.
 *
 * The query is the real one. The day HDCtool grows a promotional price and the
 * sync populates `priceList` from it, this page fills itself with no further
 * work — which is why it ships now rather than waiting.
 */
export const getOffers = cache(
  async (locale: Locale, limit = 24): Promise<OffersView> => {
    const where = {
      isActive: true,
      onSale: true,
      priceList: { not: null },
      priceNet: { not: null },
    } as const;

    const [rows, total, brands] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: [{ inStock: "desc" }, { mtrl: "desc" }],
        take: limit,
        select: CARD,
      }),
      prisma.product.count({ where }),
      brandMap(locale),
    ]);

    const products = rows.map((row) => toCard(row, brands, locale));
    const percents = products
      .filter((p) => p.priceListNet != null && p.priceNet != null && p.priceListNet > 0)
      .map((p) => Math.round((1 - p.priceNet! / p.priceListNet!) * 100));

    return {
      products,
      total,
      bestPercent: percents.length ? Math.max(...percents) : null,
    };
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Company
// ─────────────────────────────────────────────────────────────────────────────

export type CompanyProof = {
  products: number;
  inStock: number;
  units: number;
  /** Total weight on the shelf, kg. The most tangible number on the page. */
  stockKg: number;
  brands: number;
  categories: number;
  nodes: number;
  images: number;
  specs: number;
  /** Oldest and newest ERP records — how far back the catalogue is documented. */
  oldestAt: string | null;
  newestAt: string | null;
  heaviestCategory: { name: string; slug: string; count: number } | null;
};

/**
 * Live proof for the company page.
 *
 * The point of the page: "46 years in tools" is a claim, and every visitor has
 * read one. "4.644 codes on the shelf, 891 tonnes of them" is checkable, and it
 * is read from the warehouse on every request. An industrial buyer trusts the
 * second and skims past the first.
 */
export const getCompanyProof = cache(async (locale: Locale): Promise<CompanyProof> => {
  const [agg, brands, categories, nodes, images, specs, top] = await Promise.all([
    prisma.$queryRaw<
      Array<{
        products: bigint;
        in_stock: bigint;
        units: number | null;
        kg: number | null;
        oldest: Date | null;
        newest: Date | null;
      }>
    >`
      SELECT count(*) AS products,
             count(*) FILTER (WHERE "inStock") AS in_stock,
             round(sum(qty) FILTER (WHERE "inStock")) AS units,
             round(sum(qty * weight) FILTER (WHERE "inStock" AND weight IS NOT NULL)) AS kg,
             min("erpInsertedAt") AS oldest,
             max("erpInsertedAt") AS newest
      FROM products WHERE "isActive"
    `,
    prisma.product.findMany({
      where: { isActive: true, mtrmark: { not: null } },
      distinct: ["mtrmark"],
      select: { mtrmark: true },
    }),
    prisma.category.count({ where: { erpType: "CATEGORY", productCount: { gt: 0 } } }),
    prisma.category.count({ where: { productCount: { gt: 0 } } }),
    prisma.productImage.count(),
    prisma.productSpec.count(),
    prisma.category.findFirst({
      where: { erpType: "CATEGORY", productCount: { gt: 0 } },
      orderBy: { productCount: "desc" },
      select: { slug: true, nameEl: true, nameEn: true, nameIt: true, productCount: true },
    }),
  ]);

  const a = agg[0];
  return {
    products: Number(a?.products ?? 0),
    inStock: Number(a?.in_stock ?? 0),
    units: Number(a?.units ?? 0),
    stockKg: Number(a?.kg ?? 0),
    brands: brands.length,
    categories,
    nodes,
    images,
    specs,
    oldestAt: a?.oldest?.toISOString() ?? null,
    newestAt: a?.newest?.toISOString() ?? null,
    heaviestCategory: top
      ? { name: pick(top, locale), slug: top.slug, count: top.productCount }
      : null,
  };
});
