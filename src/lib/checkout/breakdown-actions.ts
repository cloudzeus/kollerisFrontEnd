"use server";

import { z } from "zod";
import { routing, type Locale } from "@/i18n/routing";
import { getCart } from "@/lib/cart/cart";
import { PAYMENT_METHODS, SHIPPING_METHODS } from "@/lib/cart/options";
import { validatePostcode } from "@/lib/shipping/destination";
import { checkoutBreakdown } from "@/lib/requests/checkout-breakdown";
import type { CheckoutBreakdown } from "@/lib/requests/breakdown";

/**
 * The split-checkout breakdown for the Τ.Κ. the customer has just typed
 * (Greece; abroad the page re-renders priced for the remembered destination).
 *
 * The page prices the «now» half for the mainland zone until a postcode is
 * known; an island or a remote area costs more, and the option card and the
 * pay button must not promise a figure `placeOrder` will not charge. This asks
 * the same `computeTotals` again, for that postcode and the methods the form
 * shows. Nothing returned here is ever sent back as a price — `placeOrder`
 * prices from scratch and is the authority.
 */
export async function quoteCheckoutBreakdown(input: unknown): Promise<CheckoutBreakdown | null> {
  const parsed = z
    .object({
      locale: z.string().max(5),
      postcode: z.string().max(16),
      shippingMethod: z.string().max(32),
      paymentMethod: z.string().max(32),
    })
    .safeParse(input);
  if (!parsed.success) return null;

  const checked = validatePostcode(parsed.data.postcode);
  if (!checked.ok) return null;
  const locale = (routing.locales.includes(parsed.data.locale as Locale)
    ? parsed.data.locale
    : routing.defaultLocale) as Locale;
  const shipping = SHIPPING_METHODS.find((m) => m.id === parsed.data.shippingMethod);
  const payment = PAYMENT_METHODS.find((m) => m.id === parsed.data.paymentMethod);
  if (!shipping || !payment) return null;

  const cart = await getCart(locale, checked.postcode);
  if (!cart || cart.lines.length === 0) return null;
  return checkoutBreakdown({
    lines: cart.lines,
    cartTotals: cart.totals,
    shippingMethod: shipping.id,
    paymentMethod: payment.id,
    postcode: checked.postcode,
  });
}
