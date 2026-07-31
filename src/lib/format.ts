/**
 * Price formatting. Every price in the UI goes through here — never format inline.
 *
 * ── All storefront prices are VAT-inclusive ─────────────────────────────────
 * There is no net/gross toggle and no `VatToggle` component. The original spec
 * had one; the client's decision is that the shop shows gross prices only.
 *
 * The VAT *rate* still matters: HDCtool's `VatRate` table maps SoftOne VAT codes
 * to percentages (24 / 13 / 6, plus reduced island rates) and returns the
 * resolved value on every product as `vat.percentage`. Pass it — a hardcoded
 * 1.24 would silently misprice every reduced-rate item.
 *
 * Net amounts are still needed in two places, and only two: ERP order payloads
 * (SoftOne ITELINES carry net line prices) and internal /admin views. Those call
 * `formatNet` / `netAmount` explicitly, so a net price can never leak into the
 * storefront by forgetting a flag.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** Fallback when a product carries no resolvable VAT code. */
export const DEFAULT_VAT_RATE = 24;

/** Non-breaking space — required before €, prevents the amount wrapping away. */
/*
 * U+00A0, written as an escape ON PURPOSE.
 *
 * This was a literal " " — an ordinary space — for as long as prices have been
 * on the site, so every card wrapped as "121,78" / "€" whenever the column got
 * tight. A literal non-breaking space is invisible in a diff and one careless
 * reformat away from becoming a normal space again; the escape cannot rot.
 */
const NBSP = "\u00A0";

export type PriceContext = {
  /** Product's real VAT percentage, e.g. 24 | 13 | 6. */
  vatRate?: number;
  /**
   * Partner/B2B multiplier, resolved SERVER-SIDE from the customer's price tier.
   * Never derive this on the client from a guest-visible factor.
   */
  partnerFactor?: number;
};

/** Round to cents without binary-float drift (1.005 → 1.01, not 1.00). */
function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Net price after the partner tier, before VAT. ERP and /admin only. */
export function netAmount(net: number, { partnerFactor = 1 }: PriceContext = {}): number {
  return roundCents(net * partnerFactor);
}

/** Net price → the gross amount shown to the customer. */
export function grossAmount(
  net: number,
  { vatRate = DEFAULT_VAT_RATE, partnerFactor = 1 }: PriceContext = {},
): number {
  return roundCents(net * partnerFactor * (1 + vatRate / 100));
}

/**
 * Format an already-resolved amount in el-GR convention: `1.234,56 €`
 * (dot thousands, comma decimals, NBSP before the symbol).
 *
 * Formatted manually rather than via `Intl.NumberFormat` because ICU output
 * differs across Node and browser versions, which would produce React
 * hydration mismatches on every price on the page.
 */
export function formatMoney(amount: number): string {
  const negative = amount < 0;
  const [whole, decimals] = roundCents(Math.abs(amount)).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${grouped},${decimals}${NBSP}€`;
}

/**
 * The storefront entry point. Always VAT-inclusive.
 *
 *   formatPrice(100)                        → '124,00 €'
 *   formatPrice(100, { vatRate: 13 })       → '113,00 €'
 *   formatPrice(100, { partnerFactor: .88 })→ '109,12 €'
 */
export function formatPrice(net: number, ctx: PriceContext = {}): string {
  return formatMoney(grossAmount(net, ctx));
}

/** Net formatting for ERP payloads and /admin. Never for the storefront. */
export function formatNet(net: number, ctx: PriceContext = {}): string {
  return formatMoney(netAmount(net, ctx));
}

/**
 * Savings between a "was" and a "now" net price, shown gross like everything else.
 * Returns null when there is no real discount — callers must render nothing
 * rather than an empty-but-styled wrapper (spec §4, PriceBox).
 */
export function savingsOf(
  netWas: number,
  netNow: number,
  ctx: PriceContext = {},
): { amount: number; percent: number; formatted: string } | null {
  if (!(netWas > netNow)) return null;

  const was = grossAmount(netWas, ctx);
  const now = grossAmount(netNow, ctx);
  const amount = roundCents(was - now);
  if (amount <= 0) return null;

  return {
    amount,
    percent: Math.round((amount / was) * 100),
    formatted: formatMoney(amount),
  };
}

/** `formatPercent(12)` → '-12%' — for discount chips. */
export function formatPercent(percent: number): string {
  return `-${Math.round(percent)}%`;
}
