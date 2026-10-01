import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* `after()` needs a request scope; here it only records the callbacks so the
   test can run them as "the response has finished streaming". */
const afterCallbacks: Array<() => void> = [];
vi.mock("next/server", () => ({ after: (fn: () => void) => afterCallbacks.push(fn) }));

const { LISTING_RENDER_SLOTS, admitListingRender, listingBusyRobots, listingRenderStats } =
  await import("@/lib/server/render-gate");
const { filteredListingRobots } = await import("@/lib/catalog/listing-query");

function finishResponses() {
  while (afterCallbacks.length) afterCallbacks.shift()!();
}

beforeEach(() => finishResponses());
afterEach(() => {
  finishResponses();
  vi.useRealTimers();
});

describe("admitListingRender", () => {
  it("never queues an unfiltered listing or its paging", async () => {
    for (let i = 0; i < LISTING_RENDER_SLOTS * 3; i++) {
      expect(await admitListingRender({ page: String(i + 2), utm_source: "x" })).toBe(true);
    }
    expect(listingRenderStats().active).toBe(0);
  });

  it("holds a slot per filtered render until the response is done", async () => {
    expect(await admitListingRender({ sub: "a" })).toBe(true);
    expect(listingRenderStats().active).toBe(1);
    finishResponses();
    expect(listingRenderStats().active).toBe(0);
  });
});

describe("the busy view is noindex through the metadata", () => {
  it("says nothing for a render that got its slot, or never needed one", async () => {
    expect(await listingBusyRobots({})).toBeUndefined();
    expect(await listingBusyRobots({ brand: "x" })).toBeUndefined();
  });

  it("puts noindex in the metadata of a render the gate refused", async () => {
    vi.useFakeTimers();
    for (let i = 0; i < LISTING_RENDER_SLOTS; i++) {
      expect(await admitListingRender({ sub: `s${i}` })).toBe(true);
    }
    const robots = listingBusyRobots({ sub: "late" });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await robots).toEqual({ index: false, follow: true });
  });

  it("is already covered for every view the gate can refuse: only filtered ones queue", () => {
    for (const params of [{ sub: "a" }, { brand: "x", page: "3" }, { sort: "price-asc" }]) {
      expect(filteredListingRobots(params)).toEqual({ index: false, follow: true });
    }
  });
});
