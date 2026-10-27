import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import el from "@/messages/el.json";
import en from "@/messages/en.json";
import it_ from "@/messages/it.json";

/*
 * The confirmation page for an intra-community exempt order (Task 17 / C4):
 * the reverse-charge note in the page's language, the ΑΦΜ with its prefix and
 * the VIES number — and the ordinary page when VAT was charged.
 */

const messages = { el, en, it: it_ } as Record<string, typeof el>;
let locale = "el";

const { order } = vi.hoisted(() => ({ order: { current: null as unknown } }));

vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async (arg: string | { namespace: string; locale?: string }) => {
    const namespace = typeof arg === "string" ? arg : arg.namespace;
    const dict = namespace.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], messages[locale]) as Record<string, string>;
    return (key: string, vars: Record<string, unknown> = {}) =>
      (dict[key] ?? key).replace(/\{(\w+)\}/g, (_m, name: string) => String(vars[name] ?? ""));
  },
}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("notFound"); }, redirect: vi.fn() }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/chrome/SiteChrome", () => ({ SiteChrome: () => null }));
vi.mock("@/components/chrome/SiteFooter", () => ({ SiteFooter: () => null }));
vi.mock("@/components/account/ReorderButton", () => ({ ReorderButton: () => null }));
vi.mock("@/components/seo/GoogleReviewsOptIn", () => ({ GoogleReviewsOptIn: () => null }));
vi.mock("@/lib/cart/cart", () => ({ getMiniCart: async () => ({}) }));
vi.mock("@/lib/catalog/queries", () => ({
  getCatalogueStats: async () => ({}),
  getMenuTree: async () => [],
  getRootCategories: async () => [],
  getTopBrands: async () => [],
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      findUnique: async () => order.current,
      findFirst: async () => null,
    },
    product: { findMany: async () => [] },
  },
}));

const { default: Page } = await import("@/app/[locale]/checkout/epibebaiosi/[orderNumber]/page");

const NUMBER = "KOL-20261027-0001";
const TOKEN = "t".repeat(32);

function seed(over: Record<string, unknown> = {}) {
  order.current = {
    id: "e1",
    orderNumber: NUMBER,
    guestToken: TOKEN,
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
    customerType: "company",
    vatMode: "intra_eu_exempt",
    viesConsultationNumber: "WAPIAAAA1234",
    notes: null,
    subtotalNet: 100,
    shippingGross: 31.4,
    vatAmount: 0,
    totalGross: 131.4,
    shippingQuote: { carrier: "DHL", etaDays: "2-3" },
    reservedUntil: null,
    vivaOrderCode: null,
    createdAt: new Date("2026-10-27T08:00:00Z"),
    requestStatus: null,
    requestToken: null,
    lines: [{ id: "l1", sku: "KN-0", name: "Pliers", brand: "KNIPEX", imageUrl: null, quantity: 1, lineNet: 100, lineGross: 124 }],
    ...over,
  };
}

async function render(loc: string): Promise<string> {
  locale = loc;
  const ui = await Page({
    params: Promise.resolve({ locale: loc as never, orderNumber: NUMBER }),
    searchParams: Promise.resolve({ t: TOKEN }),
  });
  return renderToStaticMarkup(ui as never);
}

beforeEach(() => seed());

describe("confirmation page — exempt order", () => {
  it("el: the exact note, ΑΦΜ with prefix and the VIES number", async () => {
    const html = await render("el");
    expect(html).toContain("Ενδοκοινοτική παράδοση — απαλλαγή ΦΠΑ (αντίστροφη επιβάρυνση, άρθρο 138 Οδηγίας 2006/112/ΕΚ)");
    expect(html).toContain("DE123456789");
    expect(html).toContain("WAPIAAAA1234");
    expect(html).not.toContain("Περιλαμβάνεται ΦΠΑ");
  });

  it("net line amounts, and the note in place of the VAT row", async () => {
    const html = await render("el");
    // The line is what was charged: 100,00 € (the stored gross is ignored for an exempt order).
    expect(html).toContain("100,00");
    expect(html).not.toContain("124,00");
    // No «ΦΠΑ» row (label with its amount) — only the note mentions the VAT.
    expect(html).not.toMatch(/<dt[^>]*>ΦΠΑ<\/dt>/);
    expect(html.match(/ΦΠΑ/g)?.length).toBe(1);
  });

  it("en and it carry their own wording", async () => {
    expect(await render("en")).toContain("Intra-community supply — VAT exempt (reverse charge, Article 138 of Directive 2006/112/EC)");
    const it = await render("it");
    expect(it).toContain("Cessione intracomunitaria — esente IVA");
    expect(it).toContain("Numero VIES");
  });
});

describe("confirmation page — VAT charged", () => {
  it("no note and no VIES line for a consumer", async () => {
    seed({ customerType: "individual", vatMode: "standard", wantsInvoice: false, companyName: null, vatNumber: null, viesConsultationNumber: null, vatAmount: 24, totalGross: 155.4 });
    const html = await render("el");
    expect(html).not.toContain("Ενδοκοινοτική");
    expect(html).not.toContain("VIES");
    // The ordinary page: gross line and a VAT row.
    expect(html).toContain("124,00");
    expect(html).toMatch(/<dt[^>]*>ΦΠΑ<\/dt>/);
  });

  it("a Greek order is the page it always was", async () => {
    seed({ shipCountry: "GR", billCountry: "GR", customerType: null, vatMode: "standard", viesConsultationNumber: null, shippingMethod: "courier", vatNumber: "099095556", taxOffice: "ΚΕΦΟΔΕ" });
    const html = await render("el");
    expect(html).not.toContain("Ενδοκοινοτική");
    expect(html).toContain("ΚΕΦΟΔΕ");
  });
});
