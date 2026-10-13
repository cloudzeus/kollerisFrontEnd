import { beforeEach, describe, expect, it, vi } from "vitest";
import { HdctoolError } from "@/lib/hdctool/client";

/**
 * The checkout form's live «do we deliver there?» — the same rule as the
 * order: a definite no from ACS is no, an outage is yes.
 */

const request = vi.hoisted(() => vi.fn());

vi.mock("@/lib/hdctool/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hdctool/client")>()),
  hdctoolRequest: request,
}));

const { checkDeliveryPostcode } = await import("@/lib/shipping/actions");

const ENDPOINT = "/api/public/courier/quote";

beforeEach(() => {
  request.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("checkDeliveryPostcode", () => {
  it("is no for 37015, where ACS has no station", async () => {
    request.mockRejectedValue(
      new HdctoolError(
        `${ENDPOINT} failed (422) {"success":false,"error":"No ACS station for postcode 37015"}`,
        422,
        ENDPOINT,
      ),
    );
    expect(await checkDeliveryPostcode({ postcode: "37015" })).toEqual({ serviceable: false });
  });

  it("is yes when ACS cannot be reached", async () => {
    request.mockRejectedValue(new TypeError("fetch failed"));
    expect(await checkDeliveryPostcode({ postcode: "54622" })).toEqual({ serviceable: true });
  });

  it("is no for a postcode that cannot be Greek, without asking ACS", async () => {
    expect(await checkDeliveryPostcode({ postcode: "01067" })).toEqual({ serviceable: false });
    expect(await checkDeliveryPostcode({ postcode: 37015 })).toEqual({ serviceable: false });
    expect(request).not.toHaveBeenCalled();
  });
});
