import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", async () => (await import("../requests/__tests__/request-fakes")).mockModules.prisma());
const { sendMail } = vi.hoisted(() => ({
  sendMail: vi.fn(async (mail: { to: string }) => {
    void mail;
    return { ok: true as const, id: "mg-1" };
  }),
}));
vi.mock("@/lib/mail/client", () => ({ sendMail, mailConfigured: () => true }));

import { db, resetFakes } from "../requests/__tests__/request-fakes";
import { buildOrderEmail } from "@/lib/mail/order-email";
import { sendInternalOrderEmail } from "@/lib/mail/order-internal-email";

/*
 * EU sales in the order emails (Task 17 / C4): an exempt order says why there
 * is no VAT instead of a VAT row, shows the buyer's VAT number with its prefix
 * and the VIES number, and never reads «Περιλαμβάνεται ΦΠΑ». The customer's
 * copy of a DE order is English (R-EMAIL-EN); the shop's copy stays Greek and
 * says who the EU buyer is. A Greek order's emails are unchanged.
 */

const NUMBER = "KOL-20261027-0001";
/** The shop's copy (Greek). */
const NOTE = "Ενδοκοινοτική παράδοση — απαλλαγή ΦΠΑ (αντίστροφη επιβάρυνση, άρθρο 138 Οδηγίας 2006/112/ΕΚ)";
/** The customer's copy of a DE order (English). */
const NOTE_EN = "Intra-community supply — VAT exempt (reverse charge, Article 138 of Directive 2006/112/EC)";

beforeEach(() => {
  resetFakes();
  sendMail.mockClear();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://kolleris.com");
});

function seed(over: Record<string, unknown> = {}) {
  db.orders.push({
    id: "e1",
    orderNumber: NUMBER,
    guestToken: "g".repeat(32),
    status: "CONFIRMED",
    paymentStatus: "PAID",
    paymentMethod: "card",
    shippingMethod: "dhl",
    email: "buyer@example.test",
    phone: "+49301234567",
    firstName: "Hans",
    lastName: "Muster",
    shipLine1: "Unter den Linden 1",
    shipLine2: null,
    shipCity: "Berlin",
    shipPostcode: "10117",
    shipCountry: "DE",
    billCountry: "DE",
    wantsInvoice: true,
    companyName: "Muster GmbH",
    vatNumber: "DE123456789",
    taxOffice: null,
    billLine1: null,
    billCity: null,
    billPostcode: null,
    customerType: "company",
    vatMode: "intra_eu_exempt",
    viesValid: true,
    viesConsultationNumber: "WAPIAAAA1234",
    viesCheckedAt: new Date("2026-10-27T09:30:00.000Z"),
    notes: null,
    subtotalNet: 100,
    subtotalGross: 100,
    shippingNet: 31.4,
    shippingGross: 31.4,
    paymentFeeNet: 0,
    vatAmount: 0,
    totalGross: 131.4,
    shippingQuote: { carrier: "DHL", productCode: "U", netAmount: 31.4, quotedAt: "2026-10-27T10:00:00.000Z", etaDays: "2-3" },
    reservedUntil: null,
    vivaOrderCode: null,
    createdAt: new Date("2026-10-27T08:00:00Z"),
    requestStatus: null,
    requestToken: null,
    parentOrderNumber: null,
    ...over,
  } as never);
  db.lines.push({
    id: "el1",
    orderId: "e1",
    sku: "KN-0",
    name: "Πένσα",
    brand: "KNIPEX",
    imageUrl: null,
    quantity: 1,
    unitNet: 100,
    discountPercent: 0,
    offerTitle: null,
    vatRate: 24,
    lineNet: 100,
    lineGross: 124,
  } as never);
}

describe("customer email — exempt order", () => {
  it("shows the reverse-charge note instead of the ΦΠΑ row, with the ΑΦΜ prefix and the VIES number", async () => {
    seed();
    const mail = await buildOrderEmail(NUMBER);
    expect(mail).not.toBeNull();
    expect(mail!.html).toContain(NOTE_EN);
    expect(mail!.html).not.toContain(NOTE);
    expect(mail!.html).not.toMatch(/VAT\s*24%/);
    expect(mail!.html).not.toContain("Περιλαμβάνεται ΦΠΑ");
    expect(mail!.html).toContain("DE123456789");
    expect(mail!.html).toContain("WAPIAAAA1234");
    // No «· » dangling after an ΑΦΜ with no ΔΟΥ.
    expect(mail!.html).not.toMatch(/DE123456789\s*·\s*</);
    expect(mail!.html).toContain("€131.40");
    expect(mail!.text).toContain(NOTE_EN);
    expect(mail!.text).toContain("VAT no.: DE123456789");
    expect(mail!.text).toContain("VIES: WAPIAAAA1234");
    expect(mail!.text).not.toContain("Περιλαμβάνεται ΦΠΑ");
    // The line is what was charged: VAT-free, not the stored 24% gross.
    expect(mail!.text).toContain("Πένσα — €100.00");
    expect(mail!.text).not.toContain("124");
  });

  it("the bank-transfer email (payment-pending-bank) says it too", async () => {
    vi.stubEnv("BANK_TRANSFER_IBAN", "GR1601101250000000012300695");
    vi.resetModules();
    seed({ paymentStatus: "PENDING", status: "PENDING_PAYMENT", paymentMethod: "bank" });
    const { buildOrderEmail: build } = await import("@/lib/mail/order-email");
    const mail = await build(NUMBER);
    expect(mail!.subject).toContain("Bank transfer details");
    expect(mail!.html).toContain(NOTE_EN);
    expect(mail!.html).not.toMatch(/VAT\s*24%/);
  });

  it("an EU consumer charged VAT keeps the ΦΠΑ row and gets no note", async () => {
    seed({
      customerType: "individual",
      vatMode: "standard",
      wantsInvoice: false,
      companyName: null,
      vatNumber: null,
      viesValid: null,
      viesConsultationNumber: null,
      viesCheckedAt: null,
      vatAmount: 24,
      subtotalGross: 124,
      totalGross: 155.4,
      shippingGross: 31.4,
    });
    const mail = await buildOrderEmail(NUMBER);
    expect(mail!.html).not.toContain(NOTE_EN);
    expect(mail!.html).toContain("€24.00");
    expect(mail!.html).toContain("VAT");
  });
});

describe("shop notification", () => {
  it("«ΕΕ — εταιρεία, VIES ✓ <n>» for a verified company, with the note, ΑΦΜ and VIES number", async () => {
    seed();
    await sendInternalOrderEmail(NUMBER);
    const mail = sendMail.mock.calls.at(-1)![0] as unknown as { html: string; text: string };
    expect(mail.html).toContain("ΕΕ — εταιρεία, VIES ✓ WAPIAAAA1234");
    expect(mail.text).toContain("ΕΕ — εταιρεία, VIES ✓ WAPIAAAA1234");
    expect(mail.html).toContain(NOTE);
    expect(mail.text).toContain("ΑΦΜ: DE123456789");
    expect(mail.text).not.toContain("ΔΟΥ");
    expect(mail.text).toContain(NOTE);
    expect(mail.text).toContain("Πένσα (KNIPEX) — 100,00 €");
    expect(mail.html).not.toContain("Περιλαμβάνεται ΦΠΑ");
  });

  it("«ΕΕ — ιδιώτης» for a consumer", async () => {
    seed({
      customerType: "individual",
      vatMode: "standard",
      wantsInvoice: false,
      companyName: null,
      vatNumber: null,
      viesValid: null,
      viesConsultationNumber: null,
      viesCheckedAt: null,
      vatAmount: 24,
      subtotalGross: 124,
      totalGross: 155.4,
    });
    await sendInternalOrderEmail(NUMBER);
    const mail = sendMail.mock.calls.at(-1)![0] as unknown as { html: string; text: string };
    expect(mail.html).toContain("ΕΕ — ιδιώτης");
    expect(mail.text).toContain("ΕΕ — ιδιώτης");
    expect(mail.html).not.toContain(NOTE);
  });

  it("a company charged VAT (VIES invalid) is marked as such, not as verified", async () => {
    seed({ vatMode: "standard", viesValid: false, viesConsultationNumber: null, viesCheckedAt: null, vatAmount: 24, subtotalGross: 124, totalGross: 155.4 });
    await sendInternalOrderEmail(NUMBER);
    const mail = sendMail.mock.calls.at(-1)![0] as unknown as { html: string; text: string };
    expect(mail.text).toContain("ΕΕ — εταιρεία, χωρίς VIES ✓ (χρεώθηκε ΦΠΑ)");
    expect(mail.text).not.toContain("VIES ✓ WAPIAAAA");
  });

  it("a Greek order's notification carries no EU line", async () => {
    seed({
      shipCountry: "GR",
      billCountry: "GR",
      customerType: null,
      vatMode: "standard",
      shippingMethod: "courier",
      shippingQuote: null,
      wantsInvoice: false,
      vatNumber: null,
      vatAmount: 24,
      subtotalGross: 124,
      totalGross: 124,
    });
    await sendInternalOrderEmail(NUMBER);
    const mail = sendMail.mock.calls.at(-1)![0] as unknown as { html: string; text: string };
    expect(mail.html).not.toContain("ΕΕ —");
    expect(mail.text).not.toContain("ΕΕ —");
    expect(mail.html).not.toContain(NOTE);
  });
});
