import { NextResponse, type NextRequest } from "next/server";
import { getProductBySlug } from "@/lib/catalog/pdp";
import { routing, type Locale } from "@/i18n/routing";
import { formatSpecValue } from "@/lib/catalog/spec-format";

/**
 * Quick-view payload.
 *
 * The modal fetches on open rather than the grid shipping full detail for
 * every card — a 96-product page would otherwise carry 96 spec tables and
 * galleries in its RSC payload for content almost nobody opens.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const requested = request.nextUrl.searchParams.get("locale");
  const locale: Locale = routing.locales.includes(requested as Locale)
    ? (requested as Locale)
    : routing.defaultLocale;

  const product = await getProductBySlug(slug, locale);
  if (!product) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Only what the modal renders — no wholesale price, no internal ids.
  return NextResponse.json({
    id: product.id,
    slug: product.slug,
    name: product.name,
    sku: product.sku,
    mpn: product.mpn,
    ean: product.ean,
    shortDescription: product.shortDescription,
    brand: product.brand ? { name: product.brand.name, slug: product.brand.slug } : null,
    images: product.images.map((i) => i.url),
    priceNet: product.priceNet,
    priceListNet: product.priceListNet,
    vatRate: product.vatRate,
    qty: product.qty,
    inStock: product.inStock,
    specs: product.specs.slice(0, 8).map((s) => ({
      label: s.label,
      value: formatSpecValue(s.value, s.unit),
    })),
  });
}
