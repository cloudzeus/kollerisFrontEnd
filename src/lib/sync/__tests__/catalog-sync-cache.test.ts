import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * syncProductsByMtrl and the listing grid cache: whatever was written must
 * clear it, even when a later chunk throws after an earlier one was written.
 *
 * Prisma is a permissive stand-in: every read answers empty, every write
 * succeeds. What is under test is when the cache is cleared, not the writes.
 */
const clearListingCache = vi.hoisted(() => vi.fn());
vi.mock("@/lib/catalog/listing-cache", () => ({ clearListingCache }));
vi.mock("@/lib/catalog/variant-lead", () => ({ refreshVariantLeads: async () => undefined }));

const hdc = vi.hoisted(() => ({ products: vi.fn() }));
vi.mock("@/lib/hdctool/client", () => ({ hdctool: hdc, HDCTOOL_MAX_LIMIT: 2 }));

vi.mock("@/lib/prisma", () => {
  const method = (name: string) => async (args?: { data?: unknown }) => {
    if (name.startsWith("findMany") || name === "groupBy") return [];
    if (name === "findUnique" || name === "findFirst") return null;
    if (name.endsWith("Many")) return { count: 0 };
    return { id: "row", ...((args?.data as object) ?? {}) };
  };
  const model = new Proxy({}, { get: (_t, name: string) => method(name) });
  const prisma: Record<string, unknown> = new Proxy(
    {
      $transaction: async (ops: unknown) =>
        Array.isArray(ops) ? Promise.all(ops) : (ops as (tx: unknown) => unknown)(prisma),
    },
    { get: (target, key: string) => (target as Record<string, unknown>)[key] ?? model },
  );
  return { prisma };
});

const { syncProductsByMtrl } = await import("@/lib/sync/catalog-sync");

const product = (mtrl: number) => ({
  id: `p${mtrl}`,
  mtrl,
  code: `C${mtrl}`,
  code2: `4933${mtrl}`,
  name: `TOOL ${mtrl}`,
  translations: [],
  brand: null,
  vat: { code: 1, percentage: 24 },
});
const page = (products: unknown[]) => ({
  products,
  pagination: { page: 1, limit: 2, total: products.length, hasNext: false, nextCursor: null },
});

beforeEach(() => {
  clearListingCache.mockClear();
  hdc.products.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("syncProductsByMtrl and the listing cache", () => {
  it("clears it after writing", async () => {
    hdc.products.mockImplementation(async ({ mtrl }: { mtrl: number[] }) => page(mtrl.map(product)));
    await syncProductsByMtrl([1, 2]);
    expect(clearListingCache).toHaveBeenCalled();
  });

  it("clears it when a later chunk fails after an earlier one was written", async () => {
    let call = 0;
    hdc.products.mockImplementation(async ({ mtrl }: { mtrl: number[] }) => {
      call += 1;
      if (call === 2) throw new Error("HDCtool timeout");
      return page(mtrl.map(product));
    });
    await expect(syncProductsByMtrl([1, 2, 3])).rejects.toThrow(/timeout/);
    expect(clearListingCache).toHaveBeenCalled();
  });

  it("leaves it alone when nothing was written", async () => {
    hdc.products.mockRejectedValue(new Error("HDCtool down"));
    await expect(syncProductsByMtrl([1])).rejects.toThrow(/down/);
    expect(clearListingCache).not.toHaveBeenCalled();
    await syncProductsByMtrl([]);
    expect(clearListingCache).not.toHaveBeenCalled();
  });
});
