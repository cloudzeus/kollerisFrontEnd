import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", async () => (await import("./request-fakes")).mockModules.prisma());
vi.mock("@/lib/mail/request-emails", async () => (await import("./request-fakes")).mockModules.mail());
vi.mock("@/lib/orders/send-to-erp", async () => (await import("./request-fakes")).mockModules.erp());
vi.mock("@/lib/payment/viva", async () => (await import("./request-fakes")).mockModules.viva());
vi.mock("@/lib/requests/shipping", async () => (await import("./request-fakes")).mockModules.shipping());

import { TOKEN, calls, db, outside, resetFakes, seedRequest } from "./request-fakes";
import { acceptRequest, applyOfferWebhook, declineRequest, newRequestToken } from "@/lib/requests/service";
import { sweepRequests } from "@/lib/requests/request-sweep";
import { offerWebhookSchema, type OfferWebhookBody } from "@/lib/requests/model";

const NOW = new Date("2026-10-13T10:00:00Z");

function offer(over: Record<string, unknown> = {}): OfferWebhookBody {
  return offerWebhookSchema.parse({
    orderNumber: "KOL-20261013-0002",
    offerVersion: 1,
    decision: "offer",
    lines: [
      { kind: "original", replacesLineId: "L1", mtrl: 101, sku: "KN-1", name: "Πένσα", qty: 2, unitNet: 10, vatRate: 24 },
      { kind: "modified", replacesLineId: "L2", mtrl: 102, sku: "KN-2", name: "Κόφτης", qty: 3, unitNet: 18, vatRate: 24, leadTimeText: "5–7 εργάσιμες" },
    ],
    removedLineIds: [],
    shippingNet: 4,
    note: "Ο κόφτης έρχεται σε συσκευασία των 3.",
    expiresAt: "2026-10-16T10:00:00.000Z",
    ...over,
  });
}

beforeEach(() => {
  resetFakes();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("HDCtool offer webhook — applyOfferWebhook", () => {
  it("stores the offer, sets OFFERED and emails the customer", async () => {
    const order = seedRequest();
    const result = await applyOfferWebhook(offer(), NOW);
    expect(result).toEqual({ status: 200, body: { ok: true, requestStatus: "OFFERED", offerVersion: 1, emailed: true } });
    expect(order).toMatchObject({ requestStatus: "OFFERED", offerVersion: 1, offerRemindedAt: null });
    expect(order.offerExpiresAt).toEqual(new Date("2026-10-16T10:00:00.000Z"));
    expect(order.offerJson).toMatchObject({ decision: "offer", version: 1, shippingNet: 4, quotedShippingNet: null });
    expect(calls).toEqual(["mail:offer:KOL-20261013-0002"]);
    expect(db.history.at(-1)?.actor).toBe("hdctool");
  });

  it("is idempotent per (orderNumber, offerVersion): a retry changes nothing and emails nobody", async () => {
    seedRequest();
    await applyOfferWebhook(offer(), NOW);
    calls.length = 0;
    const again = await applyOfferWebhook(offer({ note: "different" }), NOW);
    expect(again).toEqual({ status: 200, body: { ok: true, duplicate: true, offerVersion: 1 } });
    expect(calls).toEqual([]);
    expect((db.orders[0].offerJson as { note: string }).note).toBe("Ο κόφτης έρχεται σε συσκευασία των 3.");
  });

  it("ignores a stale offerVersion and keeps the newer offer", async () => {
    seedRequest();
    await applyOfferWebhook(offer({ offerVersion: 3 }), NOW);
    calls.length = 0;
    const stale = await applyOfferWebhook(offer({ offerVersion: 2 }), NOW);
    expect(stale.body).toMatchObject({ ok: true, ignored: "stale_offer_version", offerVersion: 3 });
    expect(db.orders[0].offerVersion).toBe(3);
    expect(calls).toEqual([]);
  });

  it("a newer version replaces the offer and re-arms the reminder", async () => {
    const order = seedRequest();
    await applyOfferWebhook(offer(), NOW);
    order.offerRemindedAt = new Date("2026-10-14T10:00:00Z");
    await applyOfferWebhook(offer({ offerVersion: 2, shippingNet: 0 }), NOW);
    expect(order.offerVersion).toBe(2);
    expect(order.offerRemindedAt).toBeNull();
  });

  it("a rejection sets REJECTED, keeps the reason and sends the rejection email", async () => {
    const order = seedRequest();
    const body = offerWebhookSchema.parse({ orderNumber: order.orderNumber, offerVersion: 1, decision: "reject", reason: "Εκτός παραγωγής" });
    const result = await applyOfferWebhook(body, NOW);
    expect(result.body).toMatchObject({ ok: true, requestStatus: "REJECTED" });
    expect(order.requestStatus).toBe("REJECTED");
    expect(order.offerJson).toMatchObject({ decision: "reject", reason: "Εκτός παραγωγής" });
    expect(calls).toEqual(["mail:rejected:KOL-20261013-0002"]);
  });

  it("quotes shipping once, on receipt, when HDCtool leaves it out", async () => {
    const order = seedRequest();
    await applyOfferWebhook(offer({ shippingNet: null }), NOW);
    expect(outside.quoteOfferShipping).toHaveBeenCalledTimes(1);
    expect(order.offerJson).toMatchObject({ shippingNet: null, quotedShippingNet: 5.5 });
  });

  it("refuses references to lines that were never requested (422)", async () => {
    seedRequest();
    const result = await applyOfferWebhook(offer({ removedLineIds: ["NOPE"] }), NOW);
    expect(result).toEqual({ status: 422, body: { ok: false, error: "unknown_line_ids", lineIds: ["NOPE"] } });
    expect(db.orders[0].requestStatus).toBe("REQUESTED");
  });

  it("404 for an unknown order, 409 for an ordinary order and for an accepted request", async () => {
    expect((await applyOfferWebhook(offer(), NOW)).status).toBe(404);
    seedRequest({ requestStatus: null, requestToken: null });
    expect((await applyOfferWebhook(offer(), NOW)).body).toEqual({ ok: false, error: "not_a_request" });
    db.orders[0].requestStatus = "ACCEPTED";
    expect((await applyOfferWebhook(offer(), NOW)).body).toEqual({ ok: false, error: "already_accepted" });
  });
});

describe("accept — totals from the STORED offer, never from the browser", () => {
  async function offered(over: Record<string, unknown> = {}) {
    const order = seedRequest();
    await applyOfferWebhook(offer(over), NOW);
    calls.length = 0;
    return order;
  }

  it("replaces the lines with the offer, recomputes the total, opens Viva for exactly that amount", async () => {
    const order = await offered();
    // Whatever the row said before is irrelevant: the offer decides.
    order.totalGross = 0.01;
    db.products.push({ id: "p1", mtrl: 101, mtrmark: 7, weight: 0.3, images: [{ url: "https://img/1.jpg" }] });

    const result = await acceptRequest(TOKEN, "1", NOW);

    // 2×10 + 3×18 = 74 net · 91.76 gross · shipping 4 net = 4.96 gross
    expect(result).toEqual({ ok: true, redirectUrl: "https://demo.vivapayments.com/web/checkout?ref=9000000000000001" });
    expect(order).toMatchObject({
      requestStatus: "ACCEPTED",
      subtotalNet: 74,
      subtotalGross: 91.76,
      shippingNet: 4,
      shippingGross: 4.96,
      totalGross: 96.72,
      vatAmount: 18.72,
      vivaOrderCode: "9000000000000001",
      paymentStatus: "PENDING",
    });
    const lines = db.lines.filter((l) => l.orderId === order.id);
    expect(lines.map((l) => [l.sku, l.quantity, l.unitNet])).toEqual([
      ["KN-1", 2, 10],
      ["KN-2", 3, 18],
    ]);
    expect(lines[0]).toMatchObject({ productId: "p1", brand: "KNIPEX", imageUrl: "https://img/1.jpg" });
    // The original request survives for history.
    expect((order.requestLines as { lines: unknown[] }).lines).toHaveLength(2);
    expect(calls).toEqual(["intake:ACCEPTED:KOL-20261013-0002", "viva:KOL-20261013-0002:96.72"]);
  });

  it("uses the shipping quoted on receipt when staff left it out", async () => {
    const order = await offered({ shippingNet: null });
    outside.quoteOfferShipping.mockClear();
    await acceptRequest(TOKEN, 1, NOW);
    expect(outside.quoteOfferShipping).not.toHaveBeenCalled();
    expect(order.shippingNet).toBe(5.5);
  });

  it("refuses an offer version the customer was not shown", async () => {
    const order = await offered();
    expect(await acceptRequest(TOKEN, "2", NOW)).toEqual({ ok: false, error: "stale_offer" });
    expect(order.requestStatus).toBe("OFFERED");
    expect(calls).toEqual([]);
  });

  it("refuses an expired offer and changes nothing", async () => {
    const order = await offered();
    const later = new Date("2026-10-16T10:00:01Z");
    expect(await acceptRequest(TOKEN, "1", later)).toEqual({ ok: false, error: "expired" });
    expect(order.requestStatus).toBe("OFFERED");
    expect(outside.createPaymentOrder).not.toHaveBeenCalled();
  });

  it("refuses declined, rejected, expired and still-REQUESTED requests", async () => {
    for (const status of ["DECLINED", "REJECTED", "EXPIRED", "REQUESTED"]) {
      resetFakes();
      seedRequest({ requestStatus: status, offerVersion: 1 });
      expect(await acceptRequest(TOKEN, "1", NOW)).toEqual({ ok: false, error: "not_offered" });
      expect(outside.createPaymentOrder).not.toHaveBeenCalled();
    }
  });

  it("a second click on an accepted request only opens Viva again, for the stored total", async () => {
    const order = await offered();
    await acceptRequest(TOKEN, "1", NOW);
    calls.length = 0;
    const again = await acceptRequest(TOKEN, "999", NOW);
    expect(again.ok).toBe(true);
    expect(calls).toEqual(["viva:KOL-20261013-0002:96.72"]);
    expect(db.history.filter((h) => h.note?.includes("αποδοχή"))).toHaveLength(1);
    expect(order.requestStatus).toBe("ACCEPTED");
  });

  it("a paid request cannot be accepted again", async () => {
    await offered();
    db.orders[0].paymentStatus = "PAID";
    expect(await acceptRequest(TOKEN, "1", NOW)).toEqual({ ok: false, error: "already_paid" });
  });

  it("stays ACCEPTED when Viva is down, so the customer can retry", async () => {
    const order = await offered();
    outside.createPaymentOrder.mockRejectedValueOnce(new Error("viva 503"));
    expect(await acceptRequest(TOKEN, "1", NOW)).toEqual({ ok: false, error: "payment_failed" });
    expect(order.requestStatus).toBe("ACCEPTED");
  });
});

describe("decline", () => {
  it("sets DECLINED and tells HDCtool", async () => {
    const order = seedRequest();
    await applyOfferWebhook(offer(), NOW);
    calls.length = 0;
    expect(await declineRequest(TOKEN, "1", NOW)).toEqual({ ok: true });
    expect(order.requestStatus).toBe("DECLINED");
    expect(order.requestDecisionAt).toEqual(NOW);
    expect(calls).toEqual(["intake:DECLINED:KOL-20261013-0002"]);
    // Twice is harmless.
    expect(await declineRequest(TOKEN, "1", NOW)).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
  });

  it("cannot decline what has expired", async () => {
    seedRequest();
    await applyOfferWebhook(offer(), NOW);
    expect(await declineRequest(TOKEN, "1", new Date("2026-10-17T00:00:00Z"))).toEqual({ ok: false, error: "expired" });
  });
});

describe("token security", () => {
  it("issues 43-character base64url tokens with no repeats", () => {
    const tokens = new Set(Array.from({ length: 500 }, () => newRequestToken()));
    expect(tokens.size).toBe(500);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("a malformed token is refused before the database is asked", async () => {
    seedRequest();
    const { prismaFake } = await import("./request-fakes");
    prismaFake.order.findUnique.mockClear();
    expect(await acceptRequest("short", "1", NOW)).toEqual({ ok: false, error: "not_found" });
    expect(await declineRequest({ toString: () => TOKEN }, "1", NOW)).toEqual({ ok: false, error: "not_found" });
    expect(prismaFake.order.findUnique).not.toHaveBeenCalled();
  });

  it("a well-formed but wrong token finds nothing", async () => {
    seedRequest();
    expect(await acceptRequest("B".repeat(43), "1", NOW)).toEqual({ ok: false, error: "not_found" });
  });
});

describe("request sweep — one reminder after 24h, expiry at offerExpiresAt", () => {
  async function offeredAt(when: Date, over: Record<string, unknown> = {}) {
    const order = seedRequest();
    await applyOfferWebhook(offer(over), when);
    calls.length = 0;
    return order;
  }

  it("does not remind before 24 hours", async () => {
    await offeredAt(NOW);
    const result = await sweepRequests({ now: () => NOW.getTime() + 23 * 3_600_000 });
    expect(result).toMatchObject({ ok: true, reminded: [], expired: [] });
    expect(calls).toEqual([]);
  });

  it("reminds once after 24 hours, and only once", async () => {
    const order = await offeredAt(NOW);
    const at = NOW.getTime() + 25 * 3_600_000;
    expect(await sweepRequests({ now: () => at })).toMatchObject({ reminded: ["KOL-20261013-0002"] });
    expect(order.offerRemindedAt).toEqual(new Date(at));
    expect(await sweepRequests({ now: () => at + 3_600_000 })).toMatchObject({ reminded: [] });
    expect(calls).toEqual(["mail:reminder:KOL-20261013-0002"]);
  });

  it("expires an offer past its date: EXPIRED, email, intake — once", async () => {
    const order = await offeredAt(NOW);
    const at = new Date("2026-10-16T10:00:00Z").getTime() + 1;
    expect(await sweepRequests({ now: () => at })).toMatchObject({ expired: ["KOL-20261013-0002"], reminded: [] });
    expect(order.requestStatus).toBe("EXPIRED");
    expect(calls).toEqual(["mail:expired:KOL-20261013-0002", "intake:EXPIRED:KOL-20261013-0002"]);
    calls.length = 0;
    await sweepRequests({ now: () => at + 60_000 });
    expect(calls).toEqual([]);
  });

  it("leaves accepted, declined and paid requests alone", async () => {
    const order = await offeredAt(NOW);
    order.requestStatus = "ACCEPTED";
    await sweepRequests({ now: () => new Date("2026-10-20T00:00:00Z").getTime() });
    expect(order.requestStatus).toBe("ACCEPTED");
    expect(calls).toEqual([]);
  });

  it("skips when another replica holds the lock", async () => {
    db.locked = true;
    expect(await sweepRequests({ now: () => NOW.getTime() })).toEqual({ ok: false, skipped: "already_running" });
  });
});
