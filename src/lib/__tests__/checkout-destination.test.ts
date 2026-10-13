import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `placeOrder` and where we deliver.
 *
 * Order KOL-20261013-0002 went to Verona: an Italian address, postcode 37015,
 * accepted at the Greek-island table rate after ACS said it had no station
 * there. The action is the control — these check that no order row is written
 * for an address we cannot deliver to, and that an ACS OUTAGE still lets an
 * ordinary Greek order through.
 */

const mocks = vi.hoisted(() => ({
  quote: vi.fn(),
  orderCreate: vi.fn(),
  getCart: vi.fn(),
  computeTotals: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("@node-rs/argon2", () => ({ hash: vi.fn() }));
vi.mock("@/lib/mail/order-email", () => ({ sendOrderEmail: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/mail/order-internal-email", () => ({
  sendInternalOrderEmail: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/account/session", () => ({ getCurrentUser: vi.fn(async () => null) }));
vi.mock("@/lib/payment/viva", () => ({
  isVivaConfigured: () => false,
  createPaymentOrder: vi.fn(),
}));
vi.mock("@/lib/cart/cart", async () => ({
  ...(await vi.importActual<typeof import("@/lib/cart/options")>("@/lib/cart/options")),
  getCartToken: vi.fn(async () => "cart-token"),
  getCart: mocks.getCart,
  computeTotals: mocks.computeTotals,
}));
vi.mock("@/lib/shipping/acs-live", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shipping/acs-live")>()),
  quoteLivePostage: mocks.quote,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      findFirst: vi.fn(async () => null),
      create: mocks.orderCreate,
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    product: { findMany: vi.fn(async () => []) },
    cartLine: { deleteMany: vi.fn() },
    customer: { findUnique: vi.fn(), create: vi.fn() },
  },
}));

const { placeOrder } = await import("@/lib/checkout/actions");

const line = {
  id: "l1",
  productId: "p1",
  sku: "4933478",
  name: "Δράπανο",
  brandName: "Bosch",
  image: null,
  quantity: 1,
  weight: 1.2,
  width: 10,
  length: 20,
  height: 10,
  unitNet: 100,
  discountPercent: 0,
  offerTitle: null,
  lineNet: 100,
  lineGross: 124,
  vatRate: 24,
  availability: "stock",
};

const totals = {
  postage: null,
  unserviceable: false,
  itemCount: 1,
  unitCount: 1,
  subtotalNet: 100,
  subtotalGross: 124,
  savingsGross: 0,
  shippingNet: 3.09,
  shippingGross: 3.83,
  paymentFeeNet: 0,
  paymentFeeGross: 0,
  vatAmount: 24.74,
  totalGross: 127.83,
  freeShippingRemaining: 0,
  freeShippingReached: false,
};

const tableQuote = {
  zone: "island",
  zoneLabel: "Νησιά",
  etaDays: "2-4",
  chargeableKg: 1.2,
  actualKg: 1.2,
  volumetricKg: 0.4,
  estimated: false,
  baseNet: 4.12,
  extraWeightNet: 0,
  totalNet: 4.12,
  source: "table",
  fallbackReason: "Courier pricing unavailable",
};

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  const all = {
    email: "cliente@example.it",
    phone: "+39 333 1234567",
    firstName: "Marco",
    lastName: "Rossi",
    shippingMethod: "courier",
    paymentMethod: "bank",
    terms: "on",
    locale: "el",
    ...fields,
  };
  for (const [k, v] of Object.entries(all)) data.set(k, v);
  return data;
}

/** The Verona order, as it was typed. */
const verona = {
  shipLine1: "Via Case Sparse 12, Terra",
  shipCity: "Sant'ambrogio di Valpolicella",
  shipPostcode: "37015",
  shipRegion: "Verona",
};

const UNSERVICEABLE =
  "Ο ΤΚ δεν αντιστοιχεί σε περιοχή που εξυπηρετούμε. Αποστέλλουμε μόνο εντός Ελλάδας.";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.getCart.mockResolvedValue({
    id: "c1",
    lines: [line],
    totals,
    shippingMethod: "courier",
    paymentMethod: "bank",
    couponCode: null,
  });
  mocks.computeTotals.mockResolvedValue(totals);
  // Stop the happy path at the row: the point is whether it is reached.
  mocks.orderCreate.mockRejectedValue(new Error("ORDER CREATED"));
});

describe("placeOrder — Greece only", () => {
  it("refuses 37015 when ACS has no station for it, and writes no order", async () => {
    mocks.quote.mockResolvedValue({
      source: "unserviceable",
      error: "unserviceable_postcode",
      postcode: "37015",
      reason: "No ACS station for postcode 37015",
    });

    const result = await placeOrder({}, form(verona));

    expect(result).toEqual({ error: UNSERVICEABLE, fieldErrors: { shipPostcode: UNSERVICEABLE } });
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("refuses an address that says «Italy» before asking ACS anything", async () => {
    const result = await placeOrder({}, form({ ...verona, shipAdminRegion: "Italy" }));

    expect(result.fieldErrors).toHaveProperty("shipAdminRegion");
    expect(result.error).toMatch(/εκτός Ελλάδας/);
    expect(mocks.quote).not.toHaveBeenCalled();
    expect(mocks.getCart).not.toHaveBeenCalled();
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it.each(["01067", "90210", "1010"])("refuses postcode %s by its shape", async (postcode) => {
    const result = await placeOrder({}, form({ ...verona, shipPostcode: postcode }));

    expect(result.fieldErrors).toEqual({ shipPostcode: UNSERVICEABLE });
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("answers in English on the English site", async () => {
    mocks.quote.mockResolvedValue({
      source: "unserviceable",
      error: "unserviceable_postcode",
      postcode: "37015",
      reason: "No ACS station for postcode 37015",
    });
    const result = await placeOrder({}, form({ ...verona, locale: "en" }));
    expect(result.error).toMatch(/We ship within Greece only/);
  });

  it("still takes a Greek order when ACS is down and the table answers", async () => {
    mocks.quote.mockResolvedValue(tableQuote);

    await expect(
      placeOrder(
        {},
        form({ shipLine1: "Ιταλίας 12", shipCity: "Ηράκλειο", shipPostcode: "71201" }),
      ),
    ).rejects.toThrow("ORDER CREATED");
    expect(mocks.orderCreate).toHaveBeenCalledOnce();
  });

  it("does not check the address of a pickup order — nothing is shipped", async () => {
    await expect(
      placeOrder({}, form({ ...verona, shippingMethod: "pickup", shipAdminRegion: "Italy" })),
    ).rejects.toThrow("ORDER CREATED");
    expect(mocks.quote).not.toHaveBeenCalled();
  });
});
