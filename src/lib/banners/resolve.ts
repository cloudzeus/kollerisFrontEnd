import "server-only";
import { prisma } from "@/lib/prisma";
import type { BannerContent, Binding } from "@/lib/banners/contract";
import type { ResolvedCell } from "@/lib/banners/resolve-tokens";
import type { Locale } from "@/i18n/routing";

export type { ResolvedCell };
export { applyTokens } from "@/lib/banners/resolve-tokens";

/**
 * Turning a cell's binding into the values its layers print.
 *
 * A bound cell stores a slug and nothing else; the composition refers to the
 * live data through `{token}`s. This is where those get their values — once, on
 * the server, in one query per source type rather than one per cell. A banner
 * with six product cells is one product query, not six.
 *
 * A binding that no longer resolves — a deleted product, an expired offer —
 * yields empty tokens, so its layers render blank rather than taking the page
 * down. A page that throws because somebody archived a product is a far worse
 * failure than a gap.
 */

// The locale decides the separators and where the € sits — "1.234,50 €" in
// Greek and Italian, "€1,234.50" in English.
const format = (value: number, locale: string): string =>
  new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(value);

/** How long until a date, in words. Printed once at render — a banner is not a
 *  checkout timer, and a second hand costs a client component per cell. */
function endsIn(date: Date): string {
  const ms = date.getTime() - Date.now();
  if (ms <= 0) return "";
  const days = Math.floor(ms / 86_400_000);
  if (days > 0) return `${days} ${days === 1 ? "ημέρα" : "ημέρες"}`;
  const hours = Math.max(1, Math.floor(ms / 3_600_000));
  return `${hours} ${hours === 1 ? "ώρα" : "ώρες"}`;
}

export async function resolveCells(
  content: BannerContent,
  locale: Locale,
): Promise<Map<string, ResolvedCell>> {
  const entries = Object.entries(content.cells ?? {});
  const out = new Map<string, ResolvedCell>();
  if (entries.length === 0) return out;

  const slugsOf = (source: "product" | "offer") =>
    entries
      .map(([, c]) => c.binding)
      .filter((b): b is Extract<Binding, { slug: string }> => b.source === source)
      .map((b) => b.slug)
      .filter(Boolean);

  const productSlugs = slugsOf("product");
  const offerSlugs = slugsOf("offer");

  // A set's products join the same query as the single-product cells: ten
  // products in one cell and one in another are eleven rows, not two queries.
  const setSlugs = entries
    .map(([, c]) => c.binding)
    .filter((b): b is Extract<Binding, { slugs: string[] }> => b.source === "products")
    .flatMap((b) => b.slugs);

  const allProductSlugs = [...new Set([...productSlugs, ...setSlugs])];

  const [products, offers] = await Promise.all([
    allProductSlugs.length
      ? prisma.product.findMany({
          where: { slug: { in: allProductSlugs } },
          select: {
            slug: true,
            name: true,
            code: true,
            mtrmark: true,
            priceNet: true,
            priceList: true,
            vatRate: true,
            translations: {
              where: { locale },
              select: { name: true, shortDescription: true },
              take: 1,
            },
            images: {
              orderBy: [{ isFeature: "desc" }, { order: "asc" }],
              select: { url: true },
              take: 1,
            },
          },
        })
      : Promise.resolve([]),
    offerSlugs.length
      ? prisma.offer.findMany({ where: { slug: { in: offerSlugs } } })
      : Promise.resolve([]),
  ]);

  // Brands join on mtrmark rather than by relation — one extra query over the
  // marks actually present, matching how the product picker does it.
  const marks = [...new Set(products.map((p) => p.mtrmark).filter((m): m is number => m != null))];
  const brands = marks.length
    ? await prisma.brand.findMany({
        where: { mtrmark: { in: marks } },
        select: { mtrmark: true, nameEl: true, nameEn: true, nameIt: true },
      })
    : [];
  const brandByMark = new Map(
    brands.map((b) => [
      b.mtrmark,
      (locale === "en" ? b.nameEn : locale === "it" ? b.nameIt : b.nameEl) || b.nameEl,
    ]),
  );

  const productBySlug = new Map(products.map((p) => [p.slug, p]));
  const offerBySlug = new Map(offers.map((o) => [o.slug, o]));

  for (const [cellId, cell] of entries) {
    const binding = cell.binding;

    if (binding.source === "product") {
      const p = productBySlug.get(binding.slug);
      if (!p) {
        out.set(cellId, { tokens: {}, href: cell.href, image: "" });
        continue;
      }

      const vat = 1 + Number(p.vatRate ?? 24) / 100;
      const net = p.priceNet == null ? null : Number(p.priceNet);
      const list = p.priceList == null ? null : Number(p.priceList);

      out.set(cellId, {
        tokens: {
          "{title}": p.translations[0]?.name ?? p.name,
          "{brand}": p.mtrmark != null ? (brandByMark.get(p.mtrmark) ?? "") : "",
          "{code}": p.code,
          "{price}": net == null ? "" : format(net * vat, locale),
          // Only when there genuinely is one above the selling price — a
          // compare price equal to the price is a discount that does not exist.
          "{compare}": list != null && net != null && list > net ? format(list * vat, locale) : "",
          "{desc}": p.translations[0]?.shortDescription ?? "",
          "{image}": p.images[0]?.url ?? "",
        },
        // Derived, never typed. The canonical product URL is the only correct
        // destination for a product tile.
        href: `/proion/${p.slug}`,
        image: p.images[0]?.url ?? "",
      });
      continue;
    }

    if (binding.source === "products") {
      const money = (p: (typeof products)[number]) => {
        const net = p.priceNet == null ? null : Number(p.priceNet);
        if (net == null) return "";
        return format(net * (1 + Number(p.vatRate ?? 24) / 100), locale);
      };

      // Kept in the order they were chosen — the rotation is a running order,
      // and re-sorting it would quietly override a decision somebody made.
      const items = binding.slugs
        .map((slug) => productBySlug.get(slug))
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .map((p) => ({
          slug: p.slug,
          name: p.translations[0]?.name ?? p.name,
          image: p.images[0]?.url ?? "",
          price: money(p),
        }));

      out.set(cellId, {
        tokens: { "{count}": String(items.length), "{image}": items[0]?.image ?? "" },
        href: cell.href,
        image: items[0]?.image ?? "",
        items,
      });
      continue;
    }

    if (binding.source === "offer") {
      const o = offerBySlug.get(binding.slug);
      if (!o || !o.isActive) {
        out.set(cellId, { tokens: {}, href: cell.href, image: "" });
        continue;
      }

      out.set(cellId, {
        tokens: {
          "{title}": (locale === "en" ? o.titleEn : locale === "it" ? o.titleIt : o.titleEl) || o.titleEl,
          "{desc}":
            (locale === "en" ? o.descriptionEn : locale === "it" ? o.descriptionIt : o.descriptionEl) ||
            o.descriptionEl,
          "{badge}": o.badge ?? "",
          "{ends}": o.endsAt ? endsIn(o.endsAt) : "",
          "{image}": o.image ?? "",
          "{imageWide}": o.imageWide || o.image || "",
        },
        href: o.href,
        image: o.imageWide || o.image || "",
      });
      continue;
    }

    out.set(cellId, { tokens: {}, href: cell.href, image: "" });
  }

  return out;
}
