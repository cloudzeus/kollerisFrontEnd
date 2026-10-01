import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Translation edits in the back office clear the in-process listing grid
 * cache, next to the storefront revalidation they already do. (Offer saves and
 * deletes clear it in lib/offers/offers.ts.)
 */
const clearListingCache = vi.hoisted(() => vi.fn());
vi.mock("@/lib/catalog/listing-cache", () => ({ clearListingCache }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: async () => ({ user: { role: "admin", email: "a@b" } }) }));
vi.mock("@/lib/rbac", () => ({ assertCan: () => undefined }));
vi.mock("@/lib/i18n/coverage", () => ({
  listMissing: vi.fn(),
  setTranslation: vi.fn(async () => ({ ok: true })),
  translateMissing: vi.fn(async () => ({ ok: true, translated: 3, remaining: 0 })),
}));

const translations = await import("@/app/admin/(protected)/translations/actions");

beforeEach(() => clearListingCache.mockClear());

describe("translation edits clear the listing grid cache", () => {
  it("when one is set by hand", async () => {
    await translations.actionSetTranslation("categories" as never, "en", "c1", "Drills");
    expect(clearListingCache).toHaveBeenCalledTimes(1);
  });

  it("when missing ones are filled in", async () => {
    await translations.actionTranslateMissing("categories" as never, "en");
    expect(clearListingCache).toHaveBeenCalledTimes(1);
  });
});
