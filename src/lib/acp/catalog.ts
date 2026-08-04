import "server-only";
import { prisma } from "@/lib/prisma";
import { searchKey } from "@/lib/greek";
import { resolveCategoryScope } from "@/lib/catalog/plp";
import type { Prisma } from "@/generated/prisma/client";
import type { Locale } from "@/i18n/routing";

/**
 * The catalogue, shaped for an agent.
 *
 * An agent is not a browser. It cannot read a layout, it will quote whatever
 * number it is given, and it repeats a question in slightly different words
 * rather than paging. So the answer is flat, self-describing, and honest about
 * what it does not know.
 *
 * **Price is gross and indicative.** Gross because every price on this
 * storefront is shown with VAT and an agent quoting the net figure would
 * undercut the site by 24%. Indicative because `Product.priceNet` is a
 * projection refreshed from HDCtool, not a live quote: the schema says so, and
 * the real price needs H3, which does not exist. The field carrying that fact
 * travels with the price rather than living in documentation nobody reads.
 *
 * Shipping is deliberately absent. It depends on a postcode and the parcel's
 * chargeable weight, so a "total" here would be a number the basket then
 * contradicts. The product URL is the answer to "what will this actually cost".
 */

export const ACP_MAX_LIMIT = 50;
export const ACP_DEFAULT_LIMIT = 20;

export type AcpProduct = {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  /** Gross, in euros, VAT included. */
  price: number;
  currency: "EUR";
  /**
   * True when the projection last saw stock. Not a reservation: another
   * customer can take the last one between this answer and a checkout.
   */
  in_stock: boolean;
  stock_quantity: number;
  description: string;
  url: string;
  /** VAT is in the number above. Every price on this storefront is gross. */
  price_includes_vat: true;
  /**
   * Never. Postage depends on the delivery postcode and the parcel's
   * chargeable weight, neither of which exists at this point in a conversation.
   */
  price_includes_shipping: false;
  /**
   * The price comes from a projection synced from the ERP, not a live quote, and
   * it carries no postage. An agent must present it as a starting figure and
   * send the customer to the basket for what they will actually pay.
   */
  price_is_final: false;
};

export type AcpQuery = {
  q?: string | null;
  category?: string | null;
  limit?: number | null;
  locale: Locale;
  origin: string;
};

export type AcpResult = {
  products: AcpProduct[];
  total: number;
  limit: number;
  /**
   * A sentence the agent can say out loud.
   *
   * Field names tell a machine what a number means; this tells it what to tell
   * a person. Without it an agent quotes "29,99 €" as the price and the customer
   * meets postage for the first time at the till.
   */
  pricing_note: string;
};

export async function searchCatalog(query: AcpQuery): Promise<AcpResult> {
  const limit = Math.min(
    ACP_MAX_LIMIT,
    Math.max(1, Math.floor(Number(query.limit) || ACP_DEFAULT_LIMIT)),
  );

  const filters: Prisma.ProductWhereInput[] = [{ isActive: true }];

  /*
   * Matched on the normalised key, the same one the storefront search uses, so
   * "ΤΡΥΠΑΝΙ", "τρυπάνι" and "trypani" do not give three different answers to an
   * agent that will happily try all three.
   */
  const term = query.q?.trim();
  if (term) {
    const key = searchKey(term);
    if (key.length >= 2) filters.push({ searchKey: { contains: key } });
  }

  /*
   * Category by slug, resolved through the same helper the listing pages use.
   * A second, subtly different resolution is how an agent and a customer end up
   * looking at different products under one name.
   */
  if (query.category) {
    // Null for a slug that does not exist, which must narrow to nothing rather
    // than widen to the whole catalogue.
    const scope = await resolveCategoryScope(query.category);
    const or: Prisma.ProductWhereInput[] = [];
    if (scope) {
      if (scope.categoryIds.length) or.push({ mtrcategory: { in: scope.categoryIds } });
      if (scope.groupIds.length) or.push({ mtrgroup: { in: scope.groupIds } });
      if (scope.subgroupIds.length) or.push({ cccSubgroup2: { in: scope.subgroupIds } });
    }
    filters.push(or.length ? { OR: or } : { id: "" });
  }

  const where: Prisma.ProductWhereInput = { AND: filters };

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      // In stock first: an agent reads the top of a list and stops.
      orderBy: [{ inStock: "desc" }, { qty: "desc" }, { mtrl: "desc" }],
      take: limit,
      select: {
        id: true, mtrl: true, code: true, code2: true, slug: true, name: true,
        priceNet: true, vatRate: true, qty: true, inStock: true, mtrmark: true,
        translations: {
          where: { locale: query.locale },
          select: { name: true, shortDescription: true },
          take: 1,
        },
      },
    }),
    prisma.product.count({ where }),
  ]);

  /*
   * Brands join on `mtrmark`, not by relation — the projection carries the ERP
   * mark rather than a foreign key, which is how the rest of the app resolves
   * them too. One query over the marks actually present, not one per product.
   */
  const marks = [...new Set(rows.map((r) => r.mtrmark).filter((m): m is number => m != null))];
  const brandRows = marks.length
    ? await prisma.brand.findMany({
        where: { mtrmark: { in: marks } },
        select: { mtrmark: true, nameEl: true, nameEn: true, nameIt: true },
      })
    : [];
  const brandByMark = new Map(
    brandRows.map((b) => [
      b.mtrmark,
      (query.locale === "en" ? b.nameEn : query.locale === "it" ? b.nameIt : b.nameEl) || b.nameEl,
    ]),
  );

  const products = rows.map((row): AcpProduct => {
    const net = Number(row.priceNet ?? 0);
    const vat = Number(row.vatRate ?? 24);
    const translation = row.translations[0];

    return {
      // The ERP id, not our row id: it is the number both systems agree on and
      // the one a support call can be traced by.
      id: `mtrl_${row.mtrl}`,
      sku: row.code2 || row.code,
      name: translation?.name || row.name,
      brand: row.mtrmark != null ? (brandByMark.get(row.mtrmark) ?? null) : null,
      price: Math.round(net * (1 + vat / 100) * 100) / 100,
      currency: "EUR",
      in_stock: row.inStock,
      stock_quantity: Math.max(0, Math.floor(Number(row.qty ?? 0))),
      description: (translation?.shortDescription ?? "").slice(0, 300),
      url: `${query.origin}/proion/${row.slug}`,
      price_includes_vat: true,
      price_includes_shipping: false,
      price_is_final: false,
    };
  });

  return {
    products,
    total,
    limit,
    pricing_note:
      "Prices include Greek VAT and exclude shipping. Shipping is calculated at " +
      "checkout from the delivery postcode and the parcel weight. Stock is " +
      "indicative and is confirmed at checkout.",
  };
}
