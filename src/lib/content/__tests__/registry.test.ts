import { describe, expect, it } from "vitest";
import { CONTENT, PAGES } from "@/lib/content/registry";

describe("content registry", () => {
  it("has unique keys", () => {
    const keys = CONTENT.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("points every block at a page in PAGES", () => {
    const ids = new Set(PAGES.map((p) => p.id));
    const orphans = CONTENT.filter((c) => !ids.has(c.page)).map((c) => c.key);
    expect(orphans).toEqual([]);
  });

  it("has unique page ids", () => {
    const ids = PAGES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps maxChars off rich blocks", () => {
    const bad = CONTENT.filter((c) => c.kind === "rich" && c.maxChars !== undefined).map((c) => c.key);
    expect(bad).toEqual([]);
  });

  it("still carries the existing home keys, under page home", () => {
    const keys = new Set(CONTENT.map((c) => c.key));
    for (const k of ["hero.title", "about.title", "reviews.title", "shipping.promise"]) {
      expect(keys.has(k)).toBe(true);
    }
    expect(CONTENT.find((c) => c.key === "hero.title")?.page).toBe("home");
  });
});
