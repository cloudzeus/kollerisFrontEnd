import { describe, expect, it } from "vitest";
import { comparableNumber } from "@/lib/compare/numeric";
// From `options`, not `compare`: everything under test here is pure, which is
// exactly why it lives on the client-safe side of the `server-only` split.
import {
  COMPARE_MAX,
  parseCompareCookie,
  parseIdsParam,
  scopeKeyOf,
  serialiseCompareCookie,
} from "@/lib/compare/options";

/**
 * The cases here are real values pulled from `product_specs`, not invented
 * ones. Every `toBeNull` below is a row where `valueNumeric` holds a number
 * that would have crowned the wrong product.
 */
describe("comparableNumber", () => {
  it("reads a plain measurement", () => {
    expect(comparableNumber("0.135 W")).toBe(0.135);
    expect(comparableNumber("1000W")).toBe(1000);
    expect(comparableNumber("100%")).toBe(100);
  });

  it("reads a Greek decimal comma", () => {
    expect(comparableNumber("0,15 Nm")).toBe(0.15);
    expect(comparableNumber("10,8 V")).toBe(10.8);
  });

  it("reads an English thousands separator as thousands", () => {
    // The projection stores this as 1.5 — the bug this whole module exists for.
    expect(comparableNumber("1,500 RPM")).toBe(1500);
    expect(comparableNumber("10,000 μετρήσεις")).toBe(10_000);
  });

  it("refuses ranges", () => {
    expect(comparableNumber("0-102 mm")).toBeNull();
    expect(comparableNumber("0,3-1,2 Nm")).toBeNull();
    expect(comparableNumber("0.09-0.18A")).toBeNull();
    expect(comparableNumber("-10°C to 50°C")).toBeNull();
    expect(comparableNumber("-10°C έως +40°C")).toBeNull();
  });

  it("refuses lists and compound values", () => {
    expect(comparableNumber("0 - 1500 RPM,1500 - 3000 RPM")).toBeNull();
    expect(comparableNumber('1 1/4"')).toBeNull();
    expect(comparableNumber("ISO 1173-1:2005")).toBeNull();
    expect(comparableNumber("0,16 x 0,8 mm")).toBeNull();
  });

  it("refuses values with no number at all", () => {
    expect(comparableNumber("Χάλυβας εργαλείων")).toBeNull();
    expect(comparableNumber("High")).toBeNull();
    expect(comparableNumber("")).toBeNull();
    expect(comparableNumber(null)).toBeNull();
  });

  it("reads a negative measurement", () => {
    expect(comparableNumber("-20 °C")).toBe(-20);
  });
});

describe("scopeKeyOf", () => {
  it("prefers the narrowest classification the product has", () => {
    expect(scopeKeyOf({ cccSubgroup2: 311, mtrgroup: 12, mtrcategory: 5 })).toBe("sub:311");
    expect(scopeKeyOf({ cccSubgroup2: null, mtrgroup: 12, mtrcategory: 5 })).toBe("grp:12");
    expect(scopeKeyOf({ cccSubgroup2: null, mtrgroup: null, mtrcategory: 5 })).toBe("cat:5");
  });

  it("is null for an unclassified product", () => {
    expect(scopeKeyOf({ cccSubgroup2: null, mtrgroup: null, mtrcategory: null })).toBeNull();
  });

  it("treats subgroup 0 as a real subgroup", () => {
    // 85 active products sit in cccSubgroup2 = 0; a falsy check would push them
    // up to their group and silently widen every comparison they take part in.
    expect(scopeKeyOf({ cccSubgroup2: 0, mtrgroup: 12, mtrcategory: 5 })).toBe("sub:0");
  });
});

describe("the selection cookie", () => {
  it("round-trips", () => {
    const selection = { scopeKey: "sub:311", slugs: ["a", "b"] };
    expect(parseCompareCookie(serialiseCompareCookie(selection))).toEqual(selection);
  });

  it("caps at the column limit", () => {
    const parsed = parseCompareCookie("sub:311|a,b,c,d,e,f");
    expect(parsed.slugs).toHaveLength(COMPARE_MAX);
  });

  it("drops duplicates", () => {
    expect(parseCompareCookie("sub:311|a,b,a").slugs).toEqual(["a", "b"]);
  });

  it("rejects a cookie with no usable scope", () => {
    expect(parseCompareCookie("nonsense|a,b")).toEqual({ scopeKey: null, slugs: [] });
    expect(parseCompareCookie("sub:abc|a")).toEqual({ scopeKey: null, slugs: [] });
    expect(parseCompareCookie("sub:311|")).toEqual({ scopeKey: null, slugs: [] });
    expect(parseCompareCookie(undefined)).toEqual({ scopeKey: null, slugs: [] });
  });
});

describe("parseIdsParam", () => {
  it("splits, trims and caps", () => {
    expect(parseIdsParam(" a , b ,c ")).toEqual(["a", "b", "c"]);
    expect(parseIdsParam("a,b,c,d,e")).toHaveLength(COMPARE_MAX);
  });

  it("accepts a repeated query key", () => {
    expect(parseIdsParam(["a,b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("is empty for nothing", () => {
    expect(parseIdsParam(undefined)).toEqual([]);
    expect(parseIdsParam("")).toEqual([]);
  });
});

describe("comparableNumber — the thousands/decimal comma", () => {
  it("does not read a leading-zero decimal as a thousands group", () => {
    // The regression that made this rule explicit: `0.135 W` is 0.135 watts,
    // and a naive thousands rule turned it into 135.
    expect(comparableNumber("0.135 W")).toBe(0.135);
    expect(comparableNumber("0,135 W")).toBe(0.135);
  });

  it("never reads a dot as a thousands separator", () => {
    expect(comparableNumber("1.500 mm")).toBe(1.5);
  });
});
