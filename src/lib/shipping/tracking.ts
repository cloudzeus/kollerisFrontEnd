import { z } from "zod";

/**
 * Who carries a parcel that has left, and where the customer follows it.
 *
 * HDCtool's `order-shipped` webhook (docs/dhl-express.md §3) carries, for a
 * DHL shipment, `carrier: "DHL"` and `trackingUrl`; `voucherNo` is then the DHL
 * AWB. For ACS the body is exactly what it always was — no carrier field — and
 * every link stays the ACS one.
 *
 * The AWB is kept in the order's courier-number column (`acsVoucherNo`, the
 * one every page and email already reads); the carrier and DHL's link are kept
 * beside the DHL quote in `shippingQuote.shipment`. No migration.
 *
 * Pure and client-safe.
 */

export const ACS_TRACKING_BASE = "https://www.acscourier.net/el/track-and-trace/?paramtracknr=";
export const DHL_TRACKING_BASE =
  "https://www.dhl.com/gr-el/home/tracking/tracking-express.html?submit=1&tracking-id=";

export const acsTrackingUrl = (voucherNo: string) => `${ACS_TRACKING_BASE}${encodeURIComponent(voucherNo)}`;
export const dhlTrackingUrl = (awb: string) => `${DHL_TRACKING_BASE}${encodeURIComponent(awb)}`;

/**
 * The webhook body. `carrier` and `trackingUrl` are optional, so an ACS body
 * from before DHL parses exactly as before; anything else in them is refused.
 */
export const orderShippedSchema = z.object({
  orderNumber: z.string().trim().min(1).max(32),
  voucherNo: z.string().trim().min(1).max(64),
  pickupDate: z.string().trim().max(10).nullish(),
  carrier: z.enum(["ACS", "DHL"]).optional(),
  trackingUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => /^https:\/\/[^\s]+$/i.test(v), "trackingUrl must be an https URL")
    .optional(),
});
export type OrderShippedPayload = z.infer<typeof orderShippedSchema>;

export type StoredShipment = { carrier: "DHL"; awb: string; trackingUrl: string; at: string };

/** `shippingQuote` with the DHL shipment added; everything else kept as it was. */
export function withShipment(shippingQuote: unknown, shipment: StoredShipment): Record<string, unknown> {
  const base =
    shippingQuote && typeof shippingQuote === "object" && !Array.isArray(shippingQuote)
      ? (shippingQuote as Record<string, unknown>)
      : {};
  return { ...base, shipment };
}

type ShipmentOrder = {
  shippingMethod?: string | null;
  shippingQuote?: unknown;
};

function storedShipment(order: ShipmentOrder): Partial<StoredShipment> | null {
  const quote = order.shippingQuote as { shipment?: Partial<StoredShipment> } | null | undefined;
  return quote && typeof quote === "object" && quote.shipment && typeof quote.shipment === "object"
    ? quote.shipment
    : null;
}

/** A DHL parcel: shipped as DHL, or ordered as DHL Express abroad. */
export function isDhlShipment(order: ShipmentOrder): boolean {
  const quote = order.shippingQuote as { carrier?: unknown } | null | undefined;
  return (
    storedShipment(order)?.carrier === "DHL" ||
    order.shippingMethod === "dhl" ||
    (quote != null && typeof quote === "object" && quote.carrier === "DHL")
  );
}

export type Tracking = { carrier: "ACS" | "DHL"; courier: "ACS Courier" | "DHL Express"; url: string };

/**
 * The link for the customer. DHL: the URL HDCtool sent, else DHL's public
 * tracker for the AWB. Anything else: ACS, as before.
 */
export function trackingFor(order: ShipmentOrder, voucherNo: string): Tracking {
  if (!isDhlShipment(order)) {
    return { carrier: "ACS", courier: "ACS Courier", url: acsTrackingUrl(voucherNo) };
  }
  const stored = storedShipment(order)?.trackingUrl;
  const url = typeof stored === "string" && /^https:\/\//i.test(stored) ? stored : dhlTrackingUrl(voucherNo);
  return { carrier: "DHL", courier: "DHL Express", url };
}
