import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique, upsert } = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { seoPageOverride: { findUnique, upsert } } }));

import { Prisma } from "@/generated/prisma/client";
import { allowedFieldsForPath, seoFixStore, seoOverrideFor } from "@/lib/seo/seo-page-override";

const NONE = { seoTitle: null, metaDescription: null, faq: null, h1: null, intro: null, ogDescription: null };

beforeEach(() => {
  findUnique.mockReset();
  upsert.mockReset();
});

describe("allowedFieldsForPath", () => {
  it.each([
    ["/", 6],
    ["/katalogos/trapania", 4],
    ["/brands/knipex", 2],
    ["/proion/abc", 2],
  ])("%s δέχεται %i πεδία", (path, n) => expect(allowedFieldsForPath(path)).toHaveLength(n));

  it("h1 και intro μόνο στην αρχική, ogDescription και στην κατηγορία", () => {
    expect(allowedFieldsForPath("/")).toEqual(["seoTitle", "metaDescription", "faq", "h1", "intro", "ogDescription"]);
    expect(allowedFieldsForPath("/katalogos/x")).toEqual(["seoTitle", "metaDescription", "faq", "ogDescription"]);
  });

  it("μόνο κατηγορία και αρχική έχουν ερωτήσεις", () => {
    expect(allowedFieldsForPath("/brands/knipex")).toEqual(["seoTitle", "metaDescription"]);
    expect(allowedFieldsForPath("/proion/abc")).toEqual(["seoTitle", "metaDescription"]);
  });

  it.each(["/katalogos", "/brands", "/en", "/en/katalogos/x", "/katalogos/a/b", "/etaireia"])("%s δεν υποστηρίζεται", (path) =>
    expect(allowedFieldsForPath(path)).toBeNull(),
  );
});

describe("seoOverrideFor", () => {
  it("null σε en", async () => {
    expect(await seoOverrideFor("/", "en")).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("null όταν η βάση πετά", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    findUnique.mockRejectedValue(new Error("table missing"));
    expect(await seoOverrideFor("/", "el")).toBeNull();
  });

  it("null χωρίς εγγραφή", async () => {
    findUnique.mockResolvedValue(null);
    expect(await seoOverrideFor("/", "el")).toBeNull();
  });

  it("δίνει τα πεδία της εγγραφής", async () => {
    findUnique.mockResolvedValue({ path: "/", seoTitle: "T", metaDescription: null, faq: [{ a: "A", q: "Q" }], updatedBy: "u" });
    expect(await seoOverrideFor("/", "el")).toEqual({ ...NONE, seoTitle: "T", faq: [{ q: "Q", a: "A" }] });
  });
});

describe("seoFixStore", () => {
  it("read: χωρίς εγγραφή όλα null", async () => {
    findUnique.mockResolvedValue(null);
    expect(await seoFixStore.read("/")).toEqual(NONE);
  });

  it("read: διαβάζει τα νέα πεδία", async () => {
    findUnique.mockResolvedValue({ ...NONE, h1: "H", intro: "I", ogDescription: "O" });
    expect(await seoFixStore.read("/")).toEqual({ ...NONE, h1: "H", intro: "I", ogDescription: "O" });
  });

  it("read: κάθε ερώτηση ως { q, a }", async () => {
    findUnique.mockResolvedValue({ seoTitle: null, metaDescription: null, faq: [{ a: "A", q: "Q", extra: 1 }] });
    const { faq } = await seoFixStore.read("/");
    expect(faq).toEqual([{ q: "Q", a: "A" }]);
    expect(Object.keys(faq![0])).toEqual(["q", "a"]);
  });

  it("write: upsert κατά path με updatedBy", async () => {
    await seoFixStore.write("/a", { seoTitle: "T" }, "u@x");
    expect(upsert).toHaveBeenCalledWith({
      where: { path: "/a" },
      create: { path: "/a", seoTitle: "T", updatedBy: "u@x" },
      update: { seoTitle: "T", updatedBy: "u@x" },
    });
  });

  it("write: null στο faq γίνεται Prisma.DbNull", async () => {
    await seoFixStore.write("/a", { faq: null }, "u");
    expect(upsert.mock.calls[0][0].update.faq).toBe(Prisma.DbNull);
    expect(upsert.mock.calls[0][0].create.faq).toBe(Prisma.DbNull);
  });

  it("write: faq που λείπει δεν αγγίζεται", async () => {
    await seoFixStore.write("/a", { seoTitle: null }, "u");
    expect(upsert.mock.calls[0][0].update).not.toHaveProperty("faq");
    expect(upsert.mock.calls[0][0].update.seoTitle).toBeNull();
  });
});
