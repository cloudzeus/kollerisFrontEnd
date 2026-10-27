import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", async () => (await import("../requests/__tests__/request-fakes")).mockModules.prisma());
const { sendMail } = vi.hoisted(() => ({
  sendMail: vi.fn(async (mail: { to: string }) => {
    void mail;
    return { ok: true as const, id: "mg-1" };
  }),
}));
vi.mock("@/lib/mail/client", () => ({ sendMail, mailConfigured: () => true }));

import { db, resetFakes, seedRequest } from "../requests/__tests__/request-fakes";
import { buildOrderEmail } from "@/lib/mail/order-email";
import { sendInternalOrderEmail } from "@/lib/mail/order-internal-email";
import { sendOrderStatusEmail } from "@/lib/mail/order-status-email";
import { sendShippedEmail } from "@/lib/mail/order-shipped-email";
import { sendDeliveredEmail } from "@/lib/mail/order-delivered-email";
import { sendPaymentFailedEmail } from "@/lib/mail/payment-failed-email";
import { sendPostageCorrectionEmail } from "@/lib/mail/postage-correction-email";
import { sendReviewRequestEmail } from "@/lib/mail/review-request-email";
import { sendRequestEmail } from "@/lib/mail/request-emails";
import { emailLocale, isForeignDestination } from "@/lib/mail/email-locale";
import { renderTemplate } from "@/lib/mail/templates";

/*
 * R-EMAIL-EN with R-EMAIL-CY: every customer email of an order shipped abroad
 * except Cyprus is in English, whatever the site it was placed from; Greece and
 * Cyprus keep the shop's language; the shop's own notification stays Greek; an
 * explicit locale wins.
 */

const GREEK = /[Ά-ώ]/;
const NUMBER = "KOL-20261027-0001";
const REQUEST = "KOL-20261027-0002";

type Sent = { to: string; subject: string; html: string; text: string };
const lastMail = () => sendMail.mock.calls.at(-1)![0] as unknown as Sent;

/** The text a reader sees: no tags, no comments, no style. */
function visibleText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]*>/g, " ");
}

beforeEach(() => {
  resetFakes();
  sendMail.mockClear();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://kolleris.com");
});

function seed(shipCountry: string | null, over: Record<string, unknown> = {}) {
  const dhl = shipCountry !== null && shipCountry !== "GR" && shipCountry !== "CY";
  db.orders.push({
    id: "o1",
    orderNumber: NUMBER,
    guestToken: "g".repeat(32),
    customerId: "c1",
    status: "CONFIRMED",
    paymentStatus: "PAID",
    paymentMethod: "card",
    shippingMethod: dhl ? "dhl" : "courier",
    email: "buyer@example.test",
    phone: "+49301234567",
    firstName: "Hans",
    lastName: "Muster",
    shipLine1: "Main Street 1",
    shipLine2: null,
    shipCity: "Berlin",
    shipPostcode: "10117",
    shipCountry,
    billCountry: shipCountry ?? "GR",
    wantsInvoice: false,
    companyName: null,
    vatNumber: null,
    taxOffice: null,
    customerType: dhl ? "individual" : null,
    vatMode: "standard",
    viesConsultationNumber: null,
    notes: null,
    subtotalNet: 100,
    subtotalGross: 124,
    shippingNet: 10,
    shippingGross: 12.4,
    paymentFeeNet: 0,
    vatAmount: 26.4,
    totalGross: 136.4,
    shippingQuote: dhl ? { carrier: "DHL", productCode: "U", netAmount: 10, quotedAt: "2026-10-27T10:00:00.000Z", etaDays: "2-3" } : null,
    reservedUntil: null,
    vivaOrderCode: "VIVA123",
    acsVoucherNo: null,
    deliveredAt: null,
    createdAt: new Date("2026-10-27T08:00:00Z"),
    requestStatus: null,
    requestToken: null,
    parentOrderNumber: null,
    ...over,
  } as never);
  db.lines.push({
    id: "l1",
    orderId: "o1",
    productId: "p1",
    sku: "KN-0",
    name: "Pliers",
    brand: "KNIPEX",
    imageUrl: null,
    quantity: 1,
    unitNet: 100,
    discountPercent: 0,
    offerTitle: null,
    vatRate: 24,
    lineNet: 100,
    lineGross: 124,
    weightKg: 0.5,
  } as never);
}

describe("emailLocale", () => {
  it("English abroad except Cyprus; Greek for Greece, Cyprus and no country", () => {
    expect(emailLocale({ shipCountry: "DE" })).toBe("en");
    expect(emailLocale({ shipCountry: "it" })).toBe("en");
    expect(emailLocale({ shipCountry: "GR" })).toBe("el");
    expect(emailLocale({ shipCountry: "CY" })).toBe("el");
    expect(emailLocale({ shipCountry: null })).toBe("el");
    expect(emailLocale({})).toBe("el");
    expect(isForeignDestination(" cy ")).toBe(false);
  });

  it("an explicit locale wins, both ways", () => {
    expect(emailLocale({ shipCountry: "DE" }, "el")).toBe("el");
    expect(emailLocale({ shipCountry: "GR" }, "en")).toBe("en");
  });
});

describe("the customer templates have English twins", () => {
  const IDS = [
    "order-confirmation",
    "payment-pending-bank",
    "payment-failed",
    "order-status",
    "order-shipped",
    "order-delivered",
    "order-price-correction",
    "review-request",
    "order-request",
  ];
  const dir = path.join(process.cwd(), "src", "emails", "templates");

  it.each(IDS)("%s.en.html: no Greek left, same Handlebars expressions as the Greek one", async (id) => {
    const en = await readFile(path.join(dir, `${id}.en.html`), "utf8");
    const el = await readFile(path.join(dir, `${id}.html`), "utf8");
    expect(visibleText(en)).not.toMatch(GREEK);
    // Not a single variable or block lost in translation.
    const expressions = (s: string) => s.match(/\{\{[^}]*\}\}/g) ?? [];
    expect(expressions(en)).toEqual(expressions(el));
    expect(en).toContain('<html lang="en"');
  });

  it("the template listing offers the Greek ids only", async () => {
    const files = await readdir(dir);
    expect(files.filter((f) => f.endsWith(".en.html")).length).toBe(IDS.length);
    const { listTemplateIds } = await import("@/lib/mail/templates");
    expect((await listTemplateIds()).some((id) => id.endsWith(".en"))).toBe(false);
  });

  it("a template without an English twin falls back to Greek rather than failing", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = await renderTemplate("account-welcome", { recipient: { first_name: "A" } }, { locale: "en" });
    expect(html).toContain('lang="el"');
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe("a DE order placed from the Greek site: every customer email is English", () => {
  it("confirmation (paid and awaiting), with /en links and the exempt note in English", async () => {
    seed("DE");
    const mail = (await buildOrderEmail(NUMBER))!;
    expect(mail.subject).toBe(`Your order ${NUMBER} is confirmed`);
    expect(mail.html).toContain('lang="en"');
    expect(visibleText(mail.html)).not.toMatch(GREEK);
    expect(mail.text).not.toMatch(GREEK);
    expect(mail.html).toMatch(/\/en\/checkout\/epibebaiosi\//);
    expect(mail.html).toContain("Germany");
    expect(mail.html).toContain("€136.40");

    db.orders[0].paymentStatus = "PENDING";
    db.orders[0].status = "PENDING_PAYMENT";
    const pending = (await buildOrderEmail(NUMBER))!;
    expect(pending.subject).toBe(`Order ${NUMBER} — received`);
    expect(visibleText(pending.html)).not.toMatch(GREEK);
  });

  it("the exempt note is the English sentence", async () => {
    seed("DE", { vatMode: "intra_eu_exempt", customerType: "company", wantsInvoice: true, companyName: "Muster GmbH", vatNumber: "DE123456789", viesConsultationNumber: "WAPI1", vatAmount: 0, subtotalGross: 100, shippingGross: 10, totalGross: 110 });
    const mail = (await buildOrderEmail(NUMBER))!;
    expect(mail.html).toContain("Intra-community supply — VAT exempt (reverse charge, Article 138 of Directive 2006/112/EC)");
    expect(visibleText(mail.html)).not.toMatch(GREEK);
    expect(mail.text).not.toMatch(GREEK);
  });

  it("payment failed, status, shipped (DHL), delivered, postage correction, review request", async () => {
    seed("DE", { acsVoucherNo: "1234567890", shippingQuote: { carrier: "DHL", productCode: "U", etaDays: "2-3", shipment: { carrier: "DHL", awb: "1234567890", trackingUrl: "https://www.dhl.com/gr-el/home/tracking.html?tracking-id=1234567890", at: "2026-10-28T08:00:00.000Z" } } });
    const sends: Array<[string, () => Promise<unknown>]> = [
      ["payment failed", () => sendPaymentFailedEmail(NUMBER, { statusId: "10" })],
      ["status", () => sendOrderStatusEmail(NUMBER, "Σε επεξεργασία")],
      ["shipped", () => sendShippedEmail(NUMBER, "1234567890")],
      ["delivered", () => sendDeliveredEmail(NUMBER)],
      ["postage correction", () => sendPostageCorrectionEmail(NUMBER, { previousShippingGross: 20, previousTotalGross: 144 })],
      ["review request", () => sendReviewRequestEmail(NUMBER)],
    ];
    for (const [name, send] of sends) {
      sendMail.mockClear();
      await send();
      expect(sendMail, name).toHaveBeenCalledTimes(1);
      const mail = lastMail();
      expect(mail.subject, `${name}: subject`).not.toMatch(GREEK);
      expect(mail.text, `${name}: text`).not.toMatch(GREEK);
      expect(visibleText(mail.html), `${name}: html`).not.toMatch(GREEK);
      expect(mail.html, name).toContain('lang="en"');
    }
  });

  it("a back-order request is English too (received, rejected, expired)", async () => {
    seedRequest({ orderNumber: REQUEST, shipCountry: "DE", shipPostcode: "10117", requestLines: { v: 1, locale: "el", lines: [{ lineId: "L1", productId: "p1", mtrl: 101, sku: "KN-1", name: "Pliers", brand: "KNIPEX", imageUrl: null, qty: 2, unitNet: 10, vatRate: 24, stockAtRequest: 0 }] } as never, firstName: "Hans", lastName: "Muster" });
    for (const kind of ["received", "rejected", "expired"] as const) {
      sendMail.mockClear();
      const outcome = await sendRequestEmail(kind, REQUEST);
      expect(outcome, kind).toMatchObject({ ok: true });
      const mail = lastMail();
      expect(mail.subject, kind).not.toMatch(GREEK);
      expect(mail.text, kind).not.toMatch(GREEK);
      expect(visibleText(mail.html), kind).not.toMatch(GREEK);
      // The private link opens the English page.
      expect(mail.html, kind).toContain("/en/aitima/");
    }
  });
});

describe("shipped by DHL", () => {
  it("says DHL Express, with DHL's tracking link for the AWB", async () => {
    seed("DE");
    await sendShippedEmail(NUMBER, "1234567890");
    const mail = lastMail();
    expect(mail.text).toContain("Courier: DHL Express");
    expect(mail.text).toContain("Tracking number: 1234567890");
    expect(mail.text).toContain("https://www.dhl.com/gr-el/home/tracking.html?tracking-id=1234567890");
    // Handlebars escapes «=» in an attribute.
    expect(mail.html.replaceAll("&#x3D;", "=")).toContain("https://www.dhl.com/gr-el/home/tracking.html?tracking-id=1234567890");
    expect(mail.html).not.toContain("acscourier");
  });

  it("the status email labels the courier number as DHL, not ACS", async () => {
    seed("DE", { acsVoucherNo: "1234567890" });
    await sendOrderStatusEmail(NUMBER, "Σε επεξεργασία");
    const mail = lastMail();
    expect(mail.text).toContain("DHL Express tracking number: 1234567890");
    expect(mail.text).toContain("tracking-id=1234567890");
    expect(mail.text).not.toContain("ACS");
    expect(mail.subject).toBe(`Order ${NUMBER} — Processing`);
  });

  it("an ACS order is unchanged: Greek, ACS label and link", async () => {
    seed("GR", { acsVoucherNo: "555" });
    await sendOrderStatusEmail(NUMBER, "Σε επεξεργασία");
    const mail = lastMail();
    expect(mail.text).toContain("Αριθμός αποστολής ACS: 555");
    expect(mail.text).not.toContain("tracking-id");
    expect(mail.subject).toBe(`Παραγγελία ${NUMBER} — Σε επεξεργασία`);
  });
});

describe("Greece and Cyprus keep the Greek emails", () => {
  it.each(["GR", "CY", null])("%s: confirmation, shipped, delivered stay Greek", async (country) => {
    seed(country);
    const mail = (await buildOrderEmail(NUMBER))!;
    expect(mail.subject).toBe(`Η παραγγελία ${NUMBER} επιβεβαιώθηκε`);
    expect(mail.html).toContain('lang="el"');
    expect(mail.html).toContain("136,40 €");
    expect(mail.html).not.toContain("/en/checkout");

    await sendShippedEmail(NUMBER, "555");
    expect(lastMail().subject).toBe(`Η παραγγελία ${NUMBER} απεστάλη`);
    expect(lastMail().html).toContain('lang="el"');
    expect(lastMail().text).toContain("acscourier");

    await sendDeliveredEmail(NUMBER);
    expect(lastMail().subject).toBe(`Η παραγγελία ${NUMBER} παραδόθηκε`);
  });
});

describe("an explicit locale wins", () => {
  it("el on a DE order (an admin preview in Greek)", async () => {
    seed("DE");
    const mail = (await buildOrderEmail(NUMBER, { locale: "el" }))!;
    expect(mail.subject).toBe(`Η παραγγελία ${NUMBER} επιβεβαιώθηκε`);
    expect(mail.html).toContain('lang="el"');
  });

  it("en on a Greek order", async () => {
    seed("GR");
    const mail = (await buildOrderEmail(NUMBER, { locale: "en" }))!;
    expect(mail.subject).toBe(`Your order ${NUMBER} is confirmed`);
  });
});

describe("the shop's notification stays Greek", () => {
  it("for a DE order too: subject, text and html", async () => {
    seed("DE");
    await sendInternalOrderEmail(NUMBER);
    const mail = lastMail();
    expect(mail.subject).toMatch(/^Νέα παραγγελία /);
    expect(mail.text).toContain("ΠΑΡΑΓΓΕΛΙΑ");
    expect(mail.text).toContain("ΕΕ — ιδιώτης");
    expect(mail.text).toContain("Αποστολή: DHL Express");
    expect(mail.text).toContain("136,40 €");
    expect(mail.html).toContain('lang="el"');
  });

  it("the exempt note in the shop's copy is the Greek sentence", async () => {
    seed("DE", { vatMode: "intra_eu_exempt", customerType: "company", wantsInvoice: true, companyName: "Muster GmbH", vatNumber: "DE123456789", viesConsultationNumber: "WAPI1", vatAmount: 0, totalGross: 110 });
    await sendInternalOrderEmail(NUMBER);
    expect(lastMail().text).toContain("Ενδοκοινοτική παράδοση — απαλλαγή ΦΠΑ");
  });
});
