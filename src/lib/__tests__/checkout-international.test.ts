import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HdctoolError } from "@/lib/hdctool/client";
import { clearDhlQuoteCache } from "@/lib/shipping/courier-quote";

/**
 * `placeOrder` and the delivery country (docs/dhl-express.md §4).
 *
 * Flag off: the posted country is ignored and every Greek-only rule of
 * 43abb07 still holds — the Verona order is still refused. Flag on: GR/CY go
 * with ACS as before, the rest of the EU with DHL Express, re-quoted HERE from
 * HDCtool; nothing the browser posts is a price.
 *
 * `computeTotals` and both quote modules are the real ones; only HDCtool
 * (`hdctoolRequest`), the cart read and the database are stand-ins.
 */

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  orderCreate: vi.fn(),
  getCart: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
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
vi.mock("@/lib/requests/service", () => ({ announceNewRequest: vi.fn() }));
vi.mock("@/lib/hdctool/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hdctool/client")>()),
  hdctoolRequest: mocks.request,
}));
vi.mock("@/lib/cart/cart", async () => ({
  ...(await vi.importActual<typeof import("@/lib/cart/cart")>("@/lib/cart/cart")),
  getCartToken: vi.fn(async () => "cart-token"),
  getCart: mocks.getCart,
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

const ENDPOINT = "/api/public/courier/quote";

const line = {
  id: "l1",
  productId: "p1",
  slug: "drapano",
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
  unitNetFinal: 100,
  discountPercent: 0,
  offerTitle: null,
  offerHref: null,
  unitListNet: null,
  lineNet: 100,
  lineGross: 124,
  vatRate: 24,
  inStock: true,
  availableQty: 10,
  overStock: false,
  availability: "stock",
};

const dhlAnswer = {
  success: true,
  carrier: "DHL",
  productCode: "U",
  productName: "EXPRESS WORLDWIDE EU",
  netAmount: 31.4,
  vatRate: 24,
  grossAmount: 38.94,
  currency: "EUR",
  transitDays: 2,
  source: "dhl-mock",
};

const acsAnswer = {
  success: true,
  quote: {
    stationId: "ΗΡ",
    area: "ΗΡΑΚΛΕΙΟ",
    remote: false,
    basicNet: 4.12,
    extrasNet: 0,
    totalNet: 4.12,
    vatAmount: 0.99,
    totalGross: 5.11,
    weightKg: 1.2,
  },
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

const verona = {
  shipLine1: "Via Case Sparse 12, Terra",
  shipCity: "Sant'ambrogio di Valpolicella",
  shipPostcode: "37015",
  shipRegion: "Verona",
};

const heraklion = { shipLine1: "Ιταλίας 12", shipCity: "Ηράκλειο", shipPostcode: "71201" };

const createdData = () => mocks.orderCreate.mock.calls[0][0].data as Record<string, unknown>;

function cartWith(lines = [line]) {
  mocks.getCart.mockResolvedValue({
    id: "c1",
    lines,
    totals: {},
    shippingMethod: "courier",
    paymentMethod: "bank",
    couponCode: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  clearDhlQuoteCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  cartWith();
  mocks.orderCreate.mockRejectedValue(new Error("ORDER CREATED"));
});

afterEach(() => {
  delete process.env.INTERNATIONAL_SHIPPING_ENABLED;
});

describe("flag OFF — exactly as before", () => {
  it("ignores a posted country: Verona is still refused as a Greek postcode ACS does not serve", async () => {
    mocks.request.mockRejectedValue(
      new HdctoolError(
        `${ENDPOINT} failed (422) {"success":false,"error":"No ACS station for postcode 37015"}`,
        422,
        ENDPOINT,
      ),
    );
    const result = await placeOrder({}, form({ ...verona, shipCountry: "IT" }));
    expect(result.fieldErrors).toHaveProperty("shipPostcode");
    expect(result.error).toMatch(/Αποστέλλουμε μόνο εντός Ελλάδας/);
    // ACS was asked with the body it always had — no country.
    expect(mocks.request).toHaveBeenCalledWith(ENDPOINT, { postcode: "37015", weightKg: 1.2 });
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("still refuses «Italy» in the address before pricing", async () => {
    const result = await placeOrder({}, form({ ...verona, shipAdminRegion: "Italy", shipCountry: "IT" }));
    expect(result.fieldErrors).toHaveProperty("shipAdminRegion");
    expect(result.error).toMatch(/Αποστέλλουμε μόνο εντός Ελλάδας/);
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("a posted «dhl» is just an unknown method: the courier, as any unknown id was", async () => {
    mocks.request.mockResolvedValue(acsAnswer);
    await expect(placeOrder({}, form({ ...heraklion, shippingMethod: "dhl" }))).rejects.toThrow(
      "ORDER CREATED",
    );
    expect(createdData().shippingMethod).toBe("courier");
  });

  it("a Greek order is written without a shipCountry key (the column default) and ACS-priced", async () => {
    mocks.request.mockResolvedValue(acsAnswer);
    await expect(placeOrder({}, form(heraklion))).rejects.toThrow("ORDER CREATED");
    const data = createdData();
    expect(data).not.toHaveProperty("shipCountry");
    expect(data.shipPostcode).toBe("71201");
    expect(data.shippingNet).toBe(4.12);
    expect(data.shippingQuote).toMatchObject({ source: "acs" });
  });
});

describe("flag ON", () => {
  beforeEach(() => {
    process.env.INTERNATIONAL_SHIPPING_ENABLED = "on";
  });

  it("IT → DHL: re-quoted from HDCtool, saved with shipCountry and the DHL quote", async () => {
    mocks.request.mockResolvedValue(dhlAnswer);
    await expect(
      placeOrder(
        {},
        form({
          ...verona,
          shipCountry: "IT",
          shippingMethod: "dhl",
          // What a tampered form might post. None of it is read.
          shippingNet: "0.01",
          shippingGross: "0.01",
          totalGross: "1.00",
        }),
      ),
    ).rejects.toThrow("ORDER CREATED");

    expect(mocks.request).toHaveBeenCalledWith(
      ENDPOINT,
      expect.objectContaining({ country: "IT", postcode: "37015", city: verona.shipCity, weightKg: 1.2 }),
    );
    const data = createdData();
    expect(data.shipCountry).toBe("IT");
    expect(data.shippingMethod).toBe("dhl");
    expect(data.shippingNet).toBe(31.4);
    expect(data.shippingGross).toBe(38.94);
    expect(data.totalGross).toBe(162.94);
    expect(data.shippingQuote).toMatchObject({
      carrier: "DHL",
      productCode: "U",
      netAmount: 31.4,
      vatRate: 24,
      quotedAt: expect.any(String),
    });
  });

  it("DHL is never free, even over the free-shipping threshold", async () => {
    mocks.request.mockResolvedValue(dhlAnswer);
    cartWith([{ ...line, quantity: 2, lineNet: 200, lineGross: 248 }]);
    await expect(
      placeOrder({}, form({ ...verona, shipCountry: "IT", shippingMethod: "dhl" })),
    ).rejects.toThrow("ORDER CREATED");
    expect(createdData().shippingNet).toBe(31.4);
  });

  it("NL stores the postcode as the Netherlands writes it", async () => {
    mocks.request.mockResolvedValue(dhlAnswer);
    await expect(
      placeOrder(
        {},
        form({ shipLine1: "Damrak 1", shipCity: "Amsterdam", shipPostcode: "1012ab", shipCountry: "NL", shippingMethod: "dhl" }),
      ),
    ).rejects.toThrow("ORDER CREATED");
    expect(createdData().shipPostcode).toBe("1012 AB");
  });

  it("422 from DHL is shown on the postcode field and writes no order", async () => {
    mocks.request.mockRejectedValue(
      new HdctoolError(
        `${ENDPOINT} failed (422) {"success":false,"error":"unserviceable_postcode","message":"No DHL service"}`,
        422,
        ENDPOINT,
      ),
    );
    const result = await placeOrder({}, form({ ...verona, shipCountry: "IT", shippingMethod: "dhl" }));
    expect(result).toEqual({
      error: "Η DHL δεν εξυπηρετεί αυτόν τον Τ.Κ.",
      fieldErrors: { shipPostcode: "Η DHL δεν εξυπηρετεί αυτόν τον Τ.Κ." },
    });
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("5xx / timeout blocks the checkout with «δοκιμάστε ξανά» — no table abroad", async () => {
    mocks.request.mockRejectedValue(new HdctoolError(`${ENDPOINT} failed (502) bad gateway`, 502, ENDPOINT));
    const result = await placeOrder({}, form({ ...verona, shipCountry: "IT", shippingMethod: "dhl" }));
    expect(result).toEqual({ error: "Δεν ήταν δυνατός ο υπολογισμός μεταφορικών — δοκιμάστε ξανά" });
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("refuses a postcode of the wrong shape for the country without asking HDCtool", async () => {
    const result = await placeOrder(
      {},
      form({ ...verona, shipPostcode: "3701", shipCountry: "IT", shippingMethod: "dhl" }),
    );
    expect(result.fieldErrors).toHaveProperty("shipPostcode");
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("refuses ACS to Italy and DHL to Greece", async () => {
    const acsAbroad = await placeOrder({}, form({ ...verona, shipCountry: "IT", shippingMethod: "courier" }));
    expect(acsAbroad.fieldErrors).toHaveProperty("shippingMethod");
    const dhlHome = await placeOrder({}, form({ ...heraklion, shipCountry: "GR", shippingMethod: "dhl" }));
    expect(dhlHome.fieldErrors).toHaveProperty("shippingMethod");
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("refuses a country outside the EU", async () => {
    const result = await placeOrder({}, form({ ...verona, shipCountry: "GB", shippingMethod: "dhl" }));
    expect(result.fieldErrors).toHaveProperty("shipCountry");
  });

  it("GR → ACS exactly as before (no country in the quote body)", async () => {
    mocks.request.mockResolvedValue(acsAnswer);
    await expect(placeOrder({}, form({ ...heraklion, shipCountry: "GR" }))).rejects.toThrow("ORDER CREATED");
    expect(mocks.request).toHaveBeenCalledWith(ENDPOINT, { postcode: "71201", weightKg: 1.2 });
    expect(createdData()).not.toHaveProperty("shipCountry");
  });

  it("GR with «Italy» in the address asks for the country instead", async () => {
    const result = await placeOrder({}, form({ ...verona, shipAdminRegion: "Italy", shipCountry: "GR" }));
    expect(result.error).toMatch(/Επιλέξτε τη χώρα παράδοσης/);
  });

  it("CY → ACS with country CY", async () => {
    mocks.request.mockResolvedValue(acsAnswer);
    await expect(
      placeOrder({}, form({ shipLine1: "Μακαρίου 1", shipCity: "Λευκωσία", shipPostcode: "1010", shipCountry: "CY" })),
    ).rejects.toThrow("ORDER CREATED");
    expect(mocks.request).toHaveBeenCalledWith(ENDPOINT, { postcode: "1010", weightKg: 1.2, country: "CY" });
    expect(createdData().shipCountry).toBe("CY");
  });

  it("collection from the shop abroad asks no courier and keeps the country", async () => {
    await expect(
      placeOrder({}, form({ ...verona, shipCountry: "IT", shippingMethod: "pickup" })),
    ).rejects.toThrow("ORDER CREATED");
    expect(mocks.request).not.toHaveBeenCalled();
    expect(createdData()).toMatchObject({ shipCountry: "IT", shippingMethod: "pickup", shippingNet: 0 });
  });

  it("a back-order request to Italy stores the country", async () => {
    mocks.request.mockResolvedValue(dhlAnswer);
    cartWith([{ ...line, inStock: false, availableQty: 0, availability: "order" }]);
    await expect(
      placeOrder({}, form({ ...verona, shipCountry: "IT", shippingMethod: "dhl" })),
    ).rejects.toThrow("ORDER CREATED");
    const data = createdData();
    expect(data.requestStatus).toBe("REQUESTED");
    expect(data.shipCountry).toBe("IT");
    expect(data.shippingMethod).toBe("dhl");
  });

  it("a back-order request abroad is refused too when DHL cannot be priced", async () => {
    mocks.request.mockRejectedValue(new HdctoolError(`${ENDPOINT} failed (503) down`, 503, ENDPOINT));
    cartWith([{ ...line, inStock: false, availableQty: 0, availability: "order" }]);
    const result = await placeOrder({}, form({ ...verona, shipCountry: "IT", shippingMethod: "dhl" }));
    expect(result.error).toMatch(/δοκιμάστε ξανά/);
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });
});
