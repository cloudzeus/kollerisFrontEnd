/**
 * A foreign VAT number, as typed, into the form VIES is asked about.
 *
 * «de 123 456 789», «DE-123.456.789», «DEDE123456789», «123456789» → for
 * Germany, `DE123456789`. A prefix that names another country is refused as
 * `invalid_format` without any call: the customer picked one country and typed
 * another's number. Greece never comes here — a Greek ΑΦΜ is the AADE path.
 *
 * The same rule as HDCtool's `normaliseForeignVat`, so the browser can say
 * «wrong format» before asking and the server asks with exactly what HDCtool
 * would have normalised to. HDCtool checks again regardless.
 *
 * Pure and client-safe.
 */

import { vatPrefix } from "@/lib/eu-sales/countries";
import { EU_COUNTRIES } from "@/lib/shipping/eu-postcodes";

export type EuVatFormat = { ok: true; vat: string } | { ok: false; reason: "invalid_format" };

const BAD: EuVatFormat = { ok: false, reason: "invalid_format" };

/** Every prefix that means «a country» inside a VAT number. */
const KNOWN_PREFIXES = new Set([...[...EU_COUNTRIES].map(vatPrefix), "GR", "EL", "GB", "UK", "CH", "NO", "XI"]);

export function normaliseEuVat(raw: string | null | undefined, country: string | null | undefined): EuVatFormat {
  const cc = (country ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc) || cc === "GR" || !EU_COUNTRIES.has(cc)) return BAD;

  const own = vatPrefix(cc);
  let s = (raw ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
  const head = s.slice(0, 2);
  if (head === own) {
    s = s.slice(2);
    // A doubled prefix (DEDE…), as autofill and copy-paste produce.
    if (s.startsWith(own) && /\d/.test(s.slice(2))) s = s.slice(2);
  } else if (KNOWN_PREFIXES.has(head)) {
    return BAD;
  }
  if (!/^[A-Z0-9]{4,14}$/.test(s) || !/\d/.test(s)) return BAD;
  return { ok: true, vat: `${own}${s}` };
}
