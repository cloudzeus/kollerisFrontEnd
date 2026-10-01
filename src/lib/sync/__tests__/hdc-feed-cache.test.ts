import { beforeEach, describe, expect, it, vi } from "vitest";

const clearListingCache = vi.fn();
const syncProductsByMtrl = vi.fn(async (ids: number[]) => ({
  processed: ids.length, created: 0, updated: ids.length, removed: 0, failed: 0,
  failedMtrl: [] as number[], durationMs: 1, errors: [],
}));
let cursor: unknown = null;

vi.mock("@/lib/catalog/listing-cache", () => ({ clearListingCache }));
vi.mock("@/lib/sync/catalog-sync", () => ({ syncProductsByMtrl }));
vi.mock("@/lib/hdctool/client", () => ({ hdctool: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    syncState: {
      findUnique: async () => (cursor ? { cursor } : null),
      upsert: async (args: { update: { cursor: unknown } }) => {
        cursor = args.update.cursor;
      },
    },
    webhookDelivery: { update: async () => ({}), updateMany: async () => ({ count: 0 }) },
  },
}));

const { applyHdcDeliveryInBackground, drainPendingHdcIds } = await import("@/lib/sync/hdc-feed");

beforeEach(() => {
  clearListingCache.mockClear();
  syncProductsByMtrl.mockClear();
  cursor = null;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("HDCtool feed and the listing cache", () => {
  it("clears the listing cache once a delivery has been applied", async () => {
    await applyHdcDeliveryInBackground({
      id: "d1", seq: 1, prevSeq: 0, sentAt: new Date().toISOString(), mtrl: [101, 102],
    });
    expect(syncProductsByMtrl).toHaveBeenCalledWith([101, 102]);
    expect(clearListingCache).toHaveBeenCalledTimes(1);
    // Cleared after the products were written, not before.
    expect(clearListingCache.mock.invocationCallOrder[0]).toBeGreaterThan(
      syncProductsByMtrl.mock.invocationCallOrder[0],
    );
  });

  it("does not clear for an empty drain", async () => {
    await drainPendingHdcIds("test");
    expect(clearListingCache).not.toHaveBeenCalled();
  });
});
