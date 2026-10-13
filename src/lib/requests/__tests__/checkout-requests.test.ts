import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CartLineView } from "@/lib/cart/options";

/*
 * `placeOrder` end to end, with everything outside the process faked: the cart
 * (the server's view of stock), ACS, Viva, mail, HDCtool. What is under test is
 * which orders get written — split vs together — and that the server, not the
 * form, decides which lines are on request.
 */

const { Redirect, cartState, announceNewRequest } = vi.hoisted(() => {
  class Redirect extends Error {
    constructor(readonly url: string) {
      super(`redirect ${url}`);
    }
  }
  return {
    Redirect,
    cartState: { lines: [] as CartLineView[] },
    announceNewRequest: vi.fn(async (orderNumber: string) => {
      void orderNumber;
    }),
  };
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
}));

vi.mock("@/lib/cart/cart", () => ({
  getCartToken: async () => "cart-token",
  getCart: async () => ({
    id: "c1",
    lines: cartState.lines,
    totals: {},
    shippingMethod: "courier",
    paymentMethod: "card",
    couponCode: null,
  }),
  computeTotals: async (lines: CartLineView[]) => {
    const subtotalNet = lines.reduce((s, l) => s + l.lineNet, 0);
    const subtotalGross = lines.reduce((s, l) => s + l.lineGross, 0);
    return {
      subtotalNet,
      subtotalGross,
      shippingNet: 5,
      shippingGross: 6.2,
      paymentFeeNet: 0,
      paymentFeeGross: 0,
      vatAmount: subtotalGross + 6.2 - subtotalNet - 5,
      totalGross: subtotalGross + 6.2,
      savingsGross: 0,
    };
  },
}));
vi.mock("@/lib/shipping/acs-live", () => ({
  quoteLivePostage: async () => ({ source: "table", totalNet: 5, zoneLabel: "Αττική", etaDays: "1", chargeableKg: 1 }),
  isUnserviceable: (r: { source?: string } | null) => r?.source === "unserviceable",
}));
vi.mock("@/lib/shipping/destination", () => ({
  checkDestination: () => ({ ok: true }),
  destinationMessage: () => "",
  shippingCopy: () => ({ unserviceable: "no" }),
}));
vi.mock("@/lib/account/session", () => ({ getCurrentUser: async () => null }));
vi.mock("@node-rs/argon2", () => ({ hash: async () => "hash" }));
vi.mock("@/lib/prisma", async () => (await import("./request-fakes")).mockModules.prisma());
vi.mock("@/lib/payment/viva", async () => (await import("./request-fakes")).mockModules.viva());
vi.mock("@/lib/requests/service", () => ({ announceNewRequest }));
vi.mock("@/lib/mail/order-email", () => ({ sendOrderEmail: async () => ({ ok: true, id: "x" }) }));
vi.mock("@/lib/mail/order-internal-email", () => ({ sendInternalOrderEmail: async () => ({ ok: true, id: "x" }) }));

import { db, outside, prismaFake, resetFakes } from "./request-fakes";
import { placeOrder } from "@/lib/checkout/actions";

const cartLine = (id: string, over: Partial<CartLineView> = {}): CartLineView => ({
  id,
  productId: `p-${id}`,
  slug: id,
  name: `Προϊόν ${id}`,
  sku: `SKU-${id}`,
  brandName: "KNIPEX",
  image: null,
  quantity: 1,
  unitNet: 10,
  discountPercent: 0,
  unitNetFinal: 10,
  offerTitle: null,
  offerHref: null,
  unitListNet: null,
  vatRate: 24,
  lineNet: 10,
  lineGross: 12.4,
  inStock: true,
  availableQty: 5,
  overStock: false,
  weight: 1,
  width: null,
  length: null,
  height: null,
  ...over,
});

function form(over: Record<string, string> = {}): FormData {
  const data = new FormData();
  const fields: Record<string, string> = {
    email: "buyer@example.test",
    phone: "6900000000",
    firstName: "Μαρία",
    lastName: "Παπαδοπούλου",
    shipLine1: "Κ. Μαυρομιχάλη 4",
    shipCity: "Πειραιάς",
    shipPostcode: "18545",
    shippingMethod: "courier",
    paymentMethod: "card",
    terms: "on",
    locale: "el",
    ...over,
  };
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

async function submit(data: FormData): Promise<{ redirect?: string; state?: unknown }> {
  try {
    return { state: await placeOrder({}, data) };
  } catch (error) {
    if (error instanceof Redirect) return { redirect: error.url };
    throw error;
  }
}

beforeEach(() => {
  resetFakes();
  announceNewRequest.mockClear();
  Object.assign(prismaFake, {
    cartLine: { deleteMany: vi.fn(async () => ({ count: 1 })) },
    customer: { findUnique: vi.fn(async () => null), create: vi.fn() },
  });
  prismaFake.product.findMany.mockImplementation(async () => [
    { id: "p-a", mtrl: 101 },
    { id: "p-b", mtrl: 102 },
  ] as never);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const inStock = cartLine("a");
const missing = cartLine("b", { inStock: false, availableQty: 0 });

describe("checkout — back-order requests", () => {
  it("an all-in-stock cart is an ordinary order, exactly as before", async () => {
    cartState.lines = [inStock];
    const result = await submit(form());
    expect(result.redirect).toContain("vivapayments");
    expect(db.orders).toHaveLength(1);
    expect(db.orders[0].requestStatus).toBeNull();
    expect(announceNewRequest).not.toHaveBeenCalled();
  });

  it("an all-on-request cart writes one REQUEST: no Viva, no stock hold, redirect to /aitima/{token}", async () => {
    cartState.lines = [missing];
    const result = await submit(form({ paymentMethod: "" }));
    expect(db.orders).toHaveLength(1);
    const order = db.orders[0];
    expect(order).toMatchObject({ requestStatus: "REQUESTED", paymentStatus: "PENDING", shippingNet: 0 });
    expect(order.reservedUntil).toBeUndefined();
    expect(order.vivaOrderCode).toBeUndefined();
    expect(outside.createPaymentOrder).not.toHaveBeenCalled();
    expect(result.redirect).toBe(`/aitima/${order.requestToken}`);
    expect(String(order.requestToken)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(announceNewRequest).toHaveBeenCalledWith(order.orderNumber);
  });

  it("a mixed cart without a choice is refused and writes nothing", async () => {
    cartState.lines = [inStock, missing];
    const result = await submit(form());
    expect(result.state).toMatchObject({ fieldErrors: { requestMode: "Απαιτείται" } });
    expect(db.orders).toHaveLength(0);
  });

  it("mixed + split: a paid order for the in-stock lines and a REQUEST pointing at it", async () => {
    cartState.lines = [inStock, missing];
    const result = await submit(form({ requestMode: "split" }));
    expect(db.orders).toHaveLength(2);
    const [paid, request] = db.orders;
    expect(paid.requestStatus).toBeNull();
    expect(paid.totalGross).toBeCloseTo(12.4 + 6.2);
    expect(db.lines.filter((l) => l.orderId === paid.id).map((l) => l.sku)).toEqual(["SKU-a"]);
    expect(request).toMatchObject({ requestStatus: "REQUESTED", parentOrderNumber: paid.orderNumber, shippingNet: 0 });
    expect(db.lines.filter((l) => l.orderId === request.id).map((l) => l.sku)).toEqual(["SKU-b"]);
    expect(request.orderNumber).not.toBe(paid.orderNumber);
    // The customer pays the in-stock half now — only that amount.
    expect(outside.createPaymentOrder).toHaveBeenCalledWith(
      expect.objectContaining({ orderNumber: paid.orderNumber, amountGross: Number(paid.totalGross) }),
    );
    expect(result.redirect).toContain("vivapayments");
  });

  it("mixed + together: one REQUEST with every line", async () => {
    cartState.lines = [inStock, missing];
    const result = await submit(form({ requestMode: "together" }));
    expect(db.orders).toHaveLength(1);
    expect(db.orders[0].requestStatus).toBe("REQUESTED");
    expect(db.lines.map((l) => l.sku)).toEqual(["SKU-a", "SKU-b"]);
    const snapshot = db.orders[0].requestLines as { locale: string; lines: Array<{ sku: string; stockAtRequest: number }> };
    expect(snapshot.locale).toBe("el");
    expect(snapshot.lines.map((l) => [l.sku, l.stockAtRequest])).toEqual([
      ["SKU-a", 5],
      ["SKU-b", 0],
    ]);
    expect(result.redirect).toMatch(/^\/aitima\//);
  });

  it("the server's stock decides: a cart the form thought mixed, now all in stock, is an ordinary order", async () => {
    cartState.lines = [inStock];
    await submit(form({ requestMode: "together" }));
    expect(db.orders).toHaveLength(1);
    expect(db.orders[0].requestStatus).toBeNull();
  });

  it("the server's stock decides: «split» posted for a cart that is now entirely out of stock is a request", async () => {
    cartState.lines = [missing, cartLine("c", { availableQty: 1, quantity: 3, overStock: true })];
    await submit(form({ requestMode: "split" }));
    expect(db.orders).toHaveLength(1);
    expect(db.orders[0].requestStatus).toBe("REQUESTED");
    expect(outside.createPaymentOrder).not.toHaveBeenCalled();
  });

  it("an English customer is sent to the English request page", async () => {
    cartState.lines = [missing];
    const result = await submit(form({ locale: "en" }));
    expect(result.redirect).toMatch(/^\/en\/aitima\//);
  });
});
