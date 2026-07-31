import { describe, expect, it } from "vitest";
import { searchKey, slugify, upGreek } from "../greek";

describe("upGreek", () => {
  it("drops the tonos", () => {
    expect(upGreek("Πριόνι")).toBe("ΠΡΙΟΝΙ");
    expect(upGreek("εργαλεία")).toBe("ΕΡΓΑΛΕΙΑ");
    expect(upGreek("Κατηγορία")).toBe("ΚΑΤΗΓΟΡΙΑ");
  });

  it("keeps the dialytika (Greek typographic rule)", () => {
    expect(upGreek("παϊδάκια")).toBe("ΠΑΪΔΑΚΙΑ");
    expect(upGreek("Αϋπνία")).toBe("ΑΫΠΝΙΑ");
  });

  it("drops only the tonos from a letter carrying both marks", () => {
    // ΐ = iota + dialytika + tonos → keeps dialytika only
    expect(upGreek("ΐ")).toBe("Ϊ");
  });

  it("leaves Latin and digits alone", () => {
    expect(upGreek("Makita 18V")).toBe("MAKITA 18V");
  });

  it("is idempotent", () => {
    const once = upGreek("Δισκοπρίονο");
    expect(upGreek(once)).toBe(once);
  });
});

describe("searchKey", () => {
  it("matches across case and tonos", () => {
    expect(searchKey("ΠΡΙΟΝΙ")).toBe(searchKey("πριόνι"));
    expect(searchKey("Πριόνι")).toBe("πριονι");
  });

  it("folds final sigma so ΟΔΟΣ matches οδός", () => {
    expect(searchKey("ΟΔΟΣ")).toBe(searchKey("οδός"));
    expect(searchKey("οδός")).toBe("οδοσ");
  });

  it("drops the dialytika too (unlike upGreek)", () => {
    expect(searchKey("παϊδάκια")).toBe(searchKey("παιδακια"));
  });

  it("collapses and trims whitespace", () => {
    expect(searchKey("  δράπανο   κρουστικό ")).toBe("δραπανο κρουστικο");
  });

  it("is idempotent", () => {
    const once = searchKey("Γωνιακός Τροχός");
    expect(searchKey(once)).toBe(once);
  });

  it("handles the near-miss case from the spec (missing tonos still matches)", () => {
    expect(searchKey("τροχος")).toBe(searchKey("τροχός"));
  });
});

describe("slugify", () => {
  it("transliterates Greek to readable ASCII", () => {
    expect(slugify("Δισκοπρίονο 190mm")).toBe("diskopriono-190mm");
    expect(slugify("Γωνιακός Τροχός")).toBe("goniakos-trochos");
  });

  it("applies digraphs before single letters", () => {
    expect(slugify("μπαταρία")).toBe("bataria");
    expect(slugify("ντουλάπι")).toBe("ntoulapi");
    expect(slugify("τσιμπίδα")).toBe("tsibida");
  });

  it("produces the same slug regardless of accents or case", () => {
    expect(slugify("ΠΡΙΟΝΙ")).toBe(slugify("πριόνι"));
  });

  it("strips punctuation and never leaves stray hyphens", () => {
    expect(slugify("Κατσαβίδι (σετ 6 τεμ.)")).toBe("katsavidi-set-6-tem");
    expect(slugify("---")).toBe("");
  });

  it("caps length without a trailing hyphen", () => {
    const slug = slugify("α ".repeat(200));
    expect(slug.length).toBeLessThanOrEqual(120);
    expect(slug.endsWith("-")).toBe(false);
  });
});
