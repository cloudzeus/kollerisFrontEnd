/**
 * GA4 ecommerce events (view_item → add_to_cart → begin_checkout → purchase).
 *
 * Only these four: they are what GA4's built-in "Purchase journey" funnel and
 * the revenue figures read, and what HDCtool's marketing page compares against
 * Google Ads spend. Prices are NET (χωρίς ΦΠΑ), like Google Ads costs, so ROAS
 * compares like with like. `item_id` is the ERP code — the same `sku` the order
 * line stores.
 *
 * `gtag` exists only in production (see `GoogleAnalytics`), and it obeys the
 * consent mode already set there, so nothing here needs its own consent check.
 */

export type Ga4Item = {
  item_id: string;
  item_name: string;
  item_brand?: string;
  price?: number;
  quantity?: number;
};

type Gtag = (command: "event", name: string, params: Record<string, unknown>) => void;

export function ga4Event(name: string, params: { value?: number; items: Ga4Item[]; [k: string]: unknown }): void {
  if (typeof window === "undefined") return;
  const gtag = (window as unknown as { gtag?: Gtag }).gtag;
  if (typeof gtag !== "function") return;
  gtag("event", name, { currency: "EUR", ...params });
}

/** Sum of price × quantity, rounded to cents. */
export function itemsValue(items: Ga4Item[]): number {
  return Math.round(items.reduce((s, i) => s + (i.price ?? 0) * (i.quantity ?? 1), 0) * 100) / 100;
}

/** After a successful add-to-cart server action that returned its item. */
export function trackAddToCart(result: { ok: boolean; item?: Ga4Item }): void {
  if (!result.ok || !result.item) return;
  ga4Event("add_to_cart", { value: itemsValue([result.item]), items: [result.item] });
}
