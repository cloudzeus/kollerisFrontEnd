import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import el from "@/messages/el.json";

/**
 * The checkout form, rendered on the server as the page renders it.
 *
 * Flag off: no EU-sales markup at all — the Greek invoice toggle, the address
 * suggestions, the regions. Flag on with a DHL destination: «Ιδιώτης /
 * Εταιρεία» in place of «Θέλω τιμολόγιο», a plain street field, no regions,
 * DHL only (no collection from the shop), and DHL's delivery day.
 */

vi.mock("@/lib/checkout/actions", () => ({ placeOrder: vi.fn() }));
vi.mock("@/lib/cart/actions", () => ({ setCartOptions: vi.fn() }));
vi.mock("@/lib/shipping/actions", () => ({ checkDeliveryPostcode: vi.fn(), quoteDelivery: vi.fn() }));
vi.mock("@/lib/eu-sales/check-vat-action", () => ({ checkVatAction: vi.fn(), setCustomerTypeAction: vi.fn() }));
vi.mock("@/lib/account/actions", () => ({ lookupCompanyByVat: vi.fn() }));

const { CheckoutForm } = await import("@/components/checkout/CheckoutForm");
const { allowedCountries } = await import("@/lib/eu-sales/countries");

function render(props: Record<string, unknown>): string {
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      // `children` is the third argument; the props type insists on it here too.
      { locale: "el", messages: el, timeZone: "Europe/Athens" } as unknown as Parameters<typeof NextIntlClientProvider>[0],
      createElement(CheckoutForm, {
        locale: "el",
        postcode: "",
        shippingMethod: "courier",
        paymentMethod: "card",
        ...props,
      } as Parameters<typeof CheckoutForm>[0]),
    ),
  );
}

describe("CheckoutForm and EU sales", () => {
  it("flag off: today's form, with no trace of EU sales", () => {
    const html = render({});
    expect(html).toContain('name="wantsInvoice"');
    expect(html).toContain('name="shipRegion"');
    expect(html).not.toContain("data-eu-sales");
    expect(html).not.toContain('name="customerType"');
    expect(html).not.toContain('name="shipCountry"');
    expect(html).not.toContain('name="vatModeHint"');
    expect(html).toContain('value="pickup"');
  });

  it("flag on, Greece: the Greek form with a country selector (no Cyprus)", () => {
    const html = render({
      international: true,
      euSales: true,
      countries: allowedCountries({ EU_SALES_ENABLED: "true" }),
    });
    expect(html).toContain("data-eu-sales");
    expect(html).toContain('name="shipCountry"');
    expect(html).not.toContain('value="CY"');
    expect(html).toContain('name="wantsInvoice"');
    expect(html).not.toContain('name="customerType"');
    expect(html).toContain('value="pickup"');
  });

  it("flag on, Germany: consumer/company, plain address, DHL only with its delivery day", () => {
    const html = render({
      international: true,
      euSales: true,
      countries: allowedCountries({ EU_SALES_ENABLED: "true" }),
      destination: { country: "DE", postcode: "10117", city: "Berlin" },
      initialQuote: {
        status: "ok",
        carrier: "DHL",
        netAmount: 31.4,
        grossAmount: 38.94,
        etaDays: "2–3",
        deliveryBy: "2026-10-30",
      },
      euCustomerType: "company",
    });
    expect(html).toContain('name="customerType"');
    expect(html).toContain("Ιδιώτης");
    expect(html).toContain("Εταιρεία");
    expect(html).not.toContain('name="wantsInvoice"');
    expect(html).not.toContain('name="shipRegion"');
    expect(html).not.toContain('name="shipAdminRegion"');
    expect(html).not.toContain('value="pickup"');
    expect(html).toContain('value="dhl"');
    expect(html).toContain("DHL Express · παράδοση έως");
    // The company block: VAT number with the prefix already filled.
    expect(html).toMatch(/name="vatNumber"[^>]*value="DE"/);
    expect(html).toContain("ΕΛΕΓΧΟΣ");
    // The displayed VAT mode goes back as a hint (R11-I2).
    expect(html).toMatch(/name="vatModeHint" value="standard"/);
  });
  it("exempt buyer: the DHL card shows the net price, like the summary (B1)", () => {
    const base = {
      international: true,
      euSales: true,
      countries: allowedCountries({ EU_SALES_ENABLED: "true" }),
      destination: { country: "DE", postcode: "10117", city: "Berlin" },
      initialQuote: { status: "ok", carrier: "DHL", netAmount: 31.84, grossAmount: 39.48, etaDays: "2–3", deliveryBy: "2026-10-30" },
      euCustomerType: "company",
    };
    const exempt = render({ ...base, displayedVatMode: "intra_eu_exempt" });
    expect(exempt).toContain("31,84");
    expect(exempt).not.toContain("39,48");
    const standard = render({ ...base, displayedVatMode: "standard" });
    expect(standard).toContain("39,48");
  });
});
