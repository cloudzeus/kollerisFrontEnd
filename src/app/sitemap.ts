import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { buildSitemap } from "@/lib/seo/sitemap-entries";

/**
 * The sitemap.
 *
 * Every URL carries its translations as `alternates`, which is the part that
 * matters here. Greek is served from the bare path and English and Italian from
 * a prefix, so without them a crawler sees three pages competing rather than
 * one page in three languages — and the two prefixed ones lose, because the
 * bare path has the links.
 *
 * `lastModified` comes from real timestamps. A sitemap that stamps everything
 * with today teaches a crawler to ignore the field, and then the one page that
 * genuinely changed looks like all the others.
 *
 * Priorities are relative and deliberately few: the home page, then the
 * catalogue entry points, then products. Everything at 0.8 is everything at the
 * same priority.
 */

/** Bounded so one query cannot become a 200 MB response as the catalogue grows. */
const MAX_PRODUCTS = 45_000;

/*
 * Built per request, not at deploy time.
 *
 * Next generates a sitemap during `next build` by default, and this one reads
 * 5.821 rows from a database the build container cannot reach. It is also the
 * wrong moment: a sitemap frozen at deploy is stale for every product added
 * between deploys, which is about 45 a day.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories, brands] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      select: { slug: true, updatedAt: true },
      orderBy: { mtrl: "asc" },
      take: MAX_PRODUCTS,
    }),
    prisma.category.findMany({
      // A category with nothing in it is a page that says "no products", and
      // submitting those is how a crawl budget is spent on empty rooms.
      where: { productCount: { gt: 0 } },
      select: { slug: true, updatedAt: true },
    }),
    prisma.brand.findMany({
      where: { productCount: { gt: 0 } },
      select: { slug: true, updatedAt: true },
    }),
  ]);

  /*
   * No blog posts. They are not a table here — the pages read them from
   * HDCtool, whose endpoints do not exist yet (`src/lib/blog/contract.ts`).
   * Listing `/blog` itself is right; inventing entries under it is not, and a
   * sitemap full of 404s is worse than a short one.
   */
  return buildSitemap({ products, categories, brands });
}
