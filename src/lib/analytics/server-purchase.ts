import { createHash } from "node:crypto";
import { asOrderAttribution, type OrderAttribution } from "@/lib/analytics/attribution";
import { metaParams, type Ga4Item } from "@/lib/analytics/ga4-events";

/*
 * Η αγορά από τον server, τη στιγμή που η παραγγελία γίνεται ΠΛΗΡΩΜΕΝΗ.
 *
 * Γιατί: η σελίδα επιβεβαίωσης δεν φορτώνει πάντα μετά την πληρωμή (κάρτα που
 * κλείνει το παράθυρο στη Viva, κατάθεση στην τράπεζα μέρες μετά), και τότε το
 * GA4, το Google Ads και η Meta δεν μαθαίνουν ποτέ την πώληση. Από εδώ φτάνει
 * κάθε πληρωμένη παραγγελία, με το client_id/session του browser που την έκανε,
 * ώστε να χρεωθεί στη σωστή καμπάνια.
 *
 * Μόνο με συγκατάθεση (`orders.attribution`, βλ. attribution.ts). Όταν ο server
 * στέλνει ένα κανάλι, η σελίδα επιβεβαίωσης δεν στέλνει το ίδιο (`purchaseChannels`),
 * για να μη μετρηθεί δύο φορές.
 */

const GA4_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "G-EGS1JNM4EC";
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";
const GRAPH = "https://graph.facebook.com/v24.0";

const ga4Secret = () => process.env.GA4_API_SECRET?.trim() || "";
const metaToken = () => process.env.META_CAPI_TOKEN?.trim() || "";

/** Ποια κανάλια στέλνει ο server για αυτή την παραγγελία. */
export function purchaseChannels(attribution: unknown): { ga4: boolean; meta: boolean } {
  const a = asOrderAttribution(attribution);
  return {
    ga4: Boolean(a?.gaClientId && ga4Secret()),
    meta: Boolean(a && metaToken() && /^\d{6,20}$/.test(PIXEL_ID)),
  };
}

export type PurchaseOrder = {
  orderNumber: string;
  subtotalNet: unknown;
  vatAmount: unknown;
  shippingGross: unknown;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  shipCity: string;
  shipPostcode: string;
  shipCountry: string;
  paidAt: Date | null;
  attribution: unknown;
  lines: { sku: string; mtrl: number | null; name: string; brand: string | null; unitNet: unknown; discountPercent: unknown; quantity: number }[];
};

export function purchaseItems(order: PurchaseOrder): Ga4Item[] {
  return order.lines.map((l) => ({
    item_id: l.sku,
    catalog_id: l.mtrl != null ? String(l.mtrl) : undefined,
    item_name: l.name,
    item_brand: l.brand ?? undefined,
    price: Math.round(Number(l.unitNet) * (100 - Number(l.discountPercent))) / 100,
    quantity: l.quantity,
  }));
}

/** Measurement Protocol: ίδιες τιμές με το `purchase` της σελίδας (καθαρά, χωρίς ΦΠΑ). */
export function ga4PurchaseBody(order: PurchaseOrder, a: OrderAttribution) {
  return {
    client_id: a.gaClientId,
    consent: { ad_user_data: "GRANTED", ad_personalization: "GRANTED" },
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: order.orderNumber,
          currency: "EUR",
          value: Number(order.subtotalNet),
          tax: Number(order.vatAmount),
          shipping: Number(order.shippingGross),
          items: purchaseItems(order).map(({ catalog_id: _c, ...i }) => i),
          ...(a.gaSessionId ? { session_id: a.gaSessionId } : {}),
          engagement_time_msec: 1,
        },
      },
    ],
  };
}

const sha = (v: string | undefined) => (v ? createHash("sha256").update(v).digest("hex") : undefined);
const lower = (v: string) => v.trim().toLowerCase();

/** Τηλέφωνο E.164 χωρίς «+», όπως το θέλει η Meta: ελληνικό 10ψήφιο → 30… */
export function normalisePhone(phone: string, country: string): string | undefined {
  const d = phone.replace(/\D/g, "").replace(/^00/, "");
  if (!d) return undefined;
  if (country.toUpperCase() === "GR" && d.length === 10) return `30${d}`;
  return d;
}

/** Conversions API. `event_id` ίδιο με του Pixel, ώστε η Meta να κρατήσει ένα. */
export function metaPurchaseBody(order: PurchaseOrder, a: OrderAttribution, origin: string) {
  const items = purchaseItems(order);
  const user_data: Record<string, unknown> = {
    em: [sha(lower(order.email))],
    ph: [sha(normalisePhone(order.phone, order.shipCountry))].filter(Boolean),
    fn: [sha(lower(order.firstName))],
    ln: [sha(lower(order.lastName))],
    ct: [sha(lower(order.shipCity).replace(/\s+/g, ""))],
    zp: [sha(lower(order.shipPostcode).replace(/\s+/g, ""))],
    country: [sha(lower(order.shipCountry))],
    ...(a.ip ? { client_ip_address: a.ip } : {}),
    ...(a.ua ? { client_user_agent: a.ua } : {}),
    ...(a.fbp ? { fbp: a.fbp } : {}),
    ...(a.fbc ? { fbc: a.fbc } : {}),
  };
  return {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor((order.paidAt ?? new Date()).getTime() / 1000),
        event_id: `purchase-${order.orderNumber}`,
        action_source: "website",
        event_source_url: `${origin}/checkout/epibebaiosi/${encodeURIComponent(order.orderNumber)}`,
        user_data,
        custom_data: { ...metaParams({ value: Number(order.subtotalNet), items }), order_id: order.orderNumber },
      },
    ],
  };
}

export type ServerPurchaseResult = { ga4: "sent" | "skipped" | string; meta: "sent" | "skipped" | string };

/** Ποτέ δεν πετά: η πληρωμή έγινε, η μέτρηση δεν την αναιρεί. */
export async function sendServerPurchase(order: PurchaseOrder, origin: string): Promise<ServerPurchaseResult> {
  const a = asOrderAttribution(order.attribution);
  const on = purchaseChannels(order.attribution);
  const result: ServerPurchaseResult = { ga4: "skipped", meta: "skipped" };
  if (!a) return result;

  const jobs: Promise<void>[] = [];
  if (on.ga4) {
    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(GA4_ID)}&api_secret=${encodeURIComponent(ga4Secret())}`;
    jobs.push(
      fetch(url, { method: "POST", body: JSON.stringify(ga4PurchaseBody(order, a)), signal: AbortSignal.timeout(10_000) })
        .then((r) => void (result.ga4 = r.ok ? "sent" : `HTTP ${r.status}`))
        .catch((e) => void (result.ga4 = e instanceof Error ? e.message : String(e))),
    );
  }
  if (on.meta) {
    jobs.push(
      fetch(`${GRAPH}/${PIXEL_ID}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...metaPurchaseBody(order, a, origin), access_token: metaToken() }),
        signal: AbortSignal.timeout(10_000),
      })
        .then(async (r) => void (result.meta = r.ok ? "sent" : `HTTP ${r.status} ${(await r.text()).slice(0, 200)}`))
        .catch((e) => void (result.meta = e instanceof Error ? e.message : String(e))),
    );
  }
  await Promise.all(jobs);
  return result;
}
