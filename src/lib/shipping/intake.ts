import { isDhlCountry } from "@/lib/shipping/countries";
import { vatRateForDestination } from "@/lib/shipping/vat";

/**
 * The `shipping` block of HDCtool's order intake (docs/dhl-express.md §2).
 *
 * Only for a DHL delivery — an EU country other than Greece and Cyprus, not
 * collected from the shop. Absent on every other order, so HDCtool's intake
 * sees exactly the body it always did and treats it as ACS.
 *
 * The figures are the order's own (what the customer was charged); the
 * product code and the quote time come from the DHL quote stored with it in
 * `shippingQuote`. A back-order request still waiting for its offer has no
 * quote yet: the block then says DHL with a null product code, so HDCtool
 * knows who carries it before anyone prices it.
 */
export type ShippingIntakeBlock = {
  carrier: "DHL";
  productCode: string | null;
  netAmount: number;
  vatRate: number;
  quotedAt: string | null;
};

export function shippingIntakeBlock(order: {
  shipCountry: string | null;
  shippingMethod: string;
  /** A Prisma Decimal on the order row, a number in the tests. */
  shippingNet: number | { toFixed(digits: number): string };
  shippingQuote: unknown;
}): ShippingIntakeBlock | null {
  if (order.shippingMethod === "pickup" || !isDhlCountry(order.shipCountry)) return null;
  const stored = (order.shippingQuote ?? null) as {
    carrier?: unknown;
    productCode?: unknown;
    quotedAt?: unknown;
  } | null;
  const quote = stored?.carrier === "DHL" ? stored : null;
  return {
    carrier: "DHL",
    productCode: typeof quote?.productCode === "string" ? quote.productCode : null,
    netAmount:
      typeof order.shippingNet === "number"
        ? Math.round(order.shippingNet * 100) / 100
        : Number(order.shippingNet.toFixed(2)),
    vatRate: vatRateForDestination(order.shipCountry),
    quotedAt: typeof quote?.quotedAt === "string" ? quote.quotedAt : null,
  };
}
