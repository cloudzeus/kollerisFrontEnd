import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Re-pricing the postage of an unpaid order follows the cart's rule: free
 * shipping over 150 € net is Greek only. An order to Cyprus (or anywhere else
 * abroad) is never re-priced from here — and never as free.
 */

const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/hdctool/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hdctool/client")>()),
  hdctoolRequest: request,
}));
vi.mock("@/lib/mail/postage-correction-email", () => ({ sendPostageCorrectionEmail: vi.fn() }));

const orderRow = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: { findUnique: vi.fn(async () => orderRow.current) },
    product: { findMany: vi.fn(async () => [{ id: "p1", weight: 1, width: 10, length: 10, height: 10 }]) },
  },
}));

const { previewPostageCorrection } = await import("@/lib/orders/postage-correction");

const acs = {
  success: true,
  quote: { stationId: "Π", area: "", remote: false, basicNet: 163.99, extrasNet: 0, totalNet: 163.99, vatAmount: 0, totalGross: 0, weightKg: 1 },
};

const order = (over: object = {}) => ({
  orderNumber: "K-1",
  paymentStatus: "PENDING",
  status: "PENDING_PAYMENT",
  requestStatus: null,
  shippingMethod: "courier",
  shipCountry: "GR",
  shipPostcode: "18545",
  email: "a@b.gr",
  subtotalNet: 200,
  subtotalGross: 248,
  paymentFeeNet: 0,
  paymentFeeGross: 0,
  shippingNet: 163.99,
  shippingGross: 203.35,
  vatAmount: 0,
  totalGross: 451.35,
  shippingQuote: null,
  lines: [{ productId: "p1", quantity: 2, weightKg: 1 }],
  ...over,
});

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue(acs);
});

describe("previewPostageCorrection and free shipping", () => {
  it("a Greek order over 150 € net is corrected to free postage, as before", async () => {
    orderRow.current = order();
    const r = await previewPostageCorrection("K-1");
    expect(r).toMatchObject({ ok: true, preview: { after: { freeShipping: true, shippingNet: 0 } } });
  });

  it("a Cyprus order is not corrected here, and is never priced as free", async () => {
    orderRow.current = order({ shipCountry: "CY", shipPostcode: "1010" });
    const r = await previewPostageCorrection("K-1");
    expect(r).toMatchObject({ ok: false });
    expect(r).not.toHaveProperty("preview");
    expect(request).not.toHaveBeenCalled();
  });
});
