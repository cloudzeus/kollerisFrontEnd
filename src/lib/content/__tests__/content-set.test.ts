import { beforeEach, describe, expect, it, vi } from "vitest";

const { upsert, deleteMany } = vi.hoisted(() => ({ upsert: vi.fn(), deleteMany: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { contentBlock: { upsert, deleteMany, findMany: vi.fn(async () => []) } },
}));

vi.mock("@/lib/content/registry", () => {
  const defs = [
    { key: "legal.body", page: "oroi", section: "body", label: "Σώμα", where: "", kind: "rich", fallback: "<p>Αρχικό</p>" },
    { key: "hero.title", page: "home", section: "hero", label: "Τίτλος", where: "", kind: "text", fallback: "Τίτλος" },
  ];
  return { CONTENT: defs, CONTENT_BY_KEY: new Map(defs.map((d) => [d.key, d])) };
});

import { setContent } from "@/lib/content/content";

beforeEach(() => {
  upsert.mockClear();
  deleteMany.mockClear();
});

describe("setContent", () => {
  it("stores a rich value sanitized", async () => {
    await setContent("legal.body", "el", '<p onclick="x()">Α<script>bad()</script></p>', "tester");
    expect(deleteMany).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0]![0].create.value).toBe("<p>Α</p>");
  });

  it("deletes a rich value that sanitizes equal to the fallback", async () => {
    await setContent("legal.body", "el", '<p onclick="x">Αρχικό</p>', "tester");
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("leaves a plain text value unchanged", async () => {
    await setContent("hero.title", "el", "Νέος τίτλος", "tester");
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0]![0].create.value).toBe("Νέος τίτλος");
  });
});
