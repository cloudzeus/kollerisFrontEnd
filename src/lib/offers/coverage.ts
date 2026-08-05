import "server-only";
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
 * The campaigns covering a given set of products.
 *
 * One query per campaign rather than per product: there are at most a handful
 * of live campaigns and thousands of products, so the cheap direction is to ask
 * each campaign which of these it claims.
 *
 * Returns a map keyed by product slug, because that is what a card and a
 * product page both already hold.
 */
export type CampaignMark = {
  slug: string;
  title: string;
  badge: string;
  href: string;
};

export async function campaignsForProducts(
  productSlugs: string[],
  locale: string,
): Promise<Map<string, CampaignMark[]>> {
  const marks = new Map<string, CampaignMark[]>();
  if (productSlugs.length === 0) return marks;

  const now = new Date();
  const campaigns = await prisma.offer.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    select: {
      slug: true, titleEl: true, titleEn: true, titleIt: true, badge: true,
      scope: true, productSlugs: true, brandSlug: true, categorySlug: true,
    },
  });
  if (campaigns.length === 0) return marks;

  for (const campaign of campaigns) {
    const where = await campaignWhere(campaign);
    if (!where) continue;

    const covered = await prisma.product.findMany({
      where: { AND: [where, { slug: { in: productSlugs } }] },
      select: { slug: true },
    });
    if (covered.length === 0) continue;

    const mark: CampaignMark = {
      slug: campaign.slug,
      title:
        (locale === "en" ? campaign.titleEn : locale === "it" ? campaign.titleIt : campaign.titleEl) ||
        campaign.titleEl,
      badge: campaign.badge ?? "",
      href: `/prosfores/${campaign.slug}`,
    };

    for (const product of covered) {
      const list = marks.get(product.slug);
      if (list) list.push(mark);
      else marks.set(product.slug, [mark]);
    }
  }

  return marks;
}
