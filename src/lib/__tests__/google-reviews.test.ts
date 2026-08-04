import { describe, expect, it } from "vitest";
import { estimatedDeliveryDate } from "@/lib/seo/google-reviews";

/**
 * When Google should ask the customer how it went.
 *
 * Too early is the failure that matters: a survey about a parcel that has not
 * arrived invites a bad review of a delivery that was on time. So the estimate
 * always leans late, and it is derived from the same ACS zone table the
 * checkout quotes from rather than a number invented here.
 */
describe("estimatedDeliveryDate", () => {
  const placed = new Date("2026-08-04T10:00:00Z");

  it("takes the upper bound of a range, plus slack", () => {
    // Islands quote "2-4" days → 4 + 2 = 6.
    expect(estimatedDeliveryDate(placed, "2-4", "courier")).toBe("2026-08-10");
  });

  it("handles a single-day estimate", () => {
    // Attica quotes "1" → 1 + 2 = 3.
    expect(estimatedDeliveryDate(placed, "1", "courier")).toBe("2026-08-07");
  });

  it("asks the next day for a store pickup", () => {
    // Ready in two hours; there is no delivery to wait for.
    expect(estimatedDeliveryDate(placed, "1", "pickup")).toBe("2026-08-05");
  });

  it("falls back to a safe estimate when the zone is unknown", () => {
    // An order whose shippingQuote never recorded an eta — 3 + 2 = 5.
    expect(estimatedDeliveryDate(placed, null, "courier")).toBe("2026-08-09");
    expect(estimatedDeliveryDate(placed, "", "courier")).toBe("2026-08-09");
  });

  it("crosses a month boundary correctly", () => {
    const endOfMonth = new Date("2026-08-29T10:00:00Z");
    expect(estimatedDeliveryDate(endOfMonth, "2-4", "courier")).toBe("2026-09-04");
  });
});
