import { describe, expect, it } from "vitest";
import { STATIC_PATHS, buildSitemap } from "@/lib/seo/sitemap-entries";

describe("sitemap lastmod", () => {
  const product = { slug: "drill-x", updatedAt: new Date("2026-09-01T10:00:00Z") };
  const category = { slug: "drapana", updatedAt: new Date("2026-08-15T00:00:00Z") };
  const brand = { slug: "milwaukee", updatedAt: new Date("2026-07-01T00:00:00Z") };
  const entries = buildSitemap({ products: [product], categories: [category], brands: [brand] });
  const byPath = (suffix: string) => entries.find((e) => e.url.endsWith(suffix));

  it("uses each entity's own updatedAt", () => {
    expect(byPath("/proion/drill-x")?.lastModified).toEqual(product.updatedAt);
    expect(byPath("/katalogos/drapana")?.lastModified).toEqual(category.updatedAt);
    expect(byPath("/brands/milwaukee")?.lastModified).toEqual(brand.updatedAt);
  });

  it("gives static pages no lastmod rather than the request time", () => {
    const statics = entries.slice(0, STATIC_PATHS.length);
    expect(statics).toHaveLength(STATIC_PATHS.length);
    for (const entry of statics) expect(entry).not.toHaveProperty("lastModified");
  });

  it("is stable across calls", () => {
    expect(buildSitemap({ products: [product], categories: [category], brands: [brand] })).toEqual(
      entries,
    );
  });
});
