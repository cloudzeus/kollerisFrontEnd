import { describe, expect, it } from "vitest";
import {
  LISTING_LIMITS,
  canonicalizeListingQuery,
  capFacetValues,
  filteredListingRobots,
  isFilteredListing,
  listingKindOf,
  toggleCappedValue,
} from "@/lib/catalog/listing-query";

const canon = (search: string, kind: Parameters<typeof canonicalizeListingQuery>[0] = "category") =>
  canonicalizeListingQuery(kind, search);

describe("listingKindOf", () => {
  it.each([
    ["/katalogos/drapana", "category"],
    ["/en/katalogos/drapana", "category"],
    ["/it/brands/milwaukee", "brand"],
    ["/proionta", "products"],
    ["/en/prosfores/summer", "offers"],
    ["/anazitisi", "search"],
  ] as const)("%s is a %s listing", (path, kind) => {
    expect(listingKindOf(path)).toBe(kind);
  });

  it.each(["/katalogos", "/katalogos/a/b", "/proion/x", "/", "/en", "/enkatalogos/x"])(
    "%s is not a listing",
    (path) => expect(listingKindOf(path)).toBeNull(),
  );
});

describe("canonicalizeListingQuery", () => {
  it("leaves a bare listing alone", () => {
    expect(canon("")).toEqual({ action: "ok" });
    expect(canon("?page=3")).toEqual({ action: "ok" });
  });

  it("accepts canonical facet URLs without a redirect, in any key order", () => {
    expect(canon("?sub=a,b&brand=x&avail=in-stock")).toEqual({ action: "ok" });
    expect(canon("?brand=x&sub=a")).toEqual({ action: "ok" });
    // `%2C` and `,` are the same value: no redirect for an encoding difference.
    expect(canon("?sub=a%2Cb")).toEqual({ action: "ok" });
  });

  it("sorts multi-values so a,b and b,a are one URL", () => {
    expect(canon("?sub=b,a")).toEqual({ action: "redirect", search: "?sub=a,b", perRow: null });
    expect(canon("?brand=z,x,y")).toEqual({
      action: "redirect",
      search: "?brand=x,y,z",
      perRow: null,
    });
  });

  it("dedupes and merges repeated multi-value params", () => {
    expect(canon("?sub=a&sub=b,a")).toEqual({ action: "redirect", search: "?sub=a,b", perRow: null });
  });

  it("trims a facet past the per-facet cap (the scraper's sub=a,b,c,d)", () => {
    const result = canon("?sub=d,c,b,a&brand=x");
    expect(result).toEqual({ action: "redirect", search: "?sub=a,b,c&brand=x", perRow: null });
    expect(LISTING_LIMITS.maxValuesPerFacet).toBe(3);
  });

  it("accepts everything the filter UI can produce at once", () => {
    // 3 subs + 3 brands + price + avail + sale + new = 10, the combined cap.
    expect(LISTING_LIMITS.maxFacetValues).toBe(10);
    expect(canon("?sub=a,b,c&brand=x,y,z&min=50&max=150&avail=in-stock&sale=1&new=1")).toEqual({
      action: "ok",
    });
  });

  it("trims past the combined cap with a redirect, never a 400", () => {
    const limits = { ...LISTING_LIMITS, maxFacetValues: 4 };
    // Dropped first: new, sale, avail, price; then the last brand, then the last sub.
    expect(
      canonicalizeListingQuery("category", "?sub=a,b&brand=x,y&avail=in-stock&sale=1&new=1", limits),
    ).toEqual({ action: "redirect", search: "?sub=a,b&brand=x,y", perRow: null });
    expect(
      canonicalizeListingQuery("category", "?sub=a,b,c&brand=x,y,z&max=50", limits),
    ).toEqual({ action: "redirect", search: "?sub=a,b,c&brand=x", perRow: null });
  });

  it("never rejects: every input has a canonical URL", () => {
    for (const q of [
      "?sub=a,b,c,d,e&brand=1,2,3,4&min=1&max=2&avail=in-stock&sale=1&new=1&page=999999",
      `?q=${"x".repeat(5_000)}`,
      "?%E0%A4%A=1&sub=%ZZ",
    ]) {
      expect(["ok", "redirect"]).toContain(canon(q, "search").action);
    }
  });

  it("drops unknown params through a redirect", () => {
    expect(canon("?sub=a&foo=1&x=y")).toEqual({ action: "redirect", search: "?sub=a", perRow: null });
  });

  it("drops params the listing kind does not read", () => {
    expect(canon("?brand=x&sub=a", "brand")).toEqual({
      action: "redirect",
      search: "?sub=a",
      perRow: null,
    });
    expect(canon("?q=drill", "category")).toEqual({ action: "redirect", search: "", perRow: null });
  });

  it("keeps attribution params untouched", () => {
    expect(canon("?utm_source=google&gclid=abc&sub=a")).toEqual({ action: "ok" });
    // Any utm_*, by prefix.
    expect(canon("?utm_whatever=1&utm_source_platform=x")).toEqual({ action: "ok" });
    const tracking =
      "mc_cid mc_eid _kx ttclid twclid li_fat_id dclid yclid igshid _hsenc _hsmi gclsrc wbraid gbraid msclkid fbclid";
    for (const key of tracking.split(" ")) {
      expect(canon(`?${key}=v&sub=a`), key).toEqual({ action: "ok" });
    }
  });

  it("does not treat _rsc as a pass-through (Next strips it before the proxy)", () => {
    expect(canon("?_rsc=1x2y")).toEqual({ action: "redirect", search: "", perRow: null });
  });

  it("drops defaults", () => {
    expect(canon("?page=1&perPage=24&sort=relevance")).toEqual({
      action: "redirect",
      search: "",
      perRow: null,
    });
  });

  it("only allows the real perPage options", () => {
    expect(canon("?perPage=96")).toEqual({ action: "ok" });
    expect(canon("?perPage=48")).toEqual({ action: "ok" });
    expect(canon("?perPage=500")).toEqual({ action: "redirect", search: "", perRow: null });
  });

  it("moves perRow out of the URL into a preference", () => {
    expect(canon("?sub=a&perRow=3")).toEqual({ action: "redirect", search: "?sub=a", perRow: 3 });
    expect(canon("?perRow=9")).toEqual({ action: "redirect", search: "", perRow: null });
  });

  it("only allows the price bands the filter offers", () => {
    expect(canon("?min=50&max=150")).toEqual({ action: "ok" });
    expect(canon("?max=50")).toEqual({ action: "ok" });
    expect(canon("?min=500")).toEqual({ action: "ok" });
    expect(canon("?min=37&max=912")).toEqual({ action: "redirect", search: "", perRow: null });
    expect(canon("?min=abc")).toEqual({ action: "redirect", search: "", perRow: null });
    expect(canon("?min=50.00&max=150")).toEqual({
      action: "redirect",
      search: "?min=50&max=150",
      perRow: null,
    });
  });

  it("validates single-value facets", () => {
    expect(canon("?avail=in-stock&sale=1&new=1")).toEqual({ action: "ok" });
    expect(canon("?avail=all&sale=yes&new=0")).toEqual({ action: "redirect", search: "", perRow: null });
    expect(canon("?sort=price-asc")).toEqual({ action: "ok" });
    expect(canon("?sort=evil")).toEqual({ action: "redirect", search: "", perRow: null });
  });

  it("drops slugs that are not slugs", () => {
    expect(canon("?sub=a,<script>,b")).toEqual({ action: "redirect", search: "?sub=a,b", perRow: null });
    expect(canon(`?brand=${"x".repeat(200)}`)).toEqual({ action: "redirect", search: "", perRow: null });
  });

  it("clamps a huge page instead of 404ing, and drops a malformed one", () => {
    expect(LISTING_LIMITS.maxPage).toBe(2000);
    expect(canon("?page=2000")).toEqual({ action: "ok" });
    expect(canon("?page=99999")).toEqual({ action: "redirect", search: "?page=2000", perRow: null });
    expect(canon("?page=abc")).toEqual({ action: "redirect", search: "", perRow: null });
  });

  it("handles search: q and cat are allowed, an over-long q is truncated", () => {
    expect(canon("?q=drill&cat=drapana&brand=x", "search")).toEqual({ action: "ok" });
    expect(canon(`?q=${"a".repeat(500)}`, "search")).toEqual({
      action: "redirect",
      search: `?q=${"a".repeat(200)}`,
      perRow: null,
    });
    // Code points, not UTF-16 units: an emoji at the cut is not split in half.
    const emoji = "\u{1F527}".repeat(201);
    const result = canon(`?q=${encodeURIComponent(emoji)}`, "search");
    expect(result.action).toBe("redirect");
    if (result.action !== "redirect") throw new Error("unreachable");
    expect([...new URLSearchParams(result.search).get("q")!]).toHaveLength(200);
  });

  it("canonicalises the production scraper URL in one hop and is idempotent", () => {
    const scraped =
      "?sub=d,a,c,b&brand=z,x,y&min=13&max=877&perPage=96&perRow=5&avail=in-stock";
    const first = canon(scraped);
    expect(first).toEqual({
      action: "redirect",
      search: "?sub=a,b,c&brand=x,y,z&perPage=96&avail=in-stock",
      perRow: 5,
    });
    if (first.action !== "redirect") throw new Error("unreachable");
    expect(canon(first.search)).toEqual({ action: "ok" });
  });
});

describe("isFilteredListing", () => {
  it("treats paging and pass-through params as unfiltered", () => {
    expect(isFilteredListing(new URLSearchParams(""))).toBe(false);
    expect(isFilteredListing(new URLSearchParams("page=2&utm_source=x&fbclid=1"))).toBe(false);
    expect(isFilteredListing({ page: "2", sub: undefined })).toBe(false);
  });

  it("treats any facet or view param as filtered", () => {
    expect(isFilteredListing(new URLSearchParams("sub=a"))).toBe(true);
    expect(isFilteredListing({ sort: "price-asc" })).toBe(true);
    expect(isFilteredListing(new URLSearchParams("foo=1"))).toBe(true);
  });
});

describe("toggleCappedValue", () => {
  it("adds and removes, sorted", () => {
    expect(toggleCappedValue(["b"], "a")).toEqual(["a", "b"]);
    expect(toggleCappedValue(["a", "b"], "a")).toEqual(["b"]);
  });

  it("keeps the new value when the cap is reached", () => {
    expect(toggleCappedValue(["a", "b", "c"], "z")).toEqual(["b", "c", "z"]);
  });
});

describe("capFacetValues", () => {
  it("dedupes, sorts and caps", () => {
    expect(capFacetValues(["d", "c", "b", "a", "a"])).toEqual(["a", "b", "c"]);
    expect(capFacetValues([])).toBeUndefined();
    expect(capFacetValues(undefined)).toBeUndefined();
  });
});

describe("filteredListingRobots", () => {
  it("noindexes filtered views and leaves bare listings and paging indexable", () => {
    expect(filteredListingRobots({ sub: "a" })).toEqual({ index: false, follow: true });
    expect(filteredListingRobots({ page: "2" })).toBeUndefined();
    expect(filteredListingRobots({})).toBeUndefined();
  });
});
