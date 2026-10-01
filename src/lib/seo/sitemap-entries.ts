import type { MetadataRoute } from "next";
import { absoluteUrl, sitemapAlternates } from "@/lib/seo/urls";

/**
 * The sitemap's entries, from rows already read. Pure, so it can be tested
 * without a database.
 *
 * ── lastmod ────────────────────────────────────────────────────────────────
 *
 * Only what has a real timestamp gets one: products, categories and brands
 * carry their row's `updatedAt`. The pages below have no row, and they used to
 * be stamped with the time of the request — every fetch of the sitemap said
 * the home page, the catalogue and the FAQ had all changed a moment ago. A
 * crawler that is lied to by `lastmod` learns to ignore it, for the products
 * too. No date is honest; a fake one is not.
 */

type ChangeFrequency = MetadataRoute.Sitemap[number]["changeFrequency"];
type Row = { slug: string; updatedAt: Date };

/** Pages that exist without a database row. */
export const STATIC_PATHS: Array<{
  path: string;
  priority: number;
  changeFrequency: ChangeFrequency;
}> = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/katalogos", priority: 0.9, changeFrequency: "daily" },
  { path: "/prosfores", priority: 0.8, changeFrequency: "daily" },
  { path: "/nees-afixeis", priority: 0.8, changeFrequency: "daily" },
  { path: "/brands", priority: 0.7, changeFrequency: "weekly" },
  { path: "/etaireia", priority: 0.5, changeFrequency: "monthly" },
  { path: "/epikoinonia", priority: 0.6, changeFrequency: "monthly" },
  { path: "/syxnes-erotiseis", priority: 0.5, changeFrequency: "monthly" },
  { path: "/blog", priority: 0.6, changeFrequency: "weekly" },
  { path: "/logariasmos/entopismos", priority: 0.4, changeFrequency: "monthly" },
];

function entry(
  path: string,
  lastModified: Date | undefined,
  priority: number,
  changeFrequency: ChangeFrequency,
): MetadataRoute.Sitemap[number] {
  return {
    url: absoluteUrl(path),
    ...(lastModified ? { lastModified } : {}),
    changeFrequency,
    priority,
    alternates: { languages: sitemapAlternates(path) },
  };
}

export function buildSitemap(rows: {
  products: Row[];
  categories: Row[];
  brands: Row[];
}): MetadataRoute.Sitemap {
  return [
    ...STATIC_PATHS.map((s) => entry(s.path, undefined, s.priority, s.changeFrequency)),
    ...rows.categories.map((c) => entry(`/katalogos/${c.slug}`, c.updatedAt, 0.7, "weekly")),
    ...rows.brands.map((b) => entry(`/brands/${b.slug}`, b.updatedAt, 0.6, "weekly")),
    ...rows.products.map((p) => entry(`/proion/${p.slug}`, p.updatedAt, 0.6, "weekly")),
  ];
}
