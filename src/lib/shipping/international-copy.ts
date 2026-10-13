/**
 * The server's sentences for deliveries outside Greece (INTERNATIONAL_SHIPPING_ENABLED).
 *
 * The flag-off copy stays in `lib/shipping/destination` (`SHIPPING_COPY`),
 * untouched. Greek for Greek, English for everyone else — the same rule as
 * `shippingCopy`. The form carries the same sentences in messages/*.json.
 */

import type { DhlRefusalCode } from "@/lib/shipping/courier-quote";

export type InternationalCopy = {
  zone: string;
  /** A Greek address that names a foreign country: pick the country instead. */
  foreign: string;
  country: string;
  /** ACS has no station for a Greek/Cypriot postcode. */
  unserviceable: string;
  postcode: string;
  method: string;
  /** 5xx / timeout / HDCtool down — checkout blocked for that destination. */
  unavailable: string;
  refused: Record<DhlRefusalCode, string>;
};

export const INTERNATIONAL_COPY: Record<"el" | "en", InternationalCopy> = {
  el: {
    zone: "Αποστολές σε Ελλάδα, Κύπρο και χώρες της ΕΕ",
    foreign:
      "Η διεύθυνση είναι εκτός Ελλάδας. Επιλέξτε τη χώρα παράδοσης — αποστέλλουμε σε Ελλάδα, Κύπρο και χώρες της ΕΕ.",
    country: "Δεν αποστέλλουμε σε αυτή τη χώρα. Αποστέλλουμε σε Ελλάδα, Κύπρο και χώρες της ΕΕ.",
    unserviceable:
      "Ο Τ.Κ. δεν αντιστοιχεί σε περιοχή που εξυπηρετούμε. Για παράδοση εκτός Ελλάδας επιλέξτε τη χώρα.",
    postcode: "Ο Τ.Κ. δεν έχει τη μορφή της χώρας που επιλέξατε.",
    method: "Επιλέξτε τρόπο αποστολής για τη χώρα παράδοσης.",
    unavailable: "Δεν ήταν δυνατός ο υπολογισμός μεταφορικών — δοκιμάστε ξανά",
    refused: {
      unserviceable_postcode: "Η DHL δεν εξυπηρετεί αυτόν τον Τ.Κ.",
      unsupported_country: "Δεν αποστέλλουμε σε αυτή τη χώρα.",
      invalid_postcode: "Ο Τ.Κ. δεν είναι έγκυρος για τη χώρα που επιλέξατε.",
      invalid_address: "Ελέγξτε τον Τ.Κ. και την πόλη της διεύθυνσης.",
    },
  },
  en: {
    zone: "We ship to Greece, Cyprus and the EU.",
    foreign:
      "This address is outside Greece. Choose the delivery country — we ship to Greece, Cyprus and the EU.",
    country: "We do not ship to this country. We ship to Greece, Cyprus and the EU.",
    unserviceable:
      "This postcode is not in an area we deliver to. For delivery outside Greece, choose the country.",
    postcode: "This postcode does not match the format of the country you chose.",
    method: "Choose a delivery method for the delivery country.",
    unavailable: "Shipping could not be calculated — please try again",
    refused: {
      unserviceable_postcode: "DHL does not deliver to this postcode.",
      unsupported_country: "We do not ship to this country.",
      invalid_postcode: "This postcode is not valid for the country you chose.",
      invalid_address: "Please check the postcode and the city of the address.",
    },
  },
};

export function internationalCopy(locale: string | null | undefined): InternationalCopy {
  return locale === "el" || !locale ? INTERNATIONAL_COPY.el : INTERNATIONAL_COPY.en;
}
