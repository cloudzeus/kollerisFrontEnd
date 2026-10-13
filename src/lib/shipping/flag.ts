/**
 * INTERNATIONAL_SHIPPING_ENABLED — the switch for the country selector and DHL
 * Express to the rest of the EU (docs/dhl-express.md §4).
 *
 * Off unless it says so («on», «true», «1», «yes»). Off means the shop behaves
 * exactly as it did before: no country field, Greece only, and the Greek-only
 * address checks of `lib/shipping/destination` (43abb07 / 8c62e87).
 *
 * Read on the server at call time — never inlined into a client bundle. Pages
 * pass the answer down to the form as a prop; the server action reads it again
 * and is the one that decides.
 */
export function isInternationalShippingEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = (env.INTERNATIONAL_SHIPPING_ENABLED ?? "").trim().toLowerCase();
  return raw === "on" || raw === "true" || raw === "1" || raw === "yes";
}
