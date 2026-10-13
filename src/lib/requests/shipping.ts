import "server-only";
import { prisma } from "@/lib/prisma";
import { FREE_SHIPPING_THRESHOLD_NET, SHIPPING_METHODS, findShippingMethod } from "@/lib/cart/options";
import { isUnserviceable, quoteLivePostage } from "@/lib/shipping/acs-live";
import {
  isDhlQuote,
  isQuoteUnavailable,
  isRefused,
  quoteDestination,
  type DhlQuote,
} from "@/lib/shipping/courier-quote";
import type { ParcelItem } from "@/lib/shipping/acs-tariff";
import { priceLines, type PricedLine } from "@/lib/requests/model";

/**
 * Postage for an offer HDCtool did not price (contract §4: `shippingNet`
 * absent → the shop's normal ACS quote for the offered lines and the order's
 * postcode).
 *
 * "Normal" means exactly what the checkout does: the parcel from each product's
 * weight and dimensions, ACS live with the table as fallback, the express
 * multiplier, and free delivery over the threshold for the methods that offer
 * it. Collection from the shop costs nothing.
 *
 * A request abroad (docs/dhl-express.md) is priced by the same quote the
 * checkout uses: DHL Express through HDCtool for the EU, ACS for Cyprus; no
 * table, never free. Greece is the call below, unchanged.
 */
export async function quoteOfferShipping(
  order: {
    shippingMethod: string;
    shipPostcode: string;
    shipCountry?: string | null;
    shipCity?: string | null;
  },
  lines: ReadonlyArray<PricedLine & { mtrl: number | null }>,
): Promise<
  | { ok: true; shippingNet: number; dhl?: DhlQuote }
  | { ok: false; reason: "unserviceable" | "unavailable" }
> {
  const method = findShippingMethod(order.shippingMethod) ?? SHIPPING_METHODS[0];
  if (method.expressMultiplier <= 0) return { ok: true, shippingNet: 0 };

  const mtrls = [...new Set(lines.map((l) => l.mtrl).filter((m): m is number => m != null))];
  const products = mtrls.length
    ? await prisma.product.findMany({
        where: { mtrl: { in: mtrls } },
        select: { mtrl: true, weight: true, width: true, length: true, height: true },
      })
    : [];
  const byMtrl = new Map(products.map((p) => [p.mtrl, p]));
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const items: ParcelItem[] = lines.map((line) => {
    const p = line.mtrl != null ? byMtrl.get(line.mtrl) : undefined;
    return {
      quantity: line.qty,
      weight: num(p?.weight),
      width: num(p?.width),
      length: num(p?.length),
      height: num(p?.height),
    };
  });

  const country = (order.shipCountry ?? "GR").toUpperCase();
  const subtotal = priceLines(lines, 0);
  const live =
    country === "GR"
      ? await quoteLivePostage({ items, postcode: order.shipPostcode })
      : await quoteDestination({
          country,
          postcode: order.shipPostcode,
          city: order.shipCity,
          items,
          declaredValue: subtotal.subtotalGross,
        });
  if (isUnserviceable(live) || isRefused(live)) return { ok: false, reason: "unserviceable" };
  if (isQuoteUnavailable(live)) return { ok: false, reason: "unavailable" };
  if (isDhlQuote(live)) {
    // DHL: HDCtool's price as it is — no multiplier, no free threshold.
    return { ok: true, shippingNet: live.totalNet, dhl: live };
  }

  const subtotalNet = subtotal.subtotalNet;
  if (method.freeOverThreshold && subtotalNet >= FREE_SHIPPING_THRESHOLD_NET) {
    return { ok: true, shippingNet: 0 };
  }
  const quoted = Math.round(live.totalNet * method.expressMultiplier * 100) / 100;
  return { ok: true, shippingNet: quoted };
}
