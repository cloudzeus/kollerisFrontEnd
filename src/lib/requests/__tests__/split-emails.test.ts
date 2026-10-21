import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * A split cart in the emails, in both directions: the paid order's receipt
 * names the request that holds the rest of the basket (and its private link,
 * so tracking goes off), and the request's emails name the paid order with
 * its amount and postage. Real templates, fake database, fake Mailgun.
 */

vi.mock("@/lib/prisma", async () => (await import("./request-fakes")).mockModules.prisma());
const { sendMail } = vi.hoisted(() => ({
  sendMail: vi.fn(async (mail: { to: string }) => {
    void mail;
    return { ok: true as const, id: "mg-1" };
  }),
}));
vi.mock("@/lib/mail/client", () => ({ sendMail, mailConfigured: () => true }));

import { TOKEN, db, resetFakes, seedRequest } from "./request-fakes";
import { buildOrderEmail } from "@/lib/mail/order-email";
import { sendInternalOrderEmail } from "@/lib/mail/order-internal-email";
import { sendInternalRequestEmail, sendRequestEmail } from "@/lib/mail/request-emails";

type SentMail = { to: string; subject: string; html: string; text: string; tracking?: boolean };
const lastMail = () => sendMail.mock.calls.at(-1)?.[0] as SentMail;

const PAID = "KOL-20261013-0001";
const REQUEST = "KOL-20261013-0002";
const GUEST = "g".repeat(32);

function seedPaid(over: Record<string, unknown> = {}) {
  const order = {
    id: "p1",
    orderNumber: PAID,
    guestToken: GUEST,
    status: "CONFIRMED",
    paymentStatus: "PAID",
    paymentMethod: "card",
    shippingMethod: "courier",
    email: "buyer@example.test",
    phone: "6900000000",
    firstName: "Μαρία",
    lastName: "Παπαδοπούλου",
    shipLine1: "Κ. Μαυρομιχάλη 4",
    shipLine2: null,
    shipCity: "Πειραιάς",
    shipPostcode: "18545",
    shipCountry: null,
    wantsInvoice: false,
    notes: null,
    subtotalNet: 100,
    subtotalGross: 124,
    shippingNet: 5,
    shippingGross: 6.2,
    paymentFeeNet: 0,
    vatAmount: 25.2,
    totalGross: 130.2,
    shippingQuote: null,
    reservedUntil: null,
    vivaOrderCode: null,
    createdAt: new Date("2026-10-13T08:00:00Z"),
    requestStatus: null,
    requestToken: null,
    parentOrderNumber: null,
    offerVersion: null,
    offerExpiresAt: null,
    offerRemindedAt: null,
    ...over,
  };
  db.orders.push(order as never);
  db.lines.push({
    id: "pl1",
    orderId: "p1",
    sku: "KN-0",
    name: "Κατσαβίδι",
    brand: "KNIPEX",
    imageUrl: null,
    quantity: 1,
    unitNet: 100,
    discountPercent: 0,
    offerTitle: null,
    vatRate: 24,
    lineNet: 100,
    lineGross: 124,
  });
  return order;
}

beforeEach(() => {
  resetFakes();
  sendMail.mockClear();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://kolleris.com");
});

describe("paid receipt → the request with the rest of the basket", () => {
  it("lists the requested items, their indicative value, the request number and its private link — tracking off", async () => {
    seedPaid();
    seedRequest({ parentOrderNumber: PAID, createdAt: new Date("2026-10-13T08:00:00Z") });
    const mail = await buildOrderEmail(PAID);
    expect(mail).not.toBeNull();
    expect(mail!.html).toContain("Τα υπολοιπα ειδη του καλαθιου σας");
    expect(mail!.html).toContain(REQUEST);
    expect(mail!.html).toContain("Πένσα");
    // 2×10 + 1×20 net at 24% = 49,60 € indicative.
    expect(mail!.html).toContain("49,60 €");
    expect(mail!.html).toContain(`/aitima/${TOKEN}`);
    expect(mail!.html).toContain("δεύτερη αποστολή");
    expect(mail!.text).toContain(`/aitima/${TOKEN}`);
    expect(mail!.tracking).toBe(false);
    // The amount charged is the paid half only.
    expect(mail!.html).toContain("130,20 €");
  });

  it("the shop's copy names both numbers and links the request in the admin, never its secret page", async () => {
    seedPaid();
    seedRequest({ parentOrderNumber: PAID, createdAt: new Date("2026-10-13T08:00:00Z") });
    await sendInternalOrderEmail(PAID);
    const mail = lastMail();
    expect(mail.subject).toContain(PAID);
    expect(mail.subject).toContain(`αίτημα ${REQUEST}`);
    expect(mail.html).toContain(`/admin/orders/${REQUEST}`);
    expect(mail.html).not.toContain(TOKEN);
    expect(mail.text).toContain(REQUEST);
  });

  it("an ordinary order's receipt is unchanged: no split section, tracking as before", async () => {
    seedPaid();
    const mail = await buildOrderEmail(PAID);
    expect(mail!.html).not.toContain("Τα υπολοιπα ειδη");
    expect(mail!.html).not.toContain("Δευτερη αποστολη");
    expect(mail!.tracking).toBeUndefined();
  });
});

describe("request emails → the paid order", () => {
  it("«received» at checkout: the paid order's number, amount and postage, still to pay; separate shipment", async () => {
    seedPaid({ paymentStatus: "PENDING", status: "PENDING_PAYMENT" });
    seedRequest({ parentOrderNumber: PAID });
    await sendRequestEmail("received", REQUEST);
    const mail = lastMail();
    expect(mail.tracking).toBe(false);
    expect(mail.html).toContain(`Τα διαθέσιμα είδη του καλαθιού σας είναι η παραγγελία ${PAID}: 130,20 €`);
    expect(mail.html).toContain("μεταφορικά 6,20 €");
    expect(mail.html).toContain("που πληρώνετε τώρα");
    expect(mail.html).toContain("δεύτερη αποστολή");
    expect(mail.html).toContain("Μεταφορικα 2ης αποστολης");
    expect(mail.text).toContain(PAID);
  });

  it("«received» after the payment says it was paid", async () => {
    seedPaid();
    seedRequest({ parentOrderNumber: PAID });
    await sendRequestEmail("received", REQUEST);
    expect(lastMail().html).toContain(`πληρώθηκαν στην παραγγελία ${PAID}: 130,20 €`);
  });

  it("«offer» for a split request: the second shipment, its shipping shown on its own", async () => {
    seedPaid();
    seedRequest({
      parentOrderNumber: PAID,
      requestStatus: "OFFERED",
      offerVersion: 1,
      offerExpiresAt: new Date("2026-10-16T10:00:00Z"),
      offerJson: {
        decision: "offer",
        version: 1,
        receivedAt: "2026-10-13T10:00:00.000Z",
        lines: [{ kind: "original", replacesLineId: null, mtrl: 101, sku: "KN-1", name: "Πένσα", qty: 2, unitNet: 10, vatRate: 24, leadTimeText: null }],
        removedLineIds: ["L2"],
        leadTimeText: null,
        note: null,
        shippingNet: 4,
        quotedShippingNet: null,
        expiresAt: "2026-10-16T10:00:00.000Z",
      },
    });
    await sendRequestEmail("offer", REQUEST);
    const mail = lastMail();
    expect(mail.html).toContain("δεύτερη αποστολή");
    expect(mail.html).toContain(PAID);
    expect(mail.html).toContain("Μεταφορικα 2ης αποστολης");
    expect(mail.html).toContain("4,96 €");
  });

  it("a request on its own keeps its old words", async () => {
    seedRequest();
    await sendRequestEmail("received", REQUEST);
    const mail = lastMail();
    expect(mail.html).not.toContain("δεύτερη αποστολή");
    expect(mail.html).not.toContain("2ης αποστολης");
  });

  it("the shop's request email names the paid half with its amount", async () => {
    seedPaid({ paymentStatus: "PENDING" });
    seedRequest({ parentOrderNumber: PAID });
    await sendInternalRequestEmail(REQUEST);
    const mail = lastMail();
    expect(mail.subject).toContain(PAID);
    expect(mail.html).toContain(`η παραγγελία ${PAID} (130,20 €`);
    expect(mail.html).toContain("εκκρεμεί πληρωμή");
  });
});

describe("an accepted request, paid: its receipt says it is the second shipment", () => {
  it("links the first order", async () => {
    seedPaid();
    seedRequest({ parentOrderNumber: PAID, requestStatus: "ACCEPTED", paymentStatus: "PAID", status: "CONFIRMED", guestToken: "h".repeat(32), createdAt: new Date("2026-10-13T08:00:00Z"), subtotalNet: 40, shippingNet: 4, paymentFeeNet: 0, vatAmount: 10.56, notes: null, shippingQuote: null, wantsInvoice: false, shipLine1: "Οδός 1", shipCity: "Πειραιάς" });
    for (const l of db.lines.filter((x) => x.orderId === "r1")) {
      Object.assign(l, { name: "Πένσα", unitNet: 10, discountPercent: 0, vatRate: 24, lineNet: 10, lineGross: 12.4, brand: null, imageUrl: null, offerTitle: null });
    }
    const mail = await buildOrderEmail(REQUEST);
    expect(mail!.html).toContain("Δευτερη αποστολη");
    expect(mail!.html).toContain(PAID);
    // Handlebars escapes «=» in the href; the plain text carries the link as is.
    expect(mail!.html).toContain(`/checkout/epibebaiosi/${PAID}`);
    expect(mail!.text).toContain(`/checkout/epibebaiosi/${PAID}?t=${GUEST}`);
    expect(mail!.tracking).toBe(false);
  });
});
