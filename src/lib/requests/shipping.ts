import "server-only";
import { prisma } from "@/lib/prisma";
import { FREE_SHIPPING_THRESHOLD_NET, SHIPPING_METHODS } from "@/lib/cart/options";
import { isUnserviceable, quoteLivePostage } from "@/lib/shipping/acs-live";
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
 */
export async function quoteOfferShipping(
  order: { shippingMethod: string; shipPostcode: string },
  lines: ReadonlyArray<PricedLine & { mtrl: number | null }>,
): Promise<{ ok: true; shippingNet: number } | { ok: false; reason: "unserviceable" }> {
  const method = SHIPPING_METHODS.find((m) => m.id === order.shippingMethod) ?? SHIPPING_METHODS[0];
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

  const live = await quoteLivePostage({ items, postcode: order.shipPostcode });
  if (isUnserviceable(live)) return { ok: false, reason: "unserviceable" };

  const subtotalNet = priceLines(lines, 0).subtotalNet;
  if (method.freeOverThreshold && subtotalNet >= FREE_SHIPPING_THRESHOLD_NET) {
    return { ok: true, shippingNet: 0 };
  }
  const quoted = Math.round(live.totalNet * method.expressMultiplier * 100) / 100;
  return { ok: true, shippingNet: quoted };
}
