import { describe, expect, it } from "vitest";
import {
  compareOffer,
  isOnRequest,
  isWellFormedToken,
  offerWebhookSchema,
  planCheckout,
  priceLines,
  requestBlocksErp,
  requestBlocksPayment,
  requestPath,
  splitCart,
  unknownLineRefs,
  type OfferMessage,
  type RequestLine,
} from "@/lib/requests/model";

const line = (over: Partial<{ id: string; inStock: boolean; availableQty: number; quantity: number }> = {}) => ({
  id: "x",
  inStock: true,
  availableQty: 5,
  quantity: 1,
  ...over,
});

describe("classification — which cart lines are «Κατόπιν παραγγελίας»", () => {
  it("a product with no stock is on request", () => {
    expect(isOnRequest(line({ inStock: false, availableQty: 0 }))).toBe(true);
  });

  it("a line asking for more than the stock (overStock) is on request, whole", () => {
    expect(isOnRequest(line({ availableQty: 3, quantity: 4 }))).toBe(true);
  });

  it("a line within stock is not, including exactly the stock", () => {
    expect(isOnRequest(line({ availableQty: 3, quantity: 3 }))).toBe(false);
  });

  it("inStock with a zero quantity is treated as no stock", () => {
    expect(isOnRequest(line({ inStock: true, availableQty: 0 }))).toBe(true);
  });

  it("splits a mixed cart and names the three cases", () => {
    const ready = line({ id: "a" });
    const none = line({ id: "b", inStock: false, availableQty: 0 });
    const over = line({ id: "c", availableQty: 1, quantity: 2 });
    expect(splitCart([ready]).kind).toBe("none");
    expect(splitCart([none, over]).kind).toBe("all");
    const mixed = splitCart([ready, none, over]);
    expect(mixed.kind).toBe("mixed");
    expect(mixed.ready.map((l) => l.id)).toEqual(["a"]);
    expect(mixed.onRequest.map((l) => l.id)).toEqual(["b", "c"]);
  });
});

describe("planCheckout — split vs together, decided from server stock", () => {
  const ready = line({ id: "a" });
  const missing = line({ id: "b", inStock: false, availableQty: 0 });

  it("an all-in-stock cart pays everything, whatever mode was posted", () => {
    expect(planCheckout([ready], "together")).toEqual({ ok: true, pay: [ready], request: [] });
  });

  it("an all-on-request cart requests everything, whatever mode was posted", () => {
    expect(planCheckout([missing], "split")).toEqual({ ok: true, pay: [], request: [missing] });
  });

  it("mixed + split: in-stock lines are paid, the rest requested", () => {
    expect(planCheckout([ready, missing], "split")).toEqual({ ok: true, pay: [ready], request: [missing] });
  });

  it("mixed + together: one request with everything", () => {
    expect(planCheckout([ready, missing], "together")).toEqual({ ok: true, pay: [], request: [ready, missing] });
  });

  it("mixed without a choice is refused", () => {
    expect(planCheckout([ready, missing], null)).toEqual({ ok: false, reason: "mode_required" });
  });
});

describe("guards", () => {
  it("only an ACCEPTED request (or no request) may be paid", () => {
    expect(requestBlocksPayment(null)).toBe(false);
    expect(requestBlocksPayment(undefined)).toBe(false);
    expect(requestBlocksPayment("ACCEPTED")).toBe(false);
    for (const s of ["REQUESTED", "OFFERED", "DECLINED", "EXPIRED", "REJECTED"]) {
      expect(requestBlocksPayment(s)).toBe(true);
    }
  });

  it("a request reaches the ERP only ACCEPTED and PAID", () => {
    expect(requestBlocksErp({ requestStatus: null, paymentStatus: "PAID" })).toBe(false);
    expect(requestBlocksErp({ requestStatus: "ACCEPTED", paymentStatus: "PAID" })).toBe(false);
    expect(requestBlocksErp({ requestStatus: "ACCEPTED", paymentStatus: "PENDING" })).toBe(true);
    expect(requestBlocksErp({ requestStatus: "OFFERED", paymentStatus: "PAID" })).toBe(true);
    expect(requestBlocksErp({ requestStatus: "REQUESTED", paymentStatus: "PENDING" })).toBe(true);
  });
});

const requested: RequestLine[] = [
  { lineId: "L1", productId: "p1", mtrl: 101, sku: "A", name: "Πένσα", brand: null, imageUrl: null, qty: 2, unitNet: 10, vatRate: 24, stockAtRequest: 0 },
  { lineId: "L2", productId: "p2", mtrl: 102, sku: "B", name: "Κόφτης", brand: null, imageUrl: null, qty: 1, unitNet: 20, vatRate: 24, stockAtRequest: 0 },
  { lineId: "L3", productId: "p3", mtrl: 103, sku: "C", name: "Κατσαβίδι", brand: null, imageUrl: null, qty: 1, unitNet: 5, vatRate: 24, stockAtRequest: 0 },
];

const offerLine = (over: Partial<OfferMessage["lines"][number]>) => ({
  kind: "original" as const,
  replacesLineId: null,
  mtrl: 101,
  sku: "A",
  name: "Πένσα",
  qty: 2,
  unitNet: 10,
  vatRate: 24,
  leadTimeText: null,
  ...over,
});

describe("compareOffer — requested vs offered", () => {
  it("marks unchanged, modified (qty/price), alternatives and removed lines", () => {
    const rows = compareOffer(requested, [
      offerLine({ replacesLineId: "L1" }),
      offerLine({ kind: "modified", replacesLineId: "L2", mtrl: 102, sku: "B", name: "Κόφτης", qty: 3, unitNet: 18 }),
      offerLine({ kind: "alternative", replacesLineId: "L3", mtrl: 999, sku: "Z", name: "Κατσαβίδι Pro", qty: 1, unitNet: 7 }),
    ]);
    expect(rows.map((r) => r.kind)).toEqual(["same", "modified", "alternative"]);
    const modified = rows[1] as Extract<(typeof rows)[number], { qtyChanged: boolean }>;
    expect(modified.qtyChanged).toBe(true);
    expect(modified.priceChanged).toBe(true);
    const alternative = rows[2] as Extract<(typeof rows)[number], { kind: "alternative" }>;
    expect(alternative.requested?.name).toBe("Κατσαβίδι");
  });

  it("a requested line the offer does not mention is shown removed", () => {
    const rows = compareOffer(requested, [offerLine({})]);
    expect(rows.map((r) => r.kind)).toEqual(["same", "removed", "removed"]);
  });

  it("an `original` without a reference is matched by MTRL", () => {
    const rows = compareOffer(requested, [offerLine({ mtrl: 102, sku: "B", name: "Κόφτης", qty: 1, unitNet: 20 })]);
    expect(rows[1]).toMatchObject({ kind: "same" });
  });
});

describe("priceLines — the cart's arithmetic", () => {
  it("VAT per line, shipping at 24%, VAT as the difference", () => {
    const t = priceLines([{ qty: 2, unitNet: 10, vatRate: 24 }, { qty: 1, unitNet: 10, vatRate: 13 }], 5);
    expect(t.subtotalNet).toBe(30);
    expect(t.subtotalGross).toBe(24.8 + 11.3);
    expect(t.shippingGross).toBe(6.2);
    expect(t.totalGross).toBe(42.3);
    expect(t.vatAmount).toBe(7.3);
  });
});

describe("offerWebhookSchema — contract §4", () => {
  const offer = {
    orderNumber: "KOL-20261013-0002",
    offerVersion: 1,
    decision: "offer",
    lines: [{ kind: "original", replacesLineId: "L1", mtrl: 101, sku: "A", name: "Πένσα", qty: 2, unitNet: 10, vatRate: 24 }],
    removedLineIds: ["L2"],
    expiresAt: "2026-10-16T10:00:00.000Z",
  };

  it("accepts a well-formed offer and a rejection", () => {
    expect(offerWebhookSchema.safeParse(offer).success).toBe(true);
    expect(
      offerWebhookSchema.safeParse({ orderNumber: "KOL-1", offerVersion: 2, decision: "reject", reason: "Εκτός παραγωγής" })
        .success,
    ).toBe(true);
  });

  it("defaults the optional parts", () => {
    const parsed = offerWebhookSchema.parse({ ...offer, removedLineIds: undefined, expiresAt: undefined });
    expect(parsed).toMatchObject({ removedLineIds: [], expiresAt: null, shippingNet: null, note: null });
  });

  it.each([
    ["no lines", { ...offer, lines: [] }],
    ["negative price", { ...offer, lines: [{ ...offer.lines[0], unitNet: -1 }] }],
    ["zero quantity", { ...offer, lines: [{ ...offer.lines[0], qty: 0 }] }],
    ["fractional version", { ...offer, offerVersion: 1.5 }],
    ["unknown decision", { ...offer, decision: "maybe" }],
    ["unknown kind", { ...offer, lines: [{ ...offer.lines[0], kind: "other" }] }],
    ["bad expiry", { ...offer, expiresAt: "tomorrow" }],
    ["price as a string", { ...offer, lines: [{ ...offer.lines[0], unitNet: "10" }] }],
  ])("refuses %s", (_label, body) => {
    expect(offerWebhookSchema.safeParse(body).success).toBe(false);
  });

  it("finds line references that are not in the request", () => {
    const parsed = offerWebhookSchema.parse({ ...offer, removedLineIds: ["L9"] }) as OfferMessage;
    expect(unknownLineRefs(parsed, requested)).toEqual(["L9"]);
  });
});

describe("tokens and links", () => {
  it("accepts only base64url of 32–64 characters", () => {
    expect(isWellFormedToken("a".repeat(43))).toBe(true);
    expect(isWellFormedToken("a".repeat(31))).toBe(false);
    expect(isWellFormedToken("a".repeat(65))).toBe(false);
    expect(isWellFormedToken("../../etc/passwd" + "a".repeat(30))).toBe(false);
    expect(isWellFormedToken(undefined)).toBe(false);
  });

  it("builds the link with the shop's locale prefix", () => {
    expect(requestPath("el", "TOKEN")).toBe("/aitima/TOKEN");
    expect(requestPath("en", "TOKEN")).toBe("/en/aitima/TOKEN");
  });
});
