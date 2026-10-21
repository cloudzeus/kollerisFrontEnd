import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { CartLineView } from "@/lib/cart/options";

/*
 * The split checkout in numbers: what the option card, the summary and the
 * pay button say, against what `placeOrder` charges. `computeTotals` is faked
 * with the shop's real rule shape — postage per shipment, free over the
 * threshold — so the test can see the threshold move when a cart is split.
 */

const { Redirect, cartState } = vi.hoisted(() => {
  class Redirect extends Error {
    constructor(readonly url: string) {
      super(`redirect ${url}`);
    }
  }
  return { Redirect, cartState: { lines: [] as CartLineView[] } };
});

const THRESHOLD = 150;
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
async function fakeTotals(lines: CartLineView[], shippingMethod: string) {
  const subtotalNet = round(lines.reduce((s, l) => s + l.lineNet, 0));
  const subtotalGross = round(lines.reduce((s, l) => s + l.lineGross, 0));
  const freeShippingReached = subtotalNet >= THRESHOLD;
  const shippingNet = shippingMethod === "pickup" || freeShippingReached ? 0 : 5;
  const shippingGross = round(shippingNet * 1.24);
  const totalGross = round(subtotalGross + shippingGross);
  return {
    postage: null,
    unserviceable: false,
    itemCount: lines.length,
    unitCount: lines.reduce((s, l) => s + l.quantity, 0),
    subtotalNet,
    subtotalGross,
    savingsGross: 0,
    shippingNet,
    shippingGross,
    paymentFeeNet: 0,
    paymentFeeGross: 0,
    vatAmount: round(totalGross - subtotalNet - shippingNet),
    totalGross,
    freeShippingRemaining: Math.max(0, THRESHOLD - subtotalNet),
    freeShippingReached,
  };
}

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
    totals: await fakeTotals(cartState.lines, "courier"),
    shippingMethod: "courier",
    paymentMethod: "card",
    couponCode: null,
  }),
  computeTotals: (lines: CartLineView[], shippingMethod: string) => fakeTotals(lines, shippingMethod),
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
vi.mock("@/lib/requests/service", () => ({ announceNewRequest: async () => {} }));
vi.mock("@/lib/mail/order-email", () => ({ sendOrderEmail: async () => ({ ok: true, id: "x" }) }));
vi.mock("@/lib/mail/order-internal-email", () => ({ sendInternalOrderEmail: async () => ({ ok: true, id: "x" }) }));

import { db, outside, prismaFake, resetFakes } from "./request-fakes";
import { placeOrder } from "@/lib/checkout/actions";
import { checkoutBreakdown } from "@/lib/requests/checkout-breakdown";
import { buildBreakdown, requestPart } from "@/lib/requests/breakdown";

const line = (id: string, net: number, over: Partial<CartLineView> = {}): CartLineView => ({
  id,
  productId: `p-${id}`,
  slug: id,
  name: `Προϊόν ${id}`,
  sku: `SKU-${id}`,
  brandName: "KNIPEX",
  image: null,
  quantity: 1,
  unitNet: net,
  discountPercent: 0,
  unitNetFinal: net,
  offerTitle: null,
  offerHref: null,
  unitListNet: null,
  vatRate: 24,
  lineNet: net,
  lineGross: round(net * 1.24),
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

async function submit(data: FormData) {
  try {
    return { state: await placeOrder({}, data) };
  } catch (error) {
    if (error instanceof Redirect) return { redirect: error.url };
    throw error;
  }
}

async function breakdownFor(lines: CartLineView[], shippingMethod: "courier" | "pickup" = "courier") {
  return checkoutBreakdown({
    lines,
    cartTotals: await fakeTotals(lines, shippingMethod),
    shippingMethod,
    paymentMethod: "card",
    postcode: "18545",
  });
}

beforeEach(() => {
  resetFakes();
  Object.assign(prismaFake, {
    cartLine: { deleteMany: vi.fn(async () => ({ count: 1 })) },
    customer: { findUnique: vi.fn(async () => null), create: vi.fn() },
  });
  prismaFake.product.findMany.mockImplementation(async () => [] as never);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// 100 net in stock + 80 net on request: 180 together (free), 100 alone (not).
const inStock = line("a", 100);
const missing = line("b", 80, { inStock: false, availableQty: 0 });

describe("split breakdown — the numbers", () => {
  it("«now» is the in-stock lines with their own postage and VAT; the request is indicative", async () => {
    const b = await breakdownFor([inStock, missing]);
    expect(b?.kind).toBe("mixed");
    const now = b!.split!.now;
    expect(now).toMatchObject({
      itemCount: 1,
      lineIds: ["a"],
      subtotalNet: 100,
      subtotalGross: 124,
      shippingNet: 5,
      shippingGross: 6.2,
      paymentFeeGross: 0,
      totalGross: 130.2,
    });
    // VAT of the goods and of the postage, stated once.
    expect(now.vatAmount).toBeCloseTo(24 + 1.2, 2);
    expect(b!.split!.request).toMatchObject({ itemCount: 1, lineIds: ["b"], subtotalGross: 99.2 });
    expect(b!.together).toMatchObject({ itemCount: 2, subtotalGross: 223.2 });
  });

  it("splitting moves the threshold: the whole cart ships free, the in-stock part alone does not — and says so", async () => {
    const b = await breakdownFor([inStock, missing]);
    expect(b!.split!.now.shippingGross).toBeGreaterThan(0);
    expect(b!.split!.now.thresholdLost).toBe(true);
    // An in-stock part over the threshold on its own keeps its free delivery.
    const big = await breakdownFor([line("c", 200), missing]);
    expect(big!.split!.now).toMatchObject({ shippingGross: 0, thresholdLost: false, totalGross: 248 });
  });

  it("pickup: no postage on the «now» part", async () => {
    const b = await breakdownFor([inStock, missing], "pickup");
    expect(b!.split!.now).toMatchObject({ shippingGross: 0, totalGross: 124, thresholdLost: false });
  });

  it("all on request: nothing to pay now, the whole cart is the request", async () => {
    const b = await breakdownFor([missing, line("d", 10, { inStock: false, availableQty: 0 })]);
    expect(b).toMatchObject({ kind: "all", split: null });
    expect(b!.together).toMatchObject({ itemCount: 2, subtotalGross: 111.6 });
  });

  it("an ordinary cart has no breakdown at all — its page is unchanged", async () => {
    expect(await breakdownFor([inStock])).toBeNull();
    expect(
      buildBreakdown({
        lines: [inStock],
        shippingMethod: "courier",
        paymentMethod: "card",
        postcode: null,
        cartTotals: { freeShippingReached: false },
        nowTotals: null,
      }),
    ).toMatchObject({ kind: "none", split: null, together: null });
  });

  it("requestPart sums the lines as the cart priced them", () => {
    expect(requestPart([line("x", 10, { quantity: 2, lineNet: 20, lineGross: 24.8 }), line("y", 0.1)])).toMatchObject({
      itemCount: 2,
      unitCount: 3,
      subtotalNet: 20.1,
      subtotalGross: 24.92,
    });
  });
});

describe("split checkout — the server charges exactly the «now» amount shown", () => {
  it("paid order total = Viva amount = breakdown «now» total; the request holds the rest", async () => {
    cartState.lines = [inStock, missing];
    const shown = await breakdownFor(cartState.lines);
    const result = await submit(form({ requestMode: "split" }));
    expect(result.redirect).toContain("vivapayments");
    const [paid, request] = db.orders;
    expect(Number(paid.totalGross)).toBe(shown!.split!.now.totalGross);
    expect(Number(paid.shippingGross)).toBe(shown!.split!.now.shippingGross);
    expect(Number(paid.vatAmount)).toBeCloseTo(shown!.split!.now.vatAmount, 2);
    expect(outside.createPaymentOrder).toHaveBeenCalledWith(
      expect.objectContaining({ orderNumber: paid.orderNumber, amountGross: shown!.split!.now.totalGross }),
    );
    expect(request).toMatchObject({ parentOrderNumber: paid.orderNumber, requestStatus: "REQUESTED", shippingNet: 0 });
    expect(Number(request.subtotalGross)).toBeCloseTo(shown!.split!.request.subtotalGross, 2);
  });

  it("together: no payment at all, one request with the whole cart", async () => {
    cartState.lines = [inStock, missing];
    const result = await submit(form({ requestMode: "together", paymentMethod: "" }));
    expect(outside.createPaymentOrder).not.toHaveBeenCalled();
    expect(db.orders).toHaveLength(1);
    expect(result.redirect).toMatch(/^\/aitima\//);
  });

  it("no request: the ordinary order is charged its whole cart, as before", async () => {
    cartState.lines = [line("a", 100), line("c", 60)];
    await submit(form());
    expect(db.orders).toHaveLength(1);
    expect(db.orders[0]).toMatchObject({ requestStatus: null, totalGross: 198.4, shippingNet: 0 });
  });
});

describe("split checkout — the words exist in every language", () => {
  const load = (l: string) => JSON.parse(readFileSync(`src/messages/${l}.json`, "utf8"));
  const messages = { el: load("el"), en: load("en"), it: load("it") };
  const keys: Array<[string, string[]]> = [
    ["checkout.CheckoutForm", ["split_now", "split_now_free", "split_now_pickup", "split_request", "together_line", "split_threshold_lost", "pay_now_button", "order_now_button", "items_one", "items_other"]],
    ["checkout.SplitCheckout", ["group_now", "group_request", "group_together", "payable_now", "on_request", "nothing_now", "threshold_lost", "request_shipping_offer", "together_shipping_offer"]],
    ["epibebaiosi.page", ["split_title", "split_now_line", "split_request_line", "split_request_note"]],
    ["aitima.page", ["parent_note_amount", "parent_note_paid", "second_shipment"]],
    ["paraggelies.page", ["split_with_request", "split_with_paid", "status_request"]],
  ];
  const at = (tree: Record<string, unknown>, ns: string) =>
    ns.split(".").reduce<Record<string, unknown>>((n, p) => n[p] as Record<string, unknown>, tree);
  const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  it.each(keys)("%s: el/en/it carry the same keys and placeholders", (ns, list) => {
    for (const key of list) {
      const el = at(messages.el, ns)[key] as string;
      expect(el, `${ns}.${key} (el)`).toBeTruthy();
      for (const l of ["en", "it"] as const) {
        const other = at(messages[l], ns)[key] as string;
        expect(other, `${ns}.${key} (${l})`).toBeTruthy();
        expect(placeholders(other), `${ns}.${key} (${l})`).toEqual(placeholders(el));
      }
    }
  });

  it("the Greek option cards say what the brief asks for", () => {
    const form = messages.el.checkout.CheckoutForm;
    expect(form.split_now).toContain("Πληρώνετε τώρα {total}");
    expect(form.split_request).toContain("ενδεικτική αξία {value}");
    expect(form.split_request).toContain("εντός 24 ωρών");
    expect(form.together_line).toMatch(/^Δεν πληρώνετε τώρα/);
    expect(form.together_line).toContain("μία αποστολή");
  });
});
