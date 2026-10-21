import "server-only";
import { computeTotals, type CartDestination } from "@/lib/cart/cart";
import type { AnyShippingMethodId, CartLineView, CartTotals, PaymentMethodId } from "@/lib/cart/options";
import { buildBreakdown, type CheckoutBreakdown } from "@/lib/requests/breakdown";
import { splitCart } from "@/lib/requests/model";

/**
 * The checkout breakdown, priced by the server (docs/backorder-requests.md §1).
 *
 * The «now» half is `computeTotals` on the in-stock lines with the same
 * method, payment and destination `placeOrder` uses for the paid order — one
 * formula, so what the option card and the pay button say is what Viva is
 * asked for. Null for an ordinary cart: nothing about it changes.
 */
export async function checkoutBreakdown(input: {
  lines: CartLineView[];
  cartTotals: CartTotals;
  shippingMethod: AnyShippingMethodId;
  paymentMethod: PaymentMethodId;
  postcode?: string | null;
  destination?: CartDestination;
}): Promise<CheckoutBreakdown | null> {
  const split = splitCart(input.lines);
  if (split.kind === "none") return null;
  const nowTotals =
    split.kind === "mixed"
      ? await computeTotals(
          split.ready,
          input.shippingMethod,
          input.paymentMethod,
          input.postcode,
          input.destination,
        )
      : null;
  return buildBreakdown({
    lines: input.lines,
    shippingMethod: input.shippingMethod,
    paymentMethod: input.paymentMethod,
    postcode: input.postcode ?? null,
    cartTotals: input.cartTotals,
    nowTotals,
  });
}
