import { describe, test, expect } from "vitest";
import el from "../../../../messages/el.json";
import { INTL_PAGES } from "@/lib/content/registry/pages-intl";

/** Walk a dotted namespace into the catalogue. */
const walk = (o: unknown, p: string): unknown =>
  p.split(".").reduce<unknown>((x, k) => (x && typeof x === "object" ? (x as Record<string, unknown>)[k] : undefined), o);

/** Count leaf strings under a node. */
const leaves = (v: unknown): number => {
  if (typeof v === "string") return 1;
  if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).reduce<number>((n, x) => n + leaves(x), 0);
  return 0;
};

describe("INTL_PAGES", () => {
  test("page ids are unique", () => {
    const ids = INTL_PAGES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every namespace resolves to at least one editable string in the catalogue", () => {
    // A typo'd namespace would render an empty accordion — a page nobody can edit.
    for (const p of INTL_PAGES) {
      expect(leaves(walk(el, p.namespace)), `${p.id} → ${p.namespace}`).toBeGreaterThan(0);
    }
  });
});
