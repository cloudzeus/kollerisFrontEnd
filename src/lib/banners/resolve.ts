import "server-only";
import { prisma } from "@/lib/prisma";
import type { BannerContent, CellWidget, LocalisedText, WidgetChrome } from "@/lib/banners/contract";
import type { Locale } from "@/i18n/routing";

/**
 * Turning bound widgets into something renderable.
 *
 * A product widget stores only a slug and which fields to show; a banner cell
 * needs a title, a price and an image. This is where that happens — once, on
 * the server, in one query per source type rather than one per cell. A banner
 * with six product cells is one product query, not six.
 *
 * A binding that no longer resolves — a deleted product, an expired offer —
 * yields null and the cell renders empty. The alternative is a page that throws
 * because somebody archived a product, which is a far worse failure than a gap.
 */

export type ResolvedWidget = {
  cellId: string;
  href: string;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  /** Formatted, VAT-inclusive, ready to print. */
  price: string | null;
  /** Struck-through comparison price, when the product genuinely has one. */
  comparePrice: string | null;
  media: { kind: "none" | "image" | "video"; image: string; video: string; poster: string };
  /** Absolute deadline for a countdown, ISO. Null when there is nothing to count to. */
  countdownTo: string | null;
  chrome: WidgetChrome;
};

const text = (t: LocalisedText, locale: Locale): string =>
  (t[locale] || t.el || "").trim();

const money = (value: number): string =>
  new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(value);

/**
 * Resolve every cell of a banner.
 *
 * Order of the returned array follows the cell ids given, so the renderer can
 * zip it against the template's cells without a lookup.
 */
export async function resolveWidgets(
  content: BannerContent,
  locale: Locale,
): Promise<Map<string, ResolvedWidget>> {
  const entries = Object.entries(content.widgets ?? {});
  const out = new Map<string, ResolvedWidget>();
  if (entries.length === 0) return out;

  // Collect the slugs first, so each source type is one query.
  const productSlugs = entries
    .filter(([, w]) => w.source === "product")
    .map(([, w]) => (w as Extract<CellWidget, { source: "product" }>).slug)
    .filter(Boolean);

  const offerSlugs = entries
    .filter(([, w]) => w.source === "offer")
    .map(([, w]) => (w as Extract<CellWidget, { source: "offer" }>).slug)
    .filter(Boolean);

  const [products, offers] = await Promise.all([
    productSlugs.length
      ? prisma.product.findMany({
          where: { slug: { in: productSlugs } },
          select: {
            slug: true,
            name: true,
            code: true,
            mtrmark: true,
            priceNet: true,
            priceList: true,
            vatRate: true,
            translations: { where: { locale }, select: { name: true, shortDescription: true }, take: 1 },
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

  for (const [cellId, widget] of entries) {
    if (widget.source === "product") {
      const p = productBySlug.get(widget.slug);
      if (!p) continue; // deleted or archived — the cell renders empty

      const vat = 1 + Number(p.vatRate ?? 24) / 100;
      const net = p.priceNet == null ? null : Number(p.priceNet);
      const list = p.priceList == null ? null : Number(p.priceList);

      out.set(cellId, {
        cellId,
        // Derived, never typed. The canonical product URL is the only correct
        // destination for a product tile.
        href: `/proion/${p.slug}`,
        eyebrow: widget.fields.brand
          ? (p.mtrmark != null ? (brandByMark.get(p.mtrmark) ?? "") : "")
          : widget.fields.code
            ? p.code
            : "",
        title: widget.fields.title ? (p.translations[0]?.name ?? p.name) : "",
        body: widget.fields.shortDescription ? (p.translations[0]?.shortDescription ?? "") : "",
        cta: "",
        price: widget.fields.price && net != null ? money(net * vat) : null,
        // Only when there genuinely is one above the selling price — a compare
        // price equal to the price is a discount that does not exist.
        comparePrice:
          widget.fields.comparePrice && list != null && net != null && list > net
            ? money(list * vat)
            : null,
        media: {
          kind: "image",
          image: widget.imageUrl || p.images[0]?.url || "",
          video: "",
          poster: "",
        },
        countdownTo: null,
        chrome: widget.chrome,
      });
      continue;
    }

    if (widget.source === "offer") {
      const o = offerBySlug.get(widget.slug);
      if (!o || !o.isActive) continue;

      out.set(cellId, {
        cellId,
        href: o.href,
        eyebrow: "",
        title: o.title,
        body: "",
        cta: "",
        price: null,
        comparePrice: null,
        media: {
          kind: "image",
          image: (widget.image === "imageWide" ? o.imageWide : o.image) || o.image || "",
          video: "",
          poster: "",
        },
        // A countdown needs an end date. Asking for one without it is not an
        // error — it just has nothing to count to.
        countdownTo: widget.countdown && o.endsAt ? o.endsAt.toISOString() : null,
        chrome: {
          ...widget.chrome,
          // The offer's own badge wins unless the cell overrode it, so "-30%"
          // is written once on the campaign and not re-typed per banner.
          badge: widget.chrome.badge || o.badge || "",
        },
      });
      continue;
    }

    out.set(cellId, {
      cellId,
      href: widget.href || "/katalogos",
      eyebrow: text(widget.subheading, locale),
      title: text(widget.heading, locale),
      body: text(widget.body, locale),
      cta: text(widget.cta, locale),
      price: null,
      comparePrice: null,
      media: widget.media,
      countdownTo: null,
      chrome: widget.chrome,
    });
  }

  return out;
}
