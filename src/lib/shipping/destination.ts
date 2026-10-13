/**
 * Where we deliver, and how an address is checked against it.
 *
 * ACS carries for us inside Greece. Order KOL-20261013-0002 came from Italy:
 * the checkout has no country field, the order defaulted to GR, ACS answered
 * «No ACS station for postcode 37015» and the shop priced the parcel from its
 * own table as if it were going to a Greek island. This module is the first of
 * the two walls against that — the shape of the address. The second is ACS
 * itself: a postcode that looks Greek but has no station is refused by
 * `quoteLivePostage` as `unserviceable_postcode`.
 *
 * Pure, with no server imports: the checkout form runs the same checks for
 * instant feedback, and the server action runs them again as the authority.
 *
 * Cyprus is written in but switched off. Neither shop has a country field and
 * HDCtool's quote only accepts five-digit postcodes, so a Cypriot order could
 * not be priced today. Adding "CY" to `SHIPPING_COUNTRIES` (with a country
 * selector and a CY quote path) turns it on; the copy follows the list.
 */

export type ShippingCountry = "GR" | "CY";

/** The countries an order may be delivered to. */
export const SHIPPING_COUNTRIES: readonly ShippingCountry[] = ["GR"];

export const DEFAULT_SHIPPING_COUNTRY: ShippingCountry = "GR";

export type PostcodeCheck =
  | { ok: true; postcode: string; country: ShippingCountry }
  | { ok: false; reason: "format" | "range" | "country" };

/**
 * A Greek postcode: five digits, optionally written «162 32».
 *
 * Greek postcodes run from 10xxx (Athens) to 85xxx (Dodecanese). Nothing
 * starts with 0 or 9, and 86–89 are unallocated. The range catches most
 * foreign postcodes that happen to be five digits (German 0xxxx and 9xxxx,
 * Italian 0xxxx and 86–98xxx); it cannot catch one inside 10–85, like Verona's
 * 37015 — that is ACS's job.
 */
function greekPostcode(raw: string): PostcodeCheck {
  const value = raw.trim();
  if (!/^\d{3} ?\d{2}$/.test(value)) return { ok: false, reason: "format" };
  const clean = value.replace(" ", "");
  const prefix = Number(clean.slice(0, 2));
  if (prefix < 10 || prefix > 85) return { ok: false, reason: "range" };
  return { ok: true, postcode: clean, country: "GR" };
}

/** A Cypriot postcode: four digits, 1000–9999. */
function cypriotPostcode(raw: string): PostcodeCheck {
  const value = raw.trim();
  if (!/^\d{4}$/.test(value)) return { ok: false, reason: "format" };
  if (value.startsWith("0")) return { ok: false, reason: "range" };
  return { ok: true, postcode: value, country: "CY" };
}

/**
 * Checks a postcode for a country we ship to.
 *
 * `countries` defaults to `SHIPPING_COUNTRIES`; it is a parameter so the
 * Cyprus rule can be tested before it is switched on.
 */
export function validatePostcode(
  raw: string | null | undefined,
  country: ShippingCountry = DEFAULT_SHIPPING_COUNTRY,
  countries: readonly ShippingCountry[] = SHIPPING_COUNTRIES,
): PostcodeCheck {
  if (!countries.includes(country)) return { ok: false, reason: "country" };
  const value = raw ?? "";
  return country === "CY" ? cypriotPostcode(value) : greekPostcode(value);
}

/*
 * Country names that, typed into an address, mean the parcel is going abroad.
 *
 * Deliberately short and deliberately whole words. A Greek address can name a
 * country — «Ιταλίας 12», «Λεωφ. Κύπρου», «Γαλλίας» — and those are streets,
 * in the genitive, which these nominative forms do not match. Cyprus is not on
 * the list: it is a destination we may serve, and its postcodes are checked by
 * shape instead.
 */
const FOREIGN_COUNTRY_WORDS = [
  "italy",
  "italia",
  "germany",
  "deutschland",
  "france",
  "spain",
  "espana",
  "portugal",
  "netherlands",
  "nederland",
  "holland",
  "belgium",
  "belgique",
  "austria",
  "osterreich",
  "switzerland",
  "schweiz",
  "suisse",
  "united kingdom",
  "england",
  "scotland",
  "ireland",
  "united states",
  "usa",
  "canada",
  "australia",
  "poland",
  "polska",
  "sweden",
  "denmark",
  "norway",
  "finland",
  "bulgaria",
  "romania",
  "albania",
  "turkey",
  "turkiye",
  "serbia",
  "croatia",
  "slovenia",
  "hungary",
  "czech republic",
  "czechia",
  "luxembourg",
  // Greek nominatives — a street is named in the genitive («Ιταλίας»).
  "ιταλια",
  "γερμανια",
  "γαλλια",
  "ισπανια",
  "πορτογαλια",
  "ολλανδια",
  "βελγιο",
  "αυστρια",
  "ελβετια",
  "ηνωμενο βασιλειο",
  "βουλγαρια",
  "ρουμανια",
  "αλβανια",
  "τουρκια",
  "ηπα",
] as const;

/** Lower case, accents off, so «Ιταλία», «ITALIA» and «Österreich» all compare plainly. */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/ς/g, "σ");
}

const FOREIGN_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${FOREIGN_COUNTRY_WORDS.map((w) => fold(w).replace(/ /g, "\\s+")).join("|")})(?![\\p{L}\\p{N}])`,
  "u",
);

/** The foreign country named in `text`, if one is — else null. */
export function foreignCountryIn(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = fold(text).match(FOREIGN_PATTERN);
  return match ? match[0] : null;
}

export type AddressFields = {
  shipLine1?: string | null;
  shipLine2?: string | null;
  shipCity?: string | null;
  shipPostcode?: string | null;
  shipRegion?: string | null;
  shipAdminRegion?: string | null;
};

type TextField = Exclude<keyof AddressFields, "shipPostcode">;

const TEXT_FIELDS: TextField[] = [
  "shipLine1",
  "shipLine2",
  "shipCity",
  "shipRegion",
  "shipAdminRegion",
];

export type DestinationCheck =
  | { ok: true; postcode: string; country: ShippingCountry }
  | {
      ok: false;
      /** The field to mark. */
      field: keyof AddressFields;
      reason: "postcode_format" | "postcode_range" | "country" | "foreign_address";
    };

/**
 * The whole delivery address against where we ship.
 *
 * The postcode first — it is the field the message belongs to — and then the
 * text fields for a foreign country's name.
 */
export function checkDestination(
  address: AddressFields,
  country: ShippingCountry = DEFAULT_SHIPPING_COUNTRY,
): DestinationCheck {
  const postcode = validatePostcode(address.shipPostcode, country);
  if (!postcode.ok) {
    return {
      ok: false,
      field: "shipPostcode",
      reason:
        postcode.reason === "country"
          ? "country"
          : postcode.reason === "range"
            ? "postcode_range"
            : "postcode_format",
    };
  }
  for (const field of TEXT_FIELDS) {
    if (foreignCountryIn(address[field])) {
      return { ok: false, field, reason: "foreign_address" };
    }
  }
  return { ok: true, postcode: postcode.postcode, country: postcode.country };
}

/*
 * The server's copy, so the checkout action answers in the customer's language
 * (Italian falls back to English). It follows `SHIPPING_COUNTRIES`. The pages
 * and the form carry the same sentences in `messages/*.json` (`shipping.*`) —
 * switching Cyprus on means updating those too.
 */
const SHIPS_TO_CY = SHIPPING_COUNTRIES.includes("CY");

export type ShippingCopy = { zone: string; unserviceable: string; foreign: string };

export const SHIPPING_COPY: Record<"el" | "en", ShippingCopy> = {
  el: {
    zone: SHIPS_TO_CY ? "Αποστολές μόνο σε Ελλάδα και Κύπρο" : "Αποστολές μόνο εντός Ελλάδας",
    unserviceable: SHIPS_TO_CY
      ? "Ο ΤΚ δεν αντιστοιχεί σε περιοχή που εξυπηρετούμε. Αποστέλλουμε μόνο σε Ελλάδα και Κύπρο."
      : "Ο ΤΚ δεν αντιστοιχεί σε περιοχή που εξυπηρετούμε. Αποστέλλουμε μόνο εντός Ελλάδας.",
    foreign: SHIPS_TO_CY
      ? "Η διεύθυνση είναι εκτός Ελλάδας και Κύπρου. Αποστέλλουμε μόνο σε Ελλάδα και Κύπρο."
      : "Η διεύθυνση είναι εκτός Ελλάδας. Αποστέλλουμε μόνο εντός Ελλάδας.",
  },
  en: {
    zone: SHIPS_TO_CY ? "We ship to Greece and Cyprus only." : "We ship within Greece only.",
    unserviceable: SHIPS_TO_CY
      ? "This postcode is not in an area we deliver to. We ship to Greece and Cyprus only."
      : "This postcode is not in an area we deliver to. We ship within Greece only.",
    foreign: SHIPS_TO_CY
      ? "This address is outside Greece and Cyprus. We ship to Greece and Cyprus only."
      : "This address is outside Greece. We ship within Greece only.",
  },
};

/** Greek for Greek, English for everyone else. */
export function shippingCopy(locale: string | null | undefined): ShippingCopy {
  return locale === "el" || !locale ? SHIPPING_COPY.el : SHIPPING_COPY.en;
}

/** The message for a failed `checkDestination`, in the customer's language. */
export function destinationMessage(
  check: Extract<DestinationCheck, { ok: false }>,
  locale: string | null | undefined,
): string {
  const copy = shippingCopy(locale);
  return check.reason === "foreign_address" ? copy.foreign : copy.unserviceable;
}
