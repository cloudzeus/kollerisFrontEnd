/**
 * The VAT rate on postage (and on any fee) for a delivery country.
 *
 * ONE place, on purpose (docs/dhl-express.md, business decisions): a customer
 * in another EU country pays Greek VAT, 24%, exactly as a customer in Greece
 * does. If the shop registers for OSS (One-Stop Shop) this is where the
 * destination country's rate comes in — OSS may change this later, and every
 * caller already asks here rather than writing 24.
 *
 * Pure and client-safe.
 */
export function vatRateForDestination(country: string | null | undefined): number {
  void country;
  return 24;
}
