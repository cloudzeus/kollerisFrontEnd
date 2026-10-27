/**
 * EU sales with DHL and VIES (intra-EU sales design §3.1): which countries,
 * their names, and the switch.
 *
 * Pure and client-safe: the checkout form renders the selector from it and the
 * server action checks against it.
 */

import { COUNTRY_NAMES, EU_SHIPPING_COUNTRIES, HOME_COUNTRY } from "@/lib/shipping/countries";
import { isInternationalShippingEnabled } from "@/lib/shipping/flag";

type Env = Record<string, string | undefined>;

/**
 * EU_SALES_ENABLED: on only for the exact string «true». Off (the default)
 * means the checkout is today's, byte for byte.
 *
 * Read on the server at call time; pages pass the answer to the form as a prop
 * and the server action reads it again.
 */
export function isEuSalesEnabled(env: Env = process.env): boolean {
  return env.EU_SALES_ENABLED === "true";
}

export type CountryLabels = { el: string; en: string; it: string };
export type DhlCountry = { code: string; labels: CountryLabels };

/**
 * The DHL destinations, in ONE list: the EU-27 minus Greece (ACS, at home) and
 * Cyprus (out of scope for now — it keeps today's path). Labels are the shop's
 * country names, so a country reads the same everywhere.
 */
export const DHL_COUNTRIES: readonly DhlCountry[] = EU_SHIPPING_COUNTRIES.filter(
  (code) => code !== "GR" && code !== "CY",
).map((code) => ({ code, labels: COUNTRY_NAMES[code] }));

const DHL_CODES = new Set(DHL_COUNTRIES.map((c) => c.code));

/** An EU country other than Greece and Cyprus: DHL, VIES, consumer/company. */
export function isDhlDestination(country: string | null | undefined): boolean {
  return DHL_CODES.has((country ?? "").trim().toUpperCase());
}

/** The country's VAT prefix: its ISO code, except Greece, which VIES calls EL. */
export function vatPrefix(country: string): string {
  const c = country.toUpperCase();
  return c === "GR" ? "EL" : c;
}

/**
 * The countries the checkout accepts, from both switches.
 *
 *   INTERNATIONAL_SHIPPING_ENABLED on → today's list (GR, CY with ACS, the
 *                                       rest with DHL), whatever EU sales says
 *   EU_SALES_ENABLED only             → Greece and the DHL destinations
 *   neither                           → Greece alone
 */
export function allowedCountries(env: Env = process.env): readonly string[] {
  if (isInternationalShippingEnabled(env)) return EU_SHIPPING_COUNTRIES;
  if (isEuSalesEnabled(env)) return [HOME_COUNTRY, ...DHL_COUNTRIES.map((c) => c.code)];
  return [HOME_COUNTRY];
}

/** Is there a country selector at all? */
export function hasCountrySelector(env: Env = process.env): boolean {
  return allowedCountries(env).length > 1;
}

function label(code: string, locale: string): string {
  const names = COUNTRY_NAMES[code];
  if (!names) return code;
  return locale === "en" ? names.en : locale === "it" ? names.it : names.el;
}

/**
 * For the selector: Greece first, Cyprus next when it is offered, then the
 * rest by name in the customer's language.
 */
export function countryOptionsFor(
  codes: readonly string[],
  locale: string,
): Array<{ code: string; name: string }> {
  const collator = locale === "en" ? "en" : locale === "it" ? "it" : "el";
  const head = ["GR", "CY"].filter((c) => codes.includes(c));
  const rest = codes
    .filter((c) => !head.includes(c))
    .map((code) => ({ code, name: label(code, locale) }))
    .sort((a, b) => a.name.localeCompare(b.name, collator));
  return [...head.map((code) => ({ code, name: label(code, locale) })), ...rest];
}
