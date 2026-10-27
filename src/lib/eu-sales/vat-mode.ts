/**
 * Whether an order is charged VAT (intra-EU sales design §3.2–3.3).
 *
 * Zero VAT — an intra-community supply under reverse charge, art. 138 of
 * Directive 2006/112/EC — only with ALL of:
 *   - a delivery country that is a DHL destination (EU, not Greece, not Cyprus);
 *   - a company, not a consumer;
 *   - VIES said `valid`;
 *   - and said it on the same calendar day in Athens.
 * Anything else is standard VAT: an outage, an invalid or malformed number,
 * yesterday's answer, or an answer for a country the customer has since
 * switched away from.
 *
 * Pure and client-safe. The server calls it with a result it has just fetched
 * itself; the browser's copy is only ever for display.
 */

// Type-only: erased at build, so this module stays client-safe.
import type { VatMode } from "@/lib/cart/cart";
import { isDhlDestination } from "@/lib/eu-sales/countries";

export type { VatMode };

/** The amount a checkout line shows: the net for an exempt buyer, as the summary's total does. */
export function summaryLineAmount(
  line: { lineNet: number; lineGross: number },
  vatMode: VatMode,
): number {
  return vatMode === "intra_eu_exempt" ? line.lineNet : line.lineGross;
}

export type CustomerType = "individual" | "company";

export type VatModeInput = {
  country: string;
  customerType: CustomerType;
  vies: {
    status: string;
    checkedAt: string | null;
    /** The country the check was made for. When given and different, the result does not count. */
    country?: string | null;
  } | null;
};

const ATHENS_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Athens",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** «2026-10-27»: the calendar day in Athens. */
export function athensDay(date: Date): string {
  return ATHENS_DAY.format(date);
}

export function resolveVatMode(input: VatModeInput, now: Date = new Date()): VatMode {
  const country = input.country.trim().toUpperCase();
  if (!isDhlDestination(country)) return "standard";
  if (input.customerType !== "company") return "standard";

  const vies = input.vies;
  if (!vies || vies.status !== "valid" || !vies.checkedAt) return "standard";
  if (vies.country && vies.country.trim().toUpperCase() !== country) return "standard";

  const checked = new Date(vies.checkedAt);
  if (Number.isNaN(checked.getTime())) return "standard";
  return athensDay(checked) === athensDay(now) ? "intra_eu_exempt" : "standard";
}
