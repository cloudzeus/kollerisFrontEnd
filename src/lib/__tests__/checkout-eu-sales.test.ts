import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDhlQuoteCache } from "@/lib/shipping/courier-quote";

/**
 * `placeOrder` with EU sales (intra-EU sales design §3; EU_SALES_ENABLED).
 *
 * The server never trusts the form about VAT or postage: for a company abroad
 * it asks VIES again (`checkEuVat`) and DHL again (`quoteDhl`), decides the
 * VAT mode itself, and freezes the totals it computed. With the flag off the
 * checkout is today's and a posted foreign country is refused.
 *
 * `computeTotals` is the real one; HDCtool's two EU calls, the ACS call, the
 * cart read, Viva and the database are stand-ins.
 */

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  orderCreate: vi.fn(),
  getCart: vi.fn(),
  checkEuVat: vi.fn(),
  quoteDhl: vi.fn(),
  createPaymentOrder: vi.fn(),
  writeEuBuyer: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/eu-sales/buyer-cookie", () => ({ writeEuBuyer: mocks.writeEuBuyer }));
vi.mock("@node-rs/argon2", () => ({ hash: vi.fn() }));
vi.mock("@/lib/mail/order-email", () => ({ sendOrderEmail: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/mail/order-internal-email", () => ({
  sendInternalOrderEmail: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/account/session", () => ({ getCurrentUser: vi.fn(async () => null) }));
vi.mock("@/lib/payment/viva", () => ({
  isVivaConfigured: () => true,
  createPaymentOrder: mocks.createPaymentOrder,
}));
vi.mock("@/lib/requests/service", () => ({ announceNewRequest: vi.fn() }));
vi.mock("@/lib/hdctool/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hdctool/client")>()),
  hdctoolRequest: mocks.request,
}));
vi.mock("@/lib/eu-sales/hdctool-eu", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/eu-sales/hdctool-eu")>()),
  checkEuVat: mocks.checkEuVat,
  quoteDhl: mocks.quoteDhl,
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

const NO_DHL = "Η αποστολή στη χώρα σας δεν είναι διαθέσιμη αυτή τη στιγμή — επικοινωνήστε μαζί μας";

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

const dhlQuote = {
  ok: true as const,
  productCode: "U",
  productName: "EXPRESS WORLDWIDE EU",
  netAmount: 31.4,
  vatRate: 24,
  grossAmount: 38.94,
  quotedAt: "2026-10-27T10:00:00.000Z",
  estimatedDeliveryDate: "2026-10-30",
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

const berlin = {
  shipLine1: "Unter den Linden 1",
  shipCity: "Berlin",
  shipPostcode: "10117",
  shipCountry: "DE",
  shippingMethod: "dhl",
};
const heraklion = { shipLine1: "Ιταλίας 12", shipCity: "Ηράκλειο", shipPostcode: "71201" };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  const all = {
    email: "einkauf@acme.de",
    phone: "+49 30 1234567",
    firstName: "Anna",
    lastName: "Schmidt",
    shippingMethod: "courier",
    paymentMethod: "card",
    terms: "on",
    locale: "el",
    ...fields,
  };
  for (const [k, v] of Object.entries(all)) data.set(k, v);
  return data;
}

const company = {
  ...berlin,
  customerType: "company",
  companyName: "ACME GmbH",
  vatNumber: "de 123 456 789",
  // What a tampered or stale form might claim. None of it is read.
  viesStatus: "valid",
  vatMode: "intra_eu_exempt",
};

const createdData = () => mocks.orderCreate.mock.calls[0][0].data as Record<string, unknown>;

function cartWith(lines = [line]) {
  mocks.getCart.mockResolvedValue({
    id: "c1",
    lines,
    totals: {},
    shippingMethod: "courier",
    paymentMethod: "card",
    couponCode: null,
  });
}

function validVies(overrides: Record<string, unknown> = {}) {
  return {
    status: "valid",
    name: "ACME GMBH",
    address: "UNTER DEN LINDEN 1, 10117 BERLIN",
    consultationNumber: "WAPIAAAAZ1",
    checkedAt: new Date().toISOString(),
    message: "Ο ΑΦΜ είναι ενεργός στο VIES",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearDhlQuoteCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  cartWith();
  mocks.orderCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "o1",
    orderNumber: data.orderNumber,
    guestToken: data.guestToken,
    totalGross: data.totalGross,
  }));
  mocks.createPaymentOrder.mockResolvedValue({ orderCode: "123", checkoutUrl: "https://viva.example/pay" });
  mocks.quoteDhl.mockResolvedValue(dhlQuote);
  mocks.checkEuVat.mockResolvedValue(validVies());
  mocks.request.mockResolvedValue(acsAnswer);
});

afterEach(() => {
  delete process.env.EU_SALES_ENABLED;
  delete process.env.INTERNATIONAL_SHIPPING_ENABLED;
});

describe("EU_SALES_ENABLED off — today's checkout", () => {
  it("a posted DE is ignored: the order is Greek, the Greek checks run, VIES and DHL are never asked (R11-FLAG)", async () => {
    await expect(placeOrder({}, form(company))).rejects.toThrow("REDIRECT https://viva.example/pay");
    expect(mocks.checkEuVat).not.toHaveBeenCalled();
    expect(mocks.quoteDhl).not.toHaveBeenCalled();
    // ACS, with the body it always had — no country.
    expect(mocks.request).toHaveBeenCalledWith("/api/public/courier/quote", { postcode: "10117", weightKg: 1.2 });
    const data = createdData();
    expect(data).not.toHaveProperty("shipCountry");
    expect(data).not.toHaveProperty("billCountry");
    expect(data).not.toHaveProperty("vatMode");
    expect(data).toMatchObject({ shippingMethod: "courier", wantsInvoice: false, vatNumber: null });
  });

  it("«on», «1» are not «true»: still off", async () => {
    process.env.EU_SALES_ENABLED = "on";
    await expect(placeOrder({}, form(company))).rejects.toThrow("REDIRECT");
    expect(mocks.checkEuVat).not.toHaveBeenCalled();
    expect(mocks.quoteDhl).not.toHaveBeenCalled();
    expect(createdData()).not.toHaveProperty("shipCountry");
  });

  it("international shipping on, EU sales off: an IT order has shipCountry but no billCountry (rows as today)", async () => {
    process.env.INTERNATIONAL_SHIPPING_ENABLED = "on";
    mocks.request.mockResolvedValue({
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
    });
    await expect(
      placeOrder(
        {},
        form({ shipLine1: "Via Roma 1", shipCity: "Verona", shipPostcode: "37015", shipCountry: "IT", shippingMethod: "dhl" }),
      ),
    ).rejects.toThrow("REDIRECT");
    expect(mocks.checkEuVat).not.toHaveBeenCalled();
    const data = createdData();
    expect(data.shipCountry).toBe("IT");
    expect(data).not.toHaveProperty("billCountry");
  });

  it("a Greek order is written exactly as before: no EU columns at all", async () => {
    await expect(placeOrder({}, form(heraklion))).rejects.toThrow("REDIRECT https://viva.example/pay");
    const data = createdData();
    for (const key of [
      "shipCountry",
      "billCountry",
      "customerType",
      "vatMode",
      "viesValid",
      "viesName",
      "dhlProductCode",
    ]) {
      expect(data).not.toHaveProperty(key);
    }
    expect(data.totalGross).toBe(129.11);
    expect(mocks.checkEuVat).not.toHaveBeenCalled();
  });
});

describe("EU_SALES_ENABLED on", () => {
  beforeEach(() => {
    process.env.EU_SALES_ENABLED = "true";
  });

  it("DE company: VIES is asked again on the server, the order is exempt and Viva charges the net", async () => {
    await expect(placeOrder({}, form(company))).rejects.toThrow("REDIRECT https://viva.example/pay");

    // Normalised before asking, whatever the form claimed about the result.
    expect(mocks.checkEuVat).toHaveBeenCalledTimes(1);
    expect(mocks.checkEuVat).toHaveBeenCalledWith("DE123456789", "DE");
    expect(mocks.quoteDhl).toHaveBeenCalledWith({
      country: "DE",
      postcode: "10117",
      city: "Berlin",
      weightKg: 1.2,
    });

    const data = createdData();
    expect(data).toMatchObject({
      shipCountry: "DE",
      billCountry: "DE",
      customerType: "company",
      vatMode: "intra_eu_exempt",
      wantsInvoice: true,
      companyName: "ACME GmbH",
      vatNumber: "DE123456789",
      viesValid: true,
      viesName: "ACME GMBH",
      viesAddress: "UNTER DEN LINDEN 1, 10117 BERLIN",
      viesConsultationNumber: "WAPIAAAAZ1",
      shippingMethod: "dhl",
      dhlProductCode: "U",
      dhlNetAmount: 31.4,
      dhlVatRate: 0,
    });
    expect(data.viesCheckedAt).toBeInstanceOf(Date);
    expect(data.dhlQuotedAt).toEqual(new Date(dhlQuote.quotedAt));

    // Net everywhere: 100 goods + 31.40 DHL, no VAT.
    expect(data.subtotalGross).toBe(100);
    expect(data.shippingNet).toBe(31.4);
    expect(data.shippingGross).toBe(31.4);
    expect(data.vatAmount).toBe(0);
    expect(data.totalGross).toBe(131.4);
    expect(mocks.createPaymentOrder).toHaveBeenCalledWith(expect.objectContaining({ amountGross: 131.4 }));
  });

  it("DE company: VIES now says invalid → 24% VAT, the order still goes through", async () => {
    mocks.checkEuVat.mockResolvedValue(validVies({ status: "invalid", name: null, address: null, consultationNumber: null }));
    await expect(placeOrder({}, form(company))).rejects.toThrow("REDIRECT");
    const data = createdData();
    expect(data).toMatchObject({ vatMode: "standard", viesValid: false, customerType: "company" });
    expect(data.totalGross).toBe(162.94);
  });

  it("checkout left open overnight: the form's valid is yesterday's, VIES is down now → VAT is charged (Review Focus 3)", async () => {
    mocks.checkEuVat.mockResolvedValue({
      status: "unavailable",
      name: null,
      address: null,
      consultationNumber: null,
      checkedAt: null,
      message: "Δεν ήταν δυνατός ο έλεγχος του ΑΦΜ τώρα — δοκιμάστε ξανά σε λίγο ή συνεχίστε με ΦΠΑ",
    });
    await expect(
      placeOrder({}, form({ ...company, viesCheckedAt: "2026-10-26T18:00:00Z" })),
    ).rejects.toThrow("REDIRECT");
    const data = createdData();
    expect(data.vatMode).toBe("standard");
    expect(data.viesValid).toBeNull();
    expect(data.totalGross).toBe(162.94);
    expect(mocks.createPaymentOrder).toHaveBeenCalledWith(expect.objectContaining({ amountGross: 162.94 }));
  });

  it("a valid answer dated yesterday does not exempt (same Athens day only)", async () => {
    mocks.checkEuVat.mockResolvedValue(validVies({ checkedAt: new Date(Date.now() - 36 * 3600_000).toISOString() }));
    await expect(placeOrder({}, form(company))).rejects.toThrow("REDIRECT");
    expect(createdData().vatMode).toBe("standard");
  });

  it("DE individual → 24%, and VIES is never asked", async () => {
    await expect(
      placeOrder({}, form({ ...company, customerType: "individual" })),
    ).rejects.toThrow("REDIRECT");
    expect(mocks.checkEuVat).not.toHaveBeenCalled();
    const data = createdData();
    expect(data).toMatchObject({
      shipCountry: "DE",
      billCountry: "DE",
      customerType: "individual",
      vatMode: "standard",
      wantsInvoice: false,
      companyName: null,
      vatNumber: null,
      viesValid: null,
    });
    expect(data.vatAmount).toBe(31.54);
    expect(data.totalGross).toBe(162.94);
  });

  it("a «wantsInvoice» posted abroad is ignored: customerType decides", async () => {
    await expect(
      placeOrder({}, form({ ...berlin, customerType: "individual", wantsInvoice: "on", companyName: "X", vatNumber: "1" })),
    ).rejects.toThrow("REDIRECT");
    expect(createdData()).toMatchObject({ wantsInvoice: false, companyName: null, vatNumber: null });
  });

  it("abroad without a customer type is asked for one", async () => {
    const result = await placeOrder({}, form(berlin));
    expect(result.fieldErrors).toHaveProperty("customerType");
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("a company needs its name and VAT number", async () => {
    const result = await placeOrder({}, form({ ...berlin, customerType: "company" }));
    expect(result.fieldErrors).toMatchObject({ companyName: expect.any(String), vatNumber: expect.any(String) });
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("a VAT number for another country is refused on the field, without asking VIES (Review Focus 1)", async () => {
    const result = await placeOrder({}, form({ ...company, vatNumber: "FR12345678901" }));
    expect(result.fieldErrors).toHaveProperty("vatNumber");
    expect(mocks.checkEuVat).not.toHaveBeenCalled();
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("no DHL price → the spec's sentence, and no order", async () => {
    mocks.quoteDhl.mockResolvedValue({ ok: false, reason: "unavailable" });
    const result = await placeOrder({}, form(company));
    expect(result.error).toBe(NO_DHL);
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("DHL refuses the postcode → on the Τ.Κ. field, no order", async () => {
    mocks.quoteDhl.mockResolvedValue({ ok: false, reason: "invalid_postcode" });
    const result = await placeOrder({}, form(company));
    expect(result.fieldErrors).toHaveProperty("shipPostcode");
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("collection from the shop is not offered abroad", async () => {
    const result = await placeOrder({}, form({ ...company, shippingMethod: "pickup" }));
    expect(result.fieldErrors).toHaveProperty("shippingMethod");
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("DHL is charged at any basket value (no free shipping abroad)", async () => {
    cartWith([{ ...line, quantity: 3, lineNet: 300, lineGross: 372 }]);
    await expect(placeOrder({}, form({ ...company, customerType: "individual" }))).rejects.toThrow("REDIRECT");
    expect(createdData().shippingNet).toBe(31.4);
  });

  it("Cyprus is not offered (out of scope for now)", async () => {
    const result = await placeOrder(
      {},
      form({ shipLine1: "Μακαρίου 1", shipCity: "Λευκωσία", shipPostcode: "1010", shipCountry: "CY" }),
    );
    expect(result.fieldErrors).toHaveProperty("shipCountry");
  });

  it("Greece with «el 099095556»: the AADE path as today — never VIES, never exempt (Review Focus 5)", async () => {
    await expect(
      placeOrder(
        {},
        form({
          ...heraklion,
          shipCountry: "GR",
          wantsInvoice: "on",
          companyName: "ΑΦΟΙ ΚΟΛΛΕΡΗ ΙΚΕ",
          vatNumber: "el 099095556",
          // Even a posted company type does not open the EU path in Greece.
          customerType: "company",
        }),
      ),
    ).rejects.toThrow("REDIRECT");
    expect(mocks.checkEuVat).not.toHaveBeenCalled();
    expect(mocks.quoteDhl).not.toHaveBeenCalled();
    const data = createdData();
    expect(data).toMatchObject({
      shipCountry: "GR",
      billCountry: "GR",
      vatMode: "standard",
      wantsInvoice: true,
      vatNumber: "el 099095556",
      customerType: null,
    });
    expect(data.totalGross).toBe(129.11);
  });

  it("with INTERNATIONAL_SHIPPING_ENABLED too: Cyprus keeps today's ACS path, Germany takes the EU path", async () => {
    process.env.INTERNATIONAL_SHIPPING_ENABLED = "on";
    await expect(
      placeOrder(
        {},
        form({ shipLine1: "Μακαρίου 1", shipCity: "Λευκωσία", shipPostcode: "1010", shipCountry: "CY", customerType: "company" }),
      ),
    ).rejects.toThrow("REDIRECT");
    expect(mocks.checkEuVat).not.toHaveBeenCalled();
    expect(mocks.quoteDhl).not.toHaveBeenCalled();
    expect(createdData()).toMatchObject({ shipCountry: "CY", billCountry: "CY", customerType: null, vatMode: "standard" });

    vi.clearAllMocks();
    mocks.orderCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "o2",
      orderNumber: data.orderNumber,
      guestToken: data.guestToken,
      totalGross: data.totalGross,
    }));
    mocks.createPaymentOrder.mockResolvedValue({ orderCode: "124", checkoutUrl: "https://viva.example/pay" });
    mocks.quoteDhl.mockResolvedValue(dhlQuote);
    mocks.checkEuVat.mockResolvedValue(validVies());
    await expect(placeOrder({}, form(company))).rejects.toThrow("REDIRECT");
    expect(mocks.checkEuVat).toHaveBeenCalledWith("DE123456789", "DE");
    expect(createdData()).toMatchObject({ vatMode: "intra_eu_exempt", totalGross: 131.4 });
  });

  it("an exempt order is frozen exempt throughout: lines at 0%, gross = net, DHL rate 0 (R11-I1)", async () => {
    await expect(placeOrder({}, form(company))).rejects.toThrow("REDIRECT");
    const data = createdData();
    const lines = (data.lines as { create: Array<Record<string, unknown>> }).create;
    expect(lines[0]).toMatchObject({ vatRate: 0, unitGross: 100, lineNet: 100, lineGross: 100 });
    expect(data.dhlVatRate).toBe(0);
    expect(data.shippingQuote).toMatchObject({ vatRate: 0, netAmount: 31.4 });
  });

  it("a standard EU order keeps today's line VAT and the DHL rate 24", async () => {
    await expect(placeOrder({}, form({ ...company, customerType: "individual" }))).rejects.toThrow("REDIRECT");
    const data = createdData();
    const lines = (data.lines as { create: Array<Record<string, unknown>> }).create;
    expect(lines[0]).toMatchObject({ vatRate: 24, unitGross: 124, lineGross: 124 });
    expect(data.dhlVatRate).toBe(24);
  });

  describe("the displayed VAT mode is a hint (R11-I2)", () => {
    const UNAVAILABLE = "Δεν ήταν δυνατός ο έλεγχος του ΑΦΜ τώρα — δοκιμάστε ξανά σε λίγο ή συνεχίστε με ΦΠΑ";

    it("shown net, VIES now unavailable → no order, the message, and the page re-renders with VAT", async () => {
      mocks.checkEuVat.mockResolvedValue(
        validVies({ status: "unavailable", name: null, address: null, consultationNumber: null, checkedAt: null }),
      );
      const result = await placeOrder({}, form({ ...company, vatModeHint: "intra_eu_exempt" }));
      expect(result.error).toBe(UNAVAILABLE);
      expect(mocks.orderCreate).not.toHaveBeenCalled();
      expect(mocks.createPaymentOrder).not.toHaveBeenCalled();
      // The fresh answer replaces the stale one, so the summary charges VAT.
      expect(mocks.writeEuBuyer).toHaveBeenCalledWith({
        customerType: "company",
        vies: { country: "DE", vat: "DE123456789", status: "unavailable", checkedAt: null },
      });
      expect(mocks.revalidatePath).toHaveBeenCalled();
    });

    it("shown net, VIES now invalid → no order", async () => {
      mocks.checkEuVat.mockResolvedValue(validVies({ status: "invalid" }));
      const result = await placeOrder({}, form({ ...company, vatModeHint: "intra_eu_exempt" }));
      expect(result.error).toBe(UNAVAILABLE);
      expect(mocks.orderCreate).not.toHaveBeenCalled();
    });

    it("shown net, the only valid answer is yesterday's → no order", async () => {
      mocks.checkEuVat.mockResolvedValue(validVies({ checkedAt: new Date(Date.now() - 36 * 3600_000).toISOString() }));
      const result = await placeOrder({}, form({ ...company, vatModeHint: "intra_eu_exempt" }));
      expect(result.error).toBe(UNAVAILABLE);
      expect(mocks.orderCreate).not.toHaveBeenCalled();
    });

    it("shown net and valid today → the exempt order goes through", async () => {
      await expect(placeOrder({}, form({ ...company, vatModeHint: "intra_eu_exempt" }))).rejects.toThrow("REDIRECT");
      expect(createdData()).toMatchObject({ vatMode: "intra_eu_exempt", totalGross: 131.4 });
      expect(mocks.writeEuBuyer).not.toHaveBeenCalled();
    });

    it("shown with VAT, server now exempt → goes through net (never more than shown)", async () => {
      await expect(placeOrder({}, form({ ...company, vatModeHint: "standard" }))).rejects.toThrow("REDIRECT");
      expect(createdData()).toMatchObject({ vatMode: "intra_eu_exempt", totalGross: 131.4 });
    });

    it("the resubmit after the message (hint now standard) is charged with VAT", async () => {
      mocks.checkEuVat.mockResolvedValue(
        validVies({ status: "unavailable", name: null, address: null, consultationNumber: null, checkedAt: null }),
      );
      await expect(placeOrder({}, form({ ...company, vatModeHint: "standard" }))).rejects.toThrow("REDIRECT");
      expect(createdData()).toMatchObject({ vatMode: "standard", totalGross: 162.94 });
    });
  });
});
