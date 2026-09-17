import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Which products a campaign covers, and which campaigns cover a product.
 *
 * A campaign states its reach three ways and each resolves differently against
 * the projection: a list of product slugs is direct, a brand slug becomes an
 * `mtrmark`, and a category slug becomes one of three ERP columns depending on
 * which level of the SoftOne hierarchy it sits at. That last one is why this
 * exists as a module rather than a `where` written at each call site — the PLP
 * already does it, and a second, subtly different copy is how a campaign ends
 * up showing different products on two pages.
 *
 * **Coverage is not price.** Nothing here changes what a product costs. The
 * discount a campaign names is its own claim; `Product.priceNet` is what the
 * basket charges, and until pricing policy lands in HDCtool the two are
 * independent. Every caller shows the campaign as a campaign.
 */

export type CampaignScope = {
  scope: string;
  productSlugs: string[];
  brandSlug: string | null;
  categorySlug: string | null;
};

/** The `where` that selects a campaign's products, or null when it selects none. */
export async function campaignWhere(
  campaign: CampaignScope,
): Promise<Prisma.ProductWhereInput | null> {
  const active = { isActive: true } as const;

  if (campaign.scope === "products") {
    if (campaign.productSlugs.length === 0) return null;
    return { ...active, slug: { in: campaign.productSlugs } };
  }

  if (campaign.scope === "brand") {
    if (!campaign.brandSlug) return null;
    const brand = await prisma.brand.findUnique({
      where: { slug: campaign.brandSlug },
      select: { mtrmark: true },
    });
    // A brand with no `mtrmark` has no products in the projection to match, and
    // returning an unfiltered where would put the whole catalogue on offer.
    if (brand?.mtrmark == null) return null;
    return { ...active, mtrmark: brand.mtrmark };
  }

  if (campaign.scope === "category") {
    if (!campaign.categorySlug) return null;
    const node = await prisma.category.findUnique({
      where: { slug: campaign.categorySlug },
      select: { erpType: true, erpCode: true },
    });
    if (!node) return null;
    const code = Number(node.erpCode);
    if (!Number.isFinite(code)) return null;

    // Which column depends on the level, exactly as the PLP resolves it.
    if (node.erpType === "CATEGORY") return { ...active, mtrcategory: code };
    if (node.erpType === "GROUP") return { ...active, mtrgroup: code };
    return { ...active, cccSubgroup2: code };
  }

  return null;
}

/**
 * Everything covered by ANY live campaign, as one clause.
 *
 * This is what "με προσφορά" on a listing has to mean. It used to mean
 * `Product.onSale`, which is set from `priceList` — and `priceList` is
 * deliberately never populated: the client stopped it because deriving a
 * struck-through "was" price from the gap between two SoftOne price lists put
 * 68% of the catalogue permanently on sale, 2.192 items at exactly −6%, which
 * is not a reduction and is the precise thing the Omnibus directive exists to
 * prevent.
 *
 * So the filter matched zero products and the customer who ticked it got an
 * empty grid — while two real campaigns were running.
 *
 * Returns null when nothing is live, which the caller must turn into "match
 * nothing" rather than "no filter": an empty campaign list means no product is
 * on offer, not that every product is.
 *
 * Memoised per render with `cache()`: one listing asks for it from the main
 * where clause and again from the sale-count facet, and each call is an
 * `offer.findMany` plus one lookup per brand- or category-scoped campaign.
 * Deliberately NOT shared across requests — a campaign that an admin switches
 * off must leave the "με προσφορά" grid on the next page view.
 */
export const activeCampaignsWhere = cache(async (): Promise<Prisma.ProductWhereInput | null> => {
  const now = new Date();
  const campaigns = await prisma.offer.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    select: { scope: true, productSlugs: true, brandSlug: true, categorySlug: true },
  });

  const clauses: Prisma.ProductWhereInput[] = [];
  for (const campaign of campaigns) {
    const where = await campaignWhere(campaign);
    if (where) clauses.push(where);
  }

  if (clauses.length === 0) return null;
  return clauses.length === 1 ? clauses[0] : { OR: clauses };
});
