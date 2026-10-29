import { describe, test, expect, vi } from "vitest";

// messages.ts pulls in the prisma client at module load; the pure helpers under
// test never touch it, so a bare stub keeps the import graph light.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    messageOverride: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  },
}));

import {
  flattenMessageStrings,
  getMessagePath,
  mergeOverrides,
  resolveOverride,
} from "@/lib/content/messages";

describe("flattenMessageStrings", () => {
  test("returns one dotted path per leaf string, skipping non-strings", () => {
    const flat = flattenMessageStrings({
      etaireia: { page: { a: "Α", b: "Β" }, count: 3 },
      hero: { title: "Τίτλος" },
    });
    expect(flat).toEqual({
      "etaireia.page.a": "Α",
      "etaireia.page.b": "Β",
      "hero.title": "Τίτλος",
    });
  });
});

describe("getMessagePath", () => {
  const msgs = { etaireia: { page: { a: "Α" } } };
  test("walks a dotted path to a leaf", () => {
    expect(getMessagePath(msgs, "etaireia.page.a")).toBe("Α");
  });
  test("returns undefined for a missing path", () => {
    expect(getMessagePath(msgs, "etaireia.page.x")).toBeUndefined();
    expect(getMessagePath(msgs, "nope.at.all")).toBeUndefined();
  });
});

describe("mergeOverrides", () => {
  test("overlays an override at its nested path without mutating the base", () => {
    const base = { etaireia: { page: { a: "Α", b: "Β" } } };
    const merged = mergeOverrides(base, [{ path: "etaireia.page.a", value: "ΑΛΛΑΓΜΕΝΟ" }]);
    expect(merged.etaireia.page).toEqual({ a: "ΑΛΛΑΓΜΕΝΟ", b: "Β" });
    // base untouched
    expect(base.etaireia.page.a).toBe("Α");
  });
});

describe("resolveOverride", () => {
  test("empty input deletes the row", () => {
    expect(resolveOverride("Αρχικό", "   ", false)).toEqual({ action: "delete" });
  });
  test("value equal to the catalogue (trimmed) deletes the row", () => {
    expect(resolveOverride("Αρχικό", "  Αρχικό  ", false)).toEqual({ action: "delete" });
  });
  test("a different value upserts the trimmed value", () => {
    expect(resolveOverride("Αρχικό", "  Νέο  ", false)).toEqual({ action: "upsert", value: "Νέο" });
  });
  test("rich compares and stores sanitized HTML", () => {
    // sanitizing the raw equals the sanitized catalogue ⇒ delete
    expect(resolveOverride("<p>Α</p>", "<p onclick=x>Α</p>", true)).toEqual({ action: "delete" });
    // a real change ⇒ upsert the sanitized HTML (script stripped)
    expect(resolveOverride("<p>Α</p>", "<p>Β</p><script>bad()</script>", true)).toEqual({
      action: "upsert",
      value: "<p>Β</p>",
    });
  });
});
