/**
 * The countries the shop delivers to, their names, and which courier carries
 * there. docs/dhl-express.md §4.
 *
 * Greece and Cyprus go with ACS, exactly as before. Every other EU member state
 * goes with DHL Express, priced by HDCtool (§1). Nothing outside the EU yet —
 * that needs customs (DDP) and is a later step.
 *
 * All of this sits behind INTERNATIONAL_SHIPPING_ENABLED (`./flag`). With the
 * flag off the shop has no country field and delivers to Greece only, which is
 * `lib/shipping/destination` unchanged.
 *
 * Pure and client-safe: the checkout form renders the selector from it and the
 * server action checks against it.
 */

import { validatePostcode as validateAcsPostcode } from "@/lib/shipping/destination";
import { EU_COUNTRIES, normalizePostcode } from "@/lib/shipping/eu-postcodes";

export type CountryCode = string;
export type Carrier = "ACS" | "DHL";

export const HOME_COUNTRY = "GR";

/** ACS carries to these two; everything else in the list is DHL. */
export const ACS_COUNTRIES: readonly CountryCode[] = ["GR", "CY"];

/**
 * GR and CY first, then the other 25 EU member states by ISO code. The form
 * sorts those 25 by their name in the customer's language (`countryOptions`).
 */
export const EU_SHIPPING_COUNTRIES: readonly CountryCode[] = [
  "GR",
  "CY",
  ...[...EU_COUNTRIES].filter((c) => c !== "GR" && c !== "CY").sort(),
];

type Names = { el: string; en: string; it: string };

export const COUNTRY_NAMES: Record<CountryCode, Names> = {
  AT: { el: "Αυστρία", en: "Austria", it: "Austria" },
  BE: { el: "Βέλγιο", en: "Belgium", it: "Belgio" },
  BG: { el: "Βουλγαρία", en: "Bulgaria", it: "Bulgaria" },
  CY: { el: "Κύπρος", en: "Cyprus", it: "Cipro" },
  CZ: { el: "Τσεχία", en: "Czechia", it: "Cechia" },
  DE: { el: "Γερμανία", en: "Germany", it: "Germania" },
  DK: { el: "Δανία", en: "Denmark", it: "Danimarca" },
  EE: { el: "Εσθονία", en: "Estonia", it: "Estonia" },
  ES: { el: "Ισπανία", en: "Spain", it: "Spagna" },
  FI: { el: "Φινλανδία", en: "Finland", it: "Finlandia" },
  FR: { el: "Γαλλία", en: "France", it: "Francia" },
  GR: { el: "Ελλάδα", en: "Greece", it: "Grecia" },
  HR: { el: "Κροατία", en: "Croatia", it: "Croazia" },
  HU: { el: "Ουγγαρία", en: "Hungary", it: "Ungheria" },
  IE: { el: "Ιρλανδία", en: "Ireland", it: "Irlanda" },
  IT: { el: "Ιταλία", en: "Italy", it: "Italia" },
  LT: { el: "Λιθουανία", en: "Lithuania", it: "Lituania" },
  LU: { el: "Λουξεμβούργο", en: "Luxembourg", it: "Lussemburgo" },
  LV: { el: "Λετονία", en: "Latvia", it: "Lettonia" },
  MT: { el: "Μάλτα", en: "Malta", it: "Malta" },
  NL: { el: "Ολλανδία", en: "Netherlands", it: "Paesi Bassi" },
  PL: { el: "Πολωνία", en: "Poland", it: "Polonia" },
  PT: { el: "Πορτογαλία", en: "Portugal", it: "Portogallo" },
  RO: { el: "Ρουμανία", en: "Romania", it: "Romania" },
  SE: { el: "Σουηδία", en: "Sweden", it: "Svezia" },
  SI: { el: "Σλοβενία", en: "Slovenia", it: "Slovenia" },
  SK: { el: "Σλοβακία", en: "Slovakia", it: "Slovacchia" },
};

/** «Ιταλία» / «Italy» / «Italia»; an unknown code is shown as it is. */
export function countryName(code: string | null | undefined, locale: string | null | undefined): string {
  const c = (code ?? HOME_COUNTRY).toUpperCase();
  const names = COUNTRY_NAMES[c];
  if (!names) return c;
  return locale === "en" ? names.en : locale === "it" ? names.it : names.el;
}

/** The countries a customer may choose. Greece alone while the flag is off. */
export function shippingCountries(international: boolean): readonly CountryCode[] {
  return international ? EU_SHIPPING_COUNTRIES : [HOME_COUNTRY];
}

/** For the selector: Greece, Cyprus, then the rest by name in `locale`. */
export function countryOptions(locale: string): Array<{ code: CountryCode; name: string }> {
  const [home, cyprus, ...rest] = EU_SHIPPING_COUNTRIES;
  const collator = locale === "en" ? "en" : locale === "it" ? "it" : "el";
  return [
    { code: home, name: countryName(home, locale) },
    { code: cyprus, name: countryName(cyprus, locale) },
    ...rest
      .map((code) => ({ code, name: countryName(code, locale) }))
      .sort((a, b) => a.name.localeCompare(b.name, collator)),
  ];
}

/**
 * The country a form posted, or null when it is not one we deliver to.
 * Absent means Greece — the only answer there was before the selector.
 */
export function normalizeCountry(
  raw: string | null | undefined,
  international: boolean,
): CountryCode | null {
  const code = (raw ?? "").trim().toUpperCase() || HOME_COUNTRY;
  return shippingCountries(international).includes(code) ? code : null;
}

export function carrierForCountry(country: string | null | undefined): Carrier | null {
  const c = (country ?? HOME_COUNTRY).toUpperCase();
  if (ACS_COUNTRIES.includes(c)) return "ACS";
  return EU_SHIPPING_COUNTRIES.includes(c) ? "DHL" : null;
}

/** An EU destination other than Greece and Cyprus: DHL Express. */
export function isDhlCountry(country: string | null | undefined): boolean {
  return carrierForCountry(country) === "DHL";
}

export type CountryPostcodeCheck =
  | { ok: true; postcode: string }
  | { ok: false; reason: "format" | "range" | "country"; expected?: string[] };

/*
 * Malta. DHL's reference data lists Malta among the countries WITHOUT a
 * postcode (the skill's NO_POSTCODE_COUNTRIES, so `normalizePostcode("MT", …)`
 * returns "" and HDCtool sends DHL an empty postalCode). Maltese addresses do
 * carry one — «VLT 1117», three letters and four digits — and it belongs on the
 * label, so the shop asks for it and checks that shape itself.
 */
const MALTA_POSTCODE = /^([A-Z]{3}) ?(\d{4})$/;

/**
 * A postcode for the selected country, normalised to how that country writes
 * it («1012ab» → «1012 AB», «00950» → «00-950», «d02x285» → «D02 X285»).
 *
 * Greece and Cyprus use the ACS rules of `lib/shipping/destination` (five
 * digits 10xxx–85xxx; four digits) so the GR answer is exactly today's. The
 * rest use DHL's formats via the skill's `normalizePostcode`; a country the
 * guide does not know is refused, never waved through.
 */
export function validateCountryPostcode(
  country: string,
  raw: string | null | undefined,
): CountryPostcodeCheck {
  const c = country.toUpperCase();
  if (c === "GR" || c === "CY") {
    const checked = validateAcsPostcode(raw, c, ["GR", "CY"]);
    return checked.ok ? { ok: true, postcode: checked.postcode } : { ok: false, reason: checked.reason };
  }
  if (!EU_SHIPPING_COUNTRIES.includes(c)) return { ok: false, reason: "country" };
  if (c === "MT") {
    const m = (raw ?? "").toUpperCase().replace(/\s+/g, " ").trim().match(MALTA_POSTCODE);
    return m ? { ok: true, postcode: `${m[1]} ${m[2]}` } : { ok: false, reason: "format", expected: ["AAA 9999"] };
  }
  const result = normalizePostcode(c, raw);
  if (!result.ok || !result.known || !result.value) {
    return { ok: false, reason: "format", expected: result.expected };
  }
  return { ok: true, postcode: result.value };
}

/** «12345», «1234 AB», «A99 XXXX» — the placeholder under the Τ.Κ. field. */
export function postcodeExample(country: string): string {
  const c = country.toUpperCase();
  if (c === "GR") return "12345";
  if (c === "CY") return "1234";
  if (c === "MT") return "VLT 1117";
  if (c === "IE") return "D02 X285";
  const probe = normalizePostcode(c, "");
  const format = probe.expected?.[probe.expected.length - 1] ?? "";
  // «9999 AA» → «1234 AB»: the guide's mask with plausible characters.
  let digit = 0;
  let letter = 0;
  return [...format]
    .map((ch) =>
      ch === "9" ? String((digit++ % 9) + 1) : ch === "A" ? String.fromCharCode(65 + (letter++ % 26)) : ch,
    )
    .join("");
}

/**
 * «37015 Verona, Ιταλία» — the postcode-and-city line of an address, with the
 * country named whenever it is not Greece. A Greek address reads exactly as it
 * always did («18545 Πειραιάς»).
 */
export function localityLine(
  postcode: string | null | undefined,
  city: string | null | undefined,
  country: string | null | undefined,
  locale: string | null | undefined = "el",
): string {
  const base = `${postcode ?? ""} ${city ?? ""}`;
  const c = (country ?? HOME_COUNTRY).toUpperCase();
  return c === HOME_COUNTRY ? base : `${base}, ${countryName(c, locale)}`;
}

/** «DHL Express» for a DHL destination, else null (the method's own label stands). */
export function carrierLabel(country: string | null | undefined, shippingMethod: string): string | null {
  return shippingMethod !== "pickup" && isDhlCountry(country) ? "DHL Express" : null;
}
