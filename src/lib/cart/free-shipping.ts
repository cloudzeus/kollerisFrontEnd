import "server-only";
import { cache } from "react";
import { getSettingNumber } from "@/lib/settings/settings";
import { DEFAULT_FREE_SHIPPING_THRESHOLD_NET } from "@/lib/cart/options";

/**
 * The free-shipping threshold in force, NET, from the admin setting
 * `shop.freeShippingNet` (a saved row, else `.env`, else 150).
 *
 * Every surface that states or applies the threshold reads it here: the cart
 * and checkout totals, the progress bars (via the totals), the homepage and
 * zone copy, the FAQ, the SEO copy and schema, and llms.txt. A threshold read
 * in one place and hardcoded in another is a public promise the checkout
 * refuses to keep.
 *
 * A blank, negative or non-numeric value falls back to the default rather than
 * making shipping free for everybody. Zero is honoured — that is a deliberate
 * "always free". A database error also falls back: a settings read must not
 * take the storefront down with it.
 */
export const getFreeShippingThresholdNet = cache(async (): Promise<number> => {
  try {
    const value = await getSettingNumber("shop.freeShippingNet");
    return value != null && value >= 0 ? value : DEFAULT_FREE_SHIPPING_THRESHOLD_NET;
  } catch (error) {
    console.error("[free-shipping] could not read shop.freeShippingNet", error);
    return DEFAULT_FREE_SHIPPING_THRESHOLD_NET;
  }
});
