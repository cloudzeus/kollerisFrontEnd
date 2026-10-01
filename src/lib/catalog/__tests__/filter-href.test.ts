import { describe, expect, it } from "vitest";
import { setParamHref, toggleMultiHref } from "@/lib/catalog/filter-href";
import { canonicalizeListingQuery } from "@/lib/catalog/listing-query";

const queryOf = (href: string) => (href.includes("?") ? href.slice(href.indexOf("?")) : "");

describe("filter links are already canonical", () => {
  it("sorts multi-values", () => {
    expect(toggleMultiHref("/katalogos/x", { sub: "c,a" }, "sub", "b")).toBe(
      "/katalogos/x?sub=a%2Cb%2Cc",
    );
  });

  it("replaces the oldest value at the cap instead of growing past it", () => {
    const href = toggleMultiHref("/katalogos/x", { brand: "a,b,c" }, "brand", "z");
    expect(href).toBe("/katalogos/x?brand=b%2Cc%2Cz");
    expect(canonicalizeListingQuery("category", queryOf(href))).toEqual({ action: "ok" });
  });

  it("does not spell out defaults", () => {
    expect(setParamHref("/katalogos/x", { perPage: "96" }, "perPage", "24")).toBe("/katalogos/x");
    expect(setParamHref("/katalogos/x", {}, "sort", "relevance")).toBe("/katalogos/x");
  });

  it("never builds a URL the proxy would rewrite, even with every facet on", () => {
    const raw = { sub: "a,b,c", brand: "d,e,f", avail: "in-stock" };
    const withSale = setParamHref("/katalogos/x", raw, "sale", "1");
    expect(withSale).toContain("sale=1");
    expect(canonicalizeListingQuery("category", queryOf(withSale))).toEqual({ action: "ok" });

    const all = setParamHref("/katalogos/x", { ...raw, sale: "1", min: "50", max: "150" }, "new", "1");
    expect(canonicalizeListingQuery("category", queryOf(all))).toEqual({ action: "ok" });
  });

  it("drops what the listing kind does not read (no ?brand= on a brand page)", () => {
    expect(toggleMultiHref("/brands/m", { foo: "1" }, "sub", "a")).toBe("/brands/m?sub=a");
    expect(setParamHref("/brands/m", { brand: "x" }, "avail", "in-stock")).toBe(
      "/brands/m?avail=in-stock",
    );
  });
});
