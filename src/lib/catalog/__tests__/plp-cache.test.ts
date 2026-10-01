import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  category: {
    findUnique: vi.fn(async () => ({ id: 1, erpType: "CATEGORY", erpCode: "10" })),
    findMany: vi.fn(async () => []),
  },
  product: {
    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),
    groupBy: vi.fn(async () => []),
    aggregate: vi.fn(async () => ({ _min: { priceNet: null }, _max: { priceNet: null } })),
  },
  brand: { findMany: vi.fn(async () => []) },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
/* The live campaigns: what `?sale=1` selects. Changed by a test below. */
const campaigns = vi.hoisted(() => ({ live: null as unknown }));
vi.mock("@/lib/offers/coverage", () => ({ activeCampaignsWhere: async () => campaigns.live }));
// Outside Next there is no incremental cache; the facet cache is not under test.
vi.mock("@/lib/catalog/shared-cache", () => ({
  sharedCatalogue: (_key: string, _seconds: number, fn: unknown) => fn,
}));

const { getPlpData, listingKeyOf, parsePlpParams } = await import("@/lib/catalog/plp");

beforeEach(() => {
  db.product.findMany.mockClear();
  db.product.count.mockClear();
});

describe("listing cache key", () => {
  const key = (raw: Record<string, string>) =>
    listingKeyOf(parsePlpParams(raw, { categorySlug: "drapana" }), "el");

  it("is the same for two spellings of one listing", () => {
    expect(key({ sub: "b,a", brand: "y,x" })).toBe(key({ brand: "x,y", sub: "a,b" }));
    expect(key({ sub: "a", page: "1", perPage: "24", sort: "relevance" })).toBe(key({ sub: "a" }));
    // perRow is display only and never reaches the key.
    expect(key({ sub: "a", perRow: "5" })).toBe(key({ sub: "a" }));
  });

  it("differs for what changes the grid", () => {
    expect(key({ sub: "a", page: "2" })).not.toBe(key({ sub: "a" }));
    expect(key({ sub: "a", perPage: "96" })).not.toBe(key({ sub: "a" }));
    expect(key({ sub: "a", sort: "price-asc" })).not.toBe(key({ sub: "a" }));
    expect(listingKeyOf(parsePlpParams({}, { categorySlug: "x" }), "en")).not.toBe(
      listingKeyOf(parsePlpParams({}, { categorySlug: "x" }), "el"),
    );
  });
});

describe("getPlpData", () => {
  it("queries the grid once for repeated and concurrent requests of one listing", async () => {
    const params = parsePlpParams({ sub: "a,b", avail: "in-stock" }, { categorySlug: "cache-test" });
    await Promise.all([getPlpData(params, "el"), getPlpData(params, "el"), getPlpData(params, "el")]);
    await getPlpData(parsePlpParams({ sub: "b,a", avail: "in-stock" }, { categorySlug: "cache-test" }), "el");
    expect(db.product.findMany).toHaveBeenCalledTimes(1);
    expect(db.product.count).toHaveBeenCalledTimes(1);
  });

  it("still 404s an unknown category instead of caching an empty grid", async () => {
    db.category.findUnique.mockResolvedValueOnce(null as never);
    expect(await getPlpData(parsePlpParams({}, { categorySlug: "nope" }), "el")).toBeNull();
  });
});

describe("brand facet", () => {
  it("is not offered on a brand page, so it can never build a ?brand= link there", async () => {
    db.brand.findMany.mockResolvedValue([
      { mtrmark: 7, slug: "milwaukee", nameEl: "Milwaukee", nameEn: "Milwaukee", nameIt: "Milwaukee" },
      { mtrmark: 8, slug: "makita", nameEl: "Makita", nameEn: "Makita", nameIt: "Makita" },
    ] as never);
    db.product.groupBy.mockImplementation((async (args: { by: string[] }) =>
      args.by.includes("mtrmark")
        ? [
            { mtrmark: 7, isNew: false, _count: { _all: 3 } },
            { mtrmark: 8, isNew: false, _count: { _all: 2 } },
          ]
        : []) as never);

    const onBrandPage = await getPlpData(parsePlpParams({}, { brandScopeSlug: "milwaukee" }), "el");
    expect(onBrandPage?.facets.brands).toEqual([]);

    const onCategory = await getPlpData(parsePlpParams({}, { categorySlug: "brand-facet" }), "el");
    expect(onCategory?.facets.brands.map((b) => b.slug)).toEqual(["milwaukee", "makita"]);
  });
});

describe("?sale=1 and campaigns", () => {
  it("follows campaigns starting and stopping, without waiting for the TTL", async () => {
    // The grid query is the one findMany with an orderBy (the facets count separately).
    const gridQueries = () =>
      db.product.findMany.mock.calls.filter(
        (call) => (call as unknown[])[0] && "orderBy" in ((call as unknown[])[0] as object),
      ).length;
    const sale = parsePlpParams({ sale: "1" }, { categorySlug: "campaign-test" });
    const before = gridQueries();
    campaigns.live = { id: { in: ["a"] } };
    await getPlpData(sale, "el");
    await getPlpData(sale, "el");
    expect(gridQueries() - before).toBe(1);
    campaigns.live = { id: { in: ["a", "b"] } }; // a second campaign starts
    await getPlpData(sale, "el");
    expect(gridQueries() - before).toBe(2);
    campaigns.live = null; // and both end
    await getPlpData(sale, "el");
    expect(gridQueries() - before).toBe(3);
  });
});
