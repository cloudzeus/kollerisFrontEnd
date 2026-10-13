"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routing, type Locale } from "@/i18n/routing";
import { getCart } from "@/lib/cart/cart";
import { isUnserviceable, quoteLivePostage } from "@/lib/shipping/acs-live";
import { validatePostcode } from "@/lib/shipping/destination";
import { normalizeCountry, validateCountryPostcode } from "@/lib/shipping/countries";
import {
  isDhlQuote,
  isQuoteUnavailable,
  isRefused,
  quoteDestination,
  type DhlRefusalCode,
} from "@/lib/shipping/courier-quote";
import { writeDestination } from "@/lib/shipping/destination-cookie";
import { isInternationalShippingEnabled } from "@/lib/shipping/flag";
import { vatRateForDestination } from "@/lib/shipping/vat";

/**
 * Does ACS deliver to this postcode? Asked by the checkout form as soon as a
 * complete Τ.Κ. is typed, so the customer hears «we do not deliver there»
 * before filling in the rest — not after pressing «Ολοκλήρωση».
 *
 * Only a definite "no" from ACS says no. When HDCtool or ACS cannot be
 * reached the answer is yes: the same rule as checkout, where an outage
 * prices from the table rather than stopping the sale. `placeOrder` asks
 * again and is the one that decides.
 */
export async function checkDeliveryPostcode(input: unknown): Promise<{ serviceable: boolean }> {
  const parsed = z.object({ postcode: z.string().max(16) }).safeParse(input);
  if (!parsed.success) return { serviceable: false };

  const checked = validatePostcode(parsed.data.postcode);
  if (!checked.ok) return { serviceable: false };

  // The station is what matters here, not the price: an empty parcel is
  // priced at ACS's 0,5 kg minimum.
  const quote = await quoteLivePostage({ items: [], postcode: checked.postcode });
  return { serviceable: !isUnserviceable(quote) };
}

/**
 * What delivery abroad costs — asked by the checkout form when the customer
 * has chosen a country other than Greece (INTERNATIONAL_SHIPPING_ENABLED only)
 * and typed a Τ.Κ. Shown as «DHL Express · παράδοση σε X–Y εργάσιμες».
 *
 * An estimate for the screen, priced on the whole basket. `placeOrder` asks
 * HDCtool again for the lines it actually ships and charges THAT; nothing
 * returned here is ever sent back as a price.
 *
 * Also remembers the destination (`destination-cookie`) so the order summary
 * beside the form re-renders priced for the same place.
 */
export type DeliveryQuoteAnswer =
  | {
      status: "ok";
      carrier: "ACS" | "DHL";
      netAmount: number;
      grossAmount: number;
      /** «2–3» working days. */
      etaDays: string;
    }
  | { status: "refused"; code: DhlRefusalCode | "unserviceable" }
  | { status: "unavailable" }
  | { status: "pending" }
  | { status: "home" }
  | { status: "disabled" };

export async function quoteDelivery(input: unknown): Promise<DeliveryQuoteAnswer> {
  if (!isInternationalShippingEnabled()) return { status: "disabled" };

  const parsed = z
    .object({
      country: z.string().trim().max(2),
      postcode: z.string().trim().max(16),
      city: z.string().trim().max(120).optional(),
      locale: z.string().max(5).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { status: "refused", code: "invalid_postcode" };

  const country = normalizeCountry(parsed.data.country, true);
  if (!country) return { status: "refused", code: "unsupported_country" };
  if (country === "GR") {
    // Home: the ACS check above answers, and the page goes back to Greek pricing.
    await writeDestination(null);
    revalidatePath("/", "layout");
    return { status: "home" };
  }
  if (!parsed.data.postcode) return { status: "pending" };

  const checked = validateCountryPostcode(country, parsed.data.postcode);
  if (!checked.ok) return { status: "refused", code: "invalid_postcode" };

  const locale = (routing.locales.includes(parsed.data.locale as Locale)
    ? parsed.data.locale
    : routing.defaultLocale) as Locale;
  const cart = await getCart(locale);
  if (!cart || cart.lines.length === 0) return { status: "pending" };

  const city = parsed.data.city ?? "";
  const quote = await quoteDestination({
    country,
    postcode: checked.postcode,
    city,
    items: cart.lines.map((l) => ({
      quantity: l.quantity,
      weight: l.weight,
      width: l.width,
      length: l.length,
      height: l.height,
    })),
    declaredValue: cart.totals.subtotalGross,
  });

  if (isUnserviceable(quote)) return { status: "refused", code: "unserviceable" };
  if (isRefused(quote)) return { status: "refused", code: quote.error };
  if (isQuoteUnavailable(quote)) return { status: quote.pending ? "pending" : "unavailable" };

  await writeDestination({ country, postcode: checked.postcode, city });
  revalidatePath("/", "layout");

  const netAmount = quote.totalNet;
  const vatRate = vatRateForDestination(country);
  return {
    status: "ok",
    carrier: isDhlQuote(quote) ? "DHL" : "ACS",
    netAmount,
    grossAmount: Math.round(netAmount * (1 + vatRate / 100) * 100) / 100,
    etaDays: quote.etaDays,
  };
}
