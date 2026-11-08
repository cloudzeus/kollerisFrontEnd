/**
 * GA4 ecommerce events (view_item → add_to_cart → begin_checkout → purchase).
 *
 * Only these four: they are what GA4's built-in "Purchase journey" funnel and
 * the revenue figures read, and what HDCtool's marketing page compares against
 * Google Ads spend. Prices are NET (χωρίς ΦΠΑ), like Google Ads costs, so ROAS
 * compares like with like. `item_id` is the ERP code — the same `sku` the order
 * line stores.
 *
 * `gtag`/`fbq` exist only in production (see `GoogleAnalytics`, `MetaPixel`),
 * and they obey the consent already set there, so nothing here checks consent.
 */

export type Ga4Item = {
  item_id: string;
  item_name: string;
  item_brand?: string;
  price?: number;
  quantity?: number;
};

type Gtag = (command: "event", name: string, params: Record<string, unknown>) => void;

type Fbq = (command: "track", name: string, params: Record<string, unknown>, opts?: { eventID: string }) => void;

/** Τα ίδια τέσσερα βήματα με τα standard events του Meta Pixel. */
export const META_EVENT: Record<string, string> = {
  view_item: "ViewContent",
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
  purchase: "Purchase",
};

/** Παράμετροι Meta από τις παραμέτρους GA4 (ίδια αξία χωρίς ΦΠΑ, ίδιοι κωδικοί ERP). */
export function metaParams(params: { value?: number; items: Ga4Item[] }): Record<string, unknown> {
  return {
    currency: "EUR",
    value: params.value ?? itemsValue(params.items),
    content_type: "product",
    content_ids: params.items.map((i) => i.item_id),
    contents: params.items.map((i) => ({ id: i.item_id, quantity: i.quantity ?? 1, item_price: i.price })),
    num_items: params.items.reduce((s, i) => s + (i.quantity ?? 1), 0),
  };
}

/**
 * Ένα γεγονός και στο GA4 και στο Meta Pixel. Και τα δύο σέβονται τη
 * συγκατάθεση μόνα τους (Consent Mode / το Pixel φορτώνει μόνο με «Αποδοχή»).
 */
export function ga4Event(name: string, params: { value?: number; items: Ga4Item[]; [k: string]: unknown }): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { gtag?: Gtag; fbq?: Fbq };
  if (typeof w.gtag === "function") w.gtag("event", name, { currency: "EUR", ...params });
  const meta = META_EVENT[name];
  if (meta && typeof w.fbq === "function") {
    // eventID = αριθμός παραγγελίας, ώστε ένα μελλοντικό Conversions API να μη διπλομετρά.
    const id = typeof params.transaction_id === "string" ? { eventID: `purchase-${params.transaction_id}` } : undefined;
    w.fbq("track", meta, metaParams(params), id);
  }
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
