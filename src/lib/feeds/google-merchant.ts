import "server-only";
import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/seo/urls";
import { isPlausibleWeightKg } from "@/lib/shipping/acs-tariff";
import type { Locale } from "@/i18n/routing";

/**
 * The Google Merchant Center feed.
 *
 * Merchant Center is unforgiving in a specific way: it does not reject a bad
 * feed, it rejects the items inside it, one at a time, with a reason you read
 * three days later. So the rules that get things disapproved are enforced here
 * rather than hoped for.
 *
 *   no price      omitted entirely. An item without a price is rejected, and
 *                 sending it just to see it fail costs a review cycle. 50 rows.
 *   no image      omitted. Same reason. Currently none.
 *   invalid GTIN  omitted from the item, not from the feed. 219 of 5.307 `code1`
 *                 values fail their own check digit, and a wrong GTIN is a
 *                 disapproval where an absent one is fine, because every product
 *                 here has both a brand and an MPN.
 *
 * `google_product_category` is deliberately absent. It wants a value from
 * Google's own taxonomy, our 714 categories are SoftOne's, and a guessed
 * mapping puts drills under garden furniture. `product_type` carries our real
 * category path instead, which Google uses to infer, and the mapping can be
 * done properly later without touching this file.
 */

/** EAN-8/12/13/14 check digit. The one rule that turns a code into an identifier. */
export function isValidGtin(raw: string | null | undefined): boolean {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(digits.length)) return false;

  const body = digits.split("").map(Number);
  const check = body.pop()!;
  let sum = 0;
  // Weights alternate 3 and 1, starting at 3 from the rightmost body digit.
  for (let i = body.length - 1, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) {
    sum += body[i]! * weight;
  }
  return (10 - (sum % 10)) % 10 === check;
}

/** XML text. Five characters, and forgetting one breaks the whole document. */
function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Merchant Center truncates past these; better to cut cleanly than be cut. */
const MAX_TITLE = 150;
const MAX_DESCRIPTION = 5000;
/** One main image plus up to ten more, which is Google's own ceiling. */
const MAX_EXTRA_IMAGES = 10;

export async function buildMerchantFeed(locale: Locale = "el"): Promise<string> {
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      priceNet: { gt: 0 },
      images: { some: {} },
    },
    select: {
      mtrl: true, code: true, code1: true, code2: true, slug: true, name: true,
      priceNet: true, vatRate: true, inStock: true, mtrmark: true, weight: true,
      mtrcategory: true, mtrgroup: true, cccSubgroup2: true,
      images: {
        orderBy: [{ isFeature: "desc" }, { order: "asc" }],
        select: { url: true },
        take: MAX_EXTRA_IMAGES + 1,
      },
      translations: {
        where: { locale },
        select: { name: true, shortDescription: true, longDescription: true },
        take: 1,
      },
    },
    orderBy: { mtrl: "asc" },
  });

  // Brands and categories join on ERP codes rather than by relation, the same
  // way the rest of the app resolves them. Two queries, not two per product.
  const marks = [...new Set(products.map((p) => p.mtrmark).filter((m): m is number => m != null))];
  const brands = await prisma.brand.findMany({
    where: { mtrmark: { in: marks } },
    select: { mtrmark: true, nameEl: true, nameEn: true, nameIt: true },
  });
  const brandByMark = new Map(
    brands.map((b) => [b.mtrmark, (locale === "en" ? b.nameEn : locale === "it" ? b.nameIt : b.nameEl) || b.nameEl]),
  );

  const categories = await prisma.category.findMany({
    select: { erpCode: true, erpType: true, nameEl: true, nameEn: true, nameIt: true },
  });
  /*
   * Indexed, not scanned. A `find` over 714 categories, three times per product
   * across 5.257 products, is eleven million comparisons and it was most of the
   * nine seconds this took to build.
   */
  const categoryByKey = new Map(
    categories.map((c) => [
      `${c.erpType}:${Number(c.erpCode)}`,
      (locale === "en" ? c.nameEn : locale === "it" ? c.nameIt : c.nameEl) || c.nameEl,
    ]),
  );
  const categoryName = (type: string, code: number | null) =>
    code == null ? null : (categoryByKey.get(`${type}:${code}`) ?? null);

  const items = products.map((product) => {
    const net = Number(product.priceNet ?? 0);
    const vat = Number(product.vatRate ?? 24);
    const gross = Math.round(net * (1 + vat / 100) * 100) / 100;

    const translation = product.translations[0];
    const title = (translation?.name || product.name).slice(0, MAX_TITLE);
    const description = (
      translation?.shortDescription ||
      translation?.longDescription ||
      translation?.name ||
      product.name
    ).slice(0, MAX_DESCRIPTION);

    const brand = product.mtrmark != null ? brandByMark.get(product.mtrmark) : null;

    // Our own taxonomy, deepest first, as a Google-style path.
    const path = [
      categoryName("CATEGORY", product.mtrcategory),
      categoryName("GROUP", product.mtrgroup),
      categoryName("SUBGROUP", product.cccSubgroup2),
    ].filter(Boolean);

    const [main, ...extra] = product.images;

    const lines = [
      `<g:id>${xml(String(product.mtrl))}</g:id>`,
      `<g:title>${xml(title)}</g:title>`,
      `<g:description>${xml(description)}</g:description>`,
      `<g:link>${xml(absoluteUrl(`/proion/${product.slug}`, locale))}</g:link>`,
      `<g:image_link>${xml(main!.url)}</g:image_link>`,
      ...extra.map((image) => `<g:additional_image_link>${xml(image.url)}</g:additional_image_link>`),
      `<g:availability>${product.inStock ? "in_stock" : "out_of_stock"}</g:availability>`,
      `<g:price>${gross.toFixed(2)} EUR</g:price>`,
      `<g:condition>new</g:condition>`,
      `<g:mpn>${xml(product.code2 || product.code)}</g:mpn>`,
    ];

    if (brand) lines.push(`<g:brand>${xml(brand)}</g:brand>`);
    /*
     * Shipping weight, and only when it can be believed.
     *
     * Merchant Center reported this missing on every item, because it was never
     * emitted. It cannot simply be emitted either: part of the catalogue holds
     * grams in the kilogram column — a 5 EUR Allen key recorded at 140 kg — and
     * Google would price postage from that. `isPlausibleWeightKg` is the same
     * rule the ACS quote applies, imported rather than restated so the feed and
     * the checkout cannot come to different conclusions about one product.
     *
     * Omitted rather than guessed when it fails: Google then falls back to the
     * shipping rules configured in Merchant Center, which is the correct answer
     * for an item whose weight we do not actually know.
     */
    const weightKg = product.weight == null ? null : Number(product.weight);
    if (isPlausibleWeightKg(weightKg)) {
      lines.push(`<g:shipping_weight>${weightKg!.toFixed(3)} kg</g:shipping_weight>`);
    }
    // Only when it survives its own check digit.
    if (isValidGtin(product.code1)) lines.push(`<g:gtin>${xml(product.code1.replace(/\D/g, ""))}</g:gtin>`);
    // A plain ">" here: `xml()` escapes it once. Writing "&gt;" and then escaping
    // that produced "&amp;gt;" in the feed, which Google reads literally.
    if (path.length) lines.push(`<g:product_type>${xml(path.join(" > "))}</g:product_type>`);

    return `<item>${lines.join("")}</item>`;
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    "<channel>",
    "<title>Kolleris</title>",
    `<link>${xml(absoluteUrl("/", locale))}</link>`,
    "<description>Επαγγελματικά εργαλεία και εξοπλισμός</description>",
    ...items,
    "</channel>",
    "</rss>",
  ].join("\n");
}
