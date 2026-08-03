import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/i18n/routing";

/** What `getTranslations` returns — the comparison table is built server-side,
 *  so its labels have to arrive rather than be looked up in a component. */
type Translator = Awaited<ReturnType<typeof getTranslations>>;
import { formatPrice, grossAmount } from "@/lib/format";
import type { ProductCardData } from "@/lib/catalog/queries";
import { comparableNumber } from "@/lib/compare/numeric";
import { formatSpecValue } from "@/lib/catalog/spec-format";
import {
  COMPARE_COOKIE,
  parseCompareCookie,
  type CompareSelection,
  COMPARE_GROUPS,
  COMPARE_MAX,
  SPEC_DIRECTION,
  scopeKeyOf,
  type CompareAdvice,
  type CompareCell,
  type CompareColumn,
  type CompareRow,
  type CompareRowGroup,
  type CompareTrayView,
  type CompareView,
} from "@/lib/compare/options";

export * from "@/lib/compare/options";

/**
 * Compare reads.
 *
 * The selection lives in a cookie, not in a client store: the tray is rendered
 * into the header chrome of every catalogue page by the server, so the browser
 * never needs to hold the list. The compare page itself takes its columns from
 * `?ids=` instead, which is what makes a comparison shareable and the back
 * button correct.
 */

export type CompareScope = {
  key: string;
  where: { cccSubgroup2?: number; mtrgroup?: number; mtrcategory?: number };
};

/** `scopeKeyOf` plus the Prisma filter that key stands for. */
export function scopeOf(product: {
  cccSubgroup2: number | null;
  mtrgroup: number | null;
  mtrcategory: number | null;
}): CompareScope | null {
  const key = scopeKeyOf(product);
  if (!key) return null;
  const where = whereForScopeKey(key);
  return where ? { key, where } : null;
}

function whereForScopeKey(key: string): CompareScope["where"] | null {
  const [kind, raw] = key.split(":");
  const code = Number(raw);
  if (!Number.isInteger(code)) return null;
  if (kind === "sub") return { cccSubgroup2: code };
  if (kind === "grp") return { mtrgroup: code };
  if (kind === "cat") return { mtrcategory: code };
  return null;
}

/** ERP type that a scope key maps to, for resolving its display name. */
const SCOPE_ERP_TYPE = { sub: "SUBGROUP", grp: "GROUP", cat: "CATEGORY" } as const;

/**
 * Reads the selection cookie. Never writes — like the cart, a read path must
 * not set cookies, or every crawler hit mints one.
 *
 * Format: `scopeKey|slug,slug,slug`. Plain text on purpose: it holds nothing
 * private, and a readable cookie is far easier to support than an opaque id
 * that needs a database row to mean anything.
 */
export const getCompareSelection = cache(async (): Promise<CompareSelection> => {
  const raw = (await cookies()).get(COMPARE_COOKIE)?.value;
  return parseCompareCookie(raw);
});

// ─────────────────────────────────────────────────────────────────────────────
// Tray
// ─────────────────────────────────────────────────────────────────────────────

/** Thumbnails and names for the sticky tray. One query, no prices, no specs. */
export const getCompareTray = cache(async (locale: Locale): Promise<CompareTrayView> => {
  const { scopeKey, slugs } = await getCompareSelection();
  if (slugs.length === 0) return { items: [], scopeLabel: null, slugs: [] };

  const rows = await prisma.product.findMany({
    where: { slug: { in: slugs }, isActive: true },
    select: {
      slug: true,
      name: true,
      mtrmark: true,
      images: { where: { isFeature: true }, take: 1, select: { url: true } },
      translations: { where: { locale }, select: { name: true } },
    },
  });

  const brands = await brandNames(rows.map((r) => r.mtrmark), locale);
  const bySlug = new Map(rows.map((r) => [r.slug, r]));

  // Cookie order wins: the tray must not reshuffle when a product is removed.
  const items = slugs.flatMap((slug) => {
    const row = bySlug.get(slug);
    if (!row) return [];
    return [
      {
        slug: row.slug,
        name: row.translations[0]?.name?.trim() || row.name,
        image: row.images[0]?.url ?? null,
        brandName: row.mtrmark != null ? (brands.get(row.mtrmark)?.name ?? null) : null,
      },
    ];
  });

  return {
    items,
    scopeLabel: scopeKey ? await scopeLabel(scopeKey, locale) : null,
    slugs: items.map((i) => i.slug),
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// The matrix
// ─────────────────────────────────────────────────────────────────────────────

type Loaded = Awaited<ReturnType<typeof loadProducts>>[number];

function loadProducts(slugs: string[], locale: Locale) {
  return prisma.product.findMany({
    where: { slug: { in: slugs }, isActive: true },
    select: {
      id: true,
      slug: true,
      name: true,
      code: true,
      code1: true,
      code2: true,
      mtrmark: true,
      cccSubgroup2: true,
      mtrgroup: true,
      mtrcategory: true,
      priceNet: true,
      priceList: true,
      vatRate: true,
      qty: true,
      inStock: true,
      weight: true,
      width: true,
      length: true,
      height: true,
      guaranteeMonths: true,
      images: { orderBy: [{ isFeature: "desc" }, { order: "asc" }], take: 1, select: { url: true } },
      translations: { where: { locale }, select: { name: true } },
      specs: {
        where: { locale },
        orderBy: { order: "asc" },
        select: { fieldKey: true, fieldGroup: true, label: true, value: true, unit: true, order: true },
      },
    },
  });
}

function num(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function brandNames(mtrmarks: Array<number | null>, locale: Locale) {
  const ids = [...new Set(mtrmarks.filter((m): m is number => m != null))];
  if (ids.length === 0) return new Map<number, { name: string; slug: string }>();
  const rows = await prisma.brand.findMany({
    where: { mtrmark: { in: ids } },
    select: { mtrmark: true, slug: true, nameEl: true, nameEn: true, nameIt: true },
  });
  return new Map(
    rows.map((b) => [
      b.mtrmark!,
      {
        slug: b.slug,
        name: locale === "en" ? b.nameEn || b.nameEl : locale === "it" ? b.nameIt || b.nameEl : b.nameEl,
      },
    ]),
  );
}

async function scopeLabel(key: string, locale: Locale): Promise<string | null> {
  const [kind, code] = key.split(":");
  const erpType = SCOPE_ERP_TYPE[kind as keyof typeof SCOPE_ERP_TYPE];
  if (!erpType) return null;
  const row = await prisma.category.findFirst({
    where: { erpType, erpCode: code },
    select: { nameEl: true, nameEn: true, nameIt: true },
  });
  if (!row) return null;
  return locale === "en" ? row.nameEn || row.nameEl : locale === "it" ? row.nameIt || row.nameEl : row.nameEl;
}

/**
 * Builds one row and decides whether it differs and who, if anyone, wins.
 *
 * A winner requires: a declared direction, EVERY column parsed to a comparable
 * number, and a strict best. Ties and unparseable columns mean no highlight —
 * the alternative is confidently marking the wrong product, which is worse than
 * marking none.
 */
function buildRow(
  key: string,
  label: string,
  cells: Array<{ text: string | null; raw?: string | null; value?: number | null }>,
  direction: "higher" | "lower" | null,
): CompareRow {
  const numerics = cells.map((c) =>
    c.value !== undefined ? c.value : comparableNumber(c.raw ?? c.text),
  );

  let bestIndex: number | null = null;
  if (direction && numerics.length > 1 && numerics.every((n) => n != null)) {
    const values = numerics as number[];
    const best = direction === "higher" ? Math.max(...values) : Math.min(...values);
    const winners = values.reduce<number[]>((acc, v, i) => (v === best ? [...acc, i] : acc), []);
    if (winners.length === 1) bestIndex = winners[0];
  }

  /*
   * A missing value counts as a difference. "A: 5 Nm / B: —" is exactly the
   * kind of row diff-only exists to surface; treating it as identical because
   * only one column answered would hide the most decisive rows in the matrix.
   */
  const texts = cells.map((c) => c.text ?? " ");
  const differs =
    cells.length > 1 && texts.some((t) => t !== " ") && new Set(texts).size > 1;

  const built: CompareCell[] = cells.map((c, i) => ({
    text: c.text,
    numeric: direction ? numerics[i] : null,
  }));

  return { key, label, cells: built, differs, bestIndex, direction };
}

function dimensionsOf(p: Loaded, locale: Locale): string | null {
  const parts = [num(p.width), num(p.length), num(p.height)];
  if (parts.some((v) => v == null || v === 0)) return null;
  return `${parts.map((v) => v!.toLocaleString(locale)).join(" × ")} cm`;
}

/**
 * The compare matrix for a set of slugs.
 *
 * Order follows the caller's slug list, so removing a column never reshuffles
 * the rest. Products that do not exist, are delisted, or belong to a different
 * classification than the first one are dropped and reported in `dropped`
 * rather than silently ignored — a link shared with a bad id should say so.
 */
export async function getCompareView(
  requested: string[],
  locale: Locale,
): Promise<CompareView> {
  const slugs = requested.slice(0, COMPARE_MAX);
  if (slugs.length === 0) {
    return {
      columns: [],
      groups: [],
      totalRows: 0,
      differingRows: 0,
      scopeLabel: null,
      scopeKey: null,
      advice: [],
      dropped: [],
    };
  }

  const rows = await loadProducts(slugs, locale);
  const bySlug = new Map(rows.map((r) => [r.slug, r]));

  const ordered = slugs.flatMap((s) => (bySlug.has(s) ? [bySlug.get(s)!] : []));
  const dropped = slugs.filter((s) => !bySlug.has(s));

  // The first surviving product sets the scope; the rest must match it.
  const scope = ordered.length ? scopeOf(ordered[0]) : null;
  const kept = scope
    ? ordered.filter((p, i) => i === 0 || scopeOf(p)?.key === scope.key)
    : ordered;
  dropped.push(...ordered.filter((p) => !kept.includes(p)).map((p) => p.slug));

  const brands = await brandNames(kept.map((p) => p.mtrmark), locale);

  const columns: CompareColumn[] = kept.map((p) => {
    const brand = p.mtrmark != null ? brands.get(p.mtrmark) : undefined;
    return {
      id: p.id,
      slug: p.slug,
      name: p.translations[0]?.name?.trim() || p.name,
      sku: p.code2 || p.code,
      brandName: brand?.name ?? null,
      brandSlug: brand?.slug ?? null,
      image: p.images[0]?.url ?? null,
      priceNet: num(p.priceNet),
      priceListNet: num(p.priceList),
      vatRate: num(p.vatRate) ?? 24,
      qty: num(p.qty) ?? 0,
      inStock: p.inStock,
    };
  });

  const t = await getTranslations({ locale, namespace: "compare.compare" });
  const groups = buildGroups(kept, columns, t, locale);
  const totalRows = groups.reduce((n, g) => n + g.rows.length, 0);
  const differingRows = groups.reduce((n, g) => n + g.differingRows, 0);

  return {
    columns,
    groups,
    totalRows,
    differingRows,
    scopeKey: scope?.key ?? null,
    scopeLabel: scope ? await scopeLabel(scope.key, locale) : null,
    advice: buildAdvice(kept, columns, groups, t, locale),
    dropped: [...new Set(dropped)],
  };
}

function buildGroups(
  products: Loaded[],
  columns: CompareColumn[],
  t: Translator,
  locale: Locale,
): CompareRowGroup[] {
  const gross = (c: CompareColumn) =>
    c.priceNet != null ? grossAmount(c.priceNet, { vatRate: c.vatRate }) : null;

  const commercial: CompareRow[] = [
    buildRow(
      "price",
      t("timi_me_fpa"),
      columns.map((c) => ({
        text: c.priceNet != null ? formatPrice(c.priceNet, locale, { vatRate: c.vatRate }) : null,
        value: gross(c),
      })),
      "lower",
    ),
    buildRow(
      "availability",
      t("diathesimotita"),
      columns.map((c) => ({
        text: c.inStock ? t("amesa_diathesimo") : t("katopin_paraggelias"),
      })),
      null,
    ),
    buildRow(
      "qty",
      t("apothema"),
      columns.map((c) => ({
        text: c.inStock ? t("temachia", { n: c.qty.toLocaleString(locale) }) : "—",
        value: c.inStock ? c.qty : null,
      })),
      "higher",
    ),
    buildRow(
      "warranty",
      t("eggyisi"),
      products.map((p) => ({
        text: p.guaranteeMonths ? t("mines", { n: p.guaranteeMonths }) : null,
        value: p.guaranteeMonths ?? null,
      })),
      "higher",
    ),
  ];

  const identification: CompareRow[] = [
    buildRow("sku", t("kodikos_kolleris"), products.map((p) => ({ text: p.code || null })), null),
    buildRow("mpn", t("kodikos_kataskeyasti"), products.map((p) => ({ text: p.code2 || null })), null),
    buildRow("ean", "EAN", products.map((p) => ({ text: p.code1 || null })), null),
  ];

  const physical: CompareRow[] = [
    buildRow(
      "weight",
      t("varos"),
      products.map((p) => {
        const w = num(p.weight);
        return { text: w ? `${w.toLocaleString(locale)} kg` : null, value: w || null };
      }),
      "lower",
    ),
    buildRow("dimensions", t("diastaseis"), products.map((p) => ({ text: dimensionsOf(p, locale) })), null),
  ];

  const extra: Record<string, CompareRow[]> = {
    commercial,
    identification,
    physical,
    technical: [],
    performance: [],
  };

  // Spec rows, keyed by field. `brand`, `category` and `subcategory` are
  // dropped: the header carries the brand and the whole comparison is already
  // one classification, so they would be three identical rows in every matrix.
  const skip = new Set(["brand", "category", "subcategory"]);
  const order = new Map<string, number>();
  const meta = new Map<string, { label: string; group: string; unit: string | null }>();

  for (const product of products) {
    for (const spec of product.specs) {
      if (skip.has(spec.fieldKey)) continue;
      if (!meta.has(spec.fieldKey)) {
        meta.set(spec.fieldKey, {
          label: spec.label || spec.fieldKey,
          group: spec.fieldGroup,
          unit: spec.unit,
        });
      }
      const seen = order.get(spec.fieldKey);
      if (seen == null || spec.order < seen) order.set(spec.fieldKey, spec.order);
    }
  }

  const byProduct = products.map(
    (p) => new Map(p.specs.map((s) => [s.fieldKey, s] as const)),
  );

  for (const [fieldKey, info] of [...meta].sort(
    (a, b) => (order.get(a[0]) ?? 0) - (order.get(b[0]) ?? 0),
  )) {
    const row = buildRow(
      fieldKey,
      info.label,
      byProduct.map((specs) => {
        const spec = specs.get(fieldKey);
        if (!spec?.value) return { text: null };
        // Shared with the PDP: the projection often has the unit inside the
        // value already, so appending gives "50 Nm Nm".
        return { text: formatSpecValue(spec.value, spec.unit), raw: spec.value };
      }),
      SPEC_DIRECTION[fieldKey] ?? null,
    );

    (extra[info.group] ?? (extra[info.group] = [])).push(row);
  }

  return COMPARE_GROUPS.map(({ key, label }) => {
    const rows = extra[key] ?? [];
    return { key, label, rows, differingRows: rows.filter((r) => r.differs).length };
  }).filter((g) => g.rows.length > 0);
}

/**
 * "Η επιλογή του υπευθύνου" — server-computed picks.
 *
 * Every pick is a strict winner over a value the ERP owns (price, stock,
 * warranty, weight) or a spec row that already earned a `bestIndex`. Nothing
 * here is editorial; if there is no clear winner the card simply is not shown.
 */
function buildAdvice(
  products: Loaded[],
  columns: CompareColumn[],
  groups: CompareRowGroup[],
  t: Translator,
  locale: Locale,
): CompareAdvice[] {
  if (columns.length < 2) return [];

  const advice: CompareAdvice[] = [];
  const rowOf = (key: string) => groups.flatMap((g) => g.rows).find((r) => r.key === key);

  const price = rowOf("price");
  if (price?.bestIndex != null && price.differs) {
    advice.push({
      key: "cheapest",
      badge: t("oikonomikotero"),
      title: columns[price.bestIndex].name,
      reason: t("logos_oikonomikotero", { price: price.cells[price.bestIndex].text ?? "" }),
      columnIndex: price.bestIndex,
    });
  }

  // Availability only matters as advice when it actually splits the field.
  const inStock = columns.map((c, i) => ({ c, i })).filter(({ c }) => c.inStock);
  if (inStock.length > 0 && inStock.length < columns.length) {
    const pick = inStock.reduce((a, b) => (b.c.qty > a.c.qty ? b : a));
    advice.push({
      key: "available",
      badge: t("amesa_diathesimo"),
      title: pick.c.name,
      reason: t("logos_diathesimo", { n: pick.c.qty.toLocaleString(locale) }),
      columnIndex: pick.i,
    });
  }

  const warranty = rowOf("warranty");
  if (warranty?.bestIndex != null && warranty.differs) {
    advice.push({
      key: "warranty",
      badge: t("megalyteri_eggyisi"),
      title: columns[warranty.bestIndex].name,
      reason: t("logos_eggyisi", { value: warranty.cells[warranty.bestIndex].text ?? "" }),
      columnIndex: warranty.bestIndex,
    });
  }

  // The strongest ranked spec row that produced a winner — torque, power, rpm.
  const spec = groups
    .flatMap((g) => g.rows)
    .find((r) => r.direction === "higher" && r.bestIndex != null && r.differs && SPEC_DIRECTION[r.key]);
  if (spec?.bestIndex != null) {
    advice.push({
      key: "performance",
      badge: t("ischyrotero"),
      title: columns[spec.bestIndex].name,
      reason: t("logos_ischyrotero", { label: spec.label, value: spec.cells[spec.bestIndex].text ?? "" }),
      columnIndex: spec.bestIndex,
    });
  }

  const weight = rowOf("weight");
  if (advice.length < 4 && weight?.bestIndex != null && weight.differs) {
    advice.push({
      key: "lightest",
      badge: t("elafrytero"),
      title: columns[weight.bestIndex].name,
      reason: t("logos_elafrytero", { value: weight.cells[weight.bestIndex].text ?? "" }),
      columnIndex: weight.bestIndex,
    });
  }

  void products;
  return advice.slice(0, 4);
}

/** More of the same classification, for filling empty column slots. */
export async function getCompareSuggestions(
  scopeKey: string | null,
  exclude: string[],
  locale: Locale,
  limit = 5,
): Promise<ProductCardData[]> {
  const where = scopeKey ? whereForScopeKey(scopeKey) : null;
  if (!where) return [];

  const rows = await prisma.product.findMany({
    where: { isActive: true, slug: { notIn: exclude }, ...where },
    orderBy: [{ inStock: "desc" }, { onSale: "desc" }, { mtrl: "desc" }],
    take: limit,
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
      translations: { where: { locale }, select: { name: true } },
    },
  });

  const brands = await brandNames(rows.map((r) => r.mtrmark), locale);

  return rows.map((row) => {
    const brand = row.mtrmark != null ? brands.get(row.mtrmark) : undefined;
    return {
      id: row.id,
      mtrl: row.mtrl,
      slug: row.slug,
      name: row.translations[0]?.name?.trim() || row.name,
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
}
