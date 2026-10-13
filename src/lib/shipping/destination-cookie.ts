import "server-only";
import { cookies } from "next/headers";
import { isInternationalShippingEnabled } from "@/lib/shipping/flag";
import { normalizeCountry, validateCountryPostcode } from "@/lib/shipping/countries";

/**
 * The delivery destination abroad, remembered between the checkout form and
 * the page around it (INTERNATIONAL_SHIPPING_ENABLED only).
 *
 * The form asks `quoteDelivery` for a DHL price as soon as a country, Τ.Κ. and
 * city are typed; the action writes them here so the summary beside the form
 * re-renders priced for the same place. A cookie rather than a query string: a
 * postcode is part of an address and does not belong in URLs and logs.
 *
 * Never read with the flag off, and never holds Greece — at home the page is
 * exactly what it was.
 */
export const DESTINATION_COOKIE = "KOLLERIS_DEST";

/** `postcode` is "" until a valid one for `country` has been typed. */
export type StoredDestination = { country: string; postcode: string; city: string };

/** Pure, for the tests: the cookie's value back into a destination, or null. */
export function parseDestination(value: string | null | undefined): StoredDestination | null {
  if (!value) return null;
  try {
    const raw = JSON.parse(value) as Partial<StoredDestination>;
    const country = normalizeCountry(raw.country ?? "", true);
    if (!country || country === "GR") return null;
    // A country chosen before its Τ.Κ. is typed (or with a malformed one) is
    // kept, with no postcode: the page asks for one instead of pricing.
    const postcode = validateCountryPostcode(country, raw.postcode ?? "");
    const city = typeof raw.city === "string" ? raw.city.trim().slice(0, 120) : "";
    return { country, postcode: postcode.ok ? postcode.postcode : "", city };
  } catch {
    return null;
  }
}

export async function readDestination(): Promise<StoredDestination | null> {
  if (!isInternationalShippingEnabled()) return null;
  const store = await cookies();
  return parseDestination(store.get(DESTINATION_COOKIE)?.value);
}

/** Null forgets it — the customer chose Greece again. */
export async function writeDestination(destination: StoredDestination | null): Promise<void> {
  const store = await cookies();
  if (!destination) {
    store.delete(DESTINATION_COOKIE);
    return;
  }
  store.set(DESTINATION_COOKIE, JSON.stringify(destination), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
