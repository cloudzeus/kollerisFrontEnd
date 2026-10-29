import { describe, expect, it } from "vitest";
import { icuArgNames, isPlaceholderSafe } from "@/lib/content/messages";

describe("icuArgNames", () => {
  it("collects simple {name} arguments", () => {
    expect([...icuArgNames("Έχουμε {inStock} από {products}")]).toEqual(["inStock", "products"]);
  });

  it("collects the leading arg of a complex ICU form", () => {
    expect([...icuArgNames("{count, plural, one {ένα} other {# προϊόντα}}")]).toContain("count");
  });

  it("is empty for plain text", () => {
    expect(icuArgNames("καθόλου μεταβλητές").size).toBe(0);
  });
});

describe("isPlaceholderSafe", () => {
  const base = "Διαθέσιμα {inStock} από {products} προϊόντα";

  it("allows edits that keep the same placeholders", () => {
    expect(isPlaceholderSafe(base, "{inStock} σε απόθεμα από {products}")).toBe(true);
  });

  it("allows dropping a placeholder (number simply won't show, never throws)", () => {
    expect(isPlaceholderSafe(base, "Μεγάλη γκάμα {products} προϊόντων")).toBe(true);
  });

  it("rejects a NEW placeholder the catalogue never provided", () => {
    expect(isPlaceholderSafe(base, "Διαθέσιμα {inStock} από {whatever}")).toBe(false);
  });

  it("rejects an unbalanced brace (a parse error waiting to happen)", () => {
    expect(isPlaceholderSafe(base, "Διαθέσιμα {inStock από {products}")).toBe(false);
  });

  it("rejects any placeholder when the base had none", () => {
    expect(isPlaceholderSafe("απλό κείμενο", "κείμενο με {var}")).toBe(false);
  });

  it("allows plain-text edits of a plain-text base", () => {
    expect(isPlaceholderSafe("απλό κείμενο", "άλλο απλό κείμενο")).toBe(true);
  });
});
