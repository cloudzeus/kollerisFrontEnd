import { splitCart, type CartSplitKind, type StockFacts } from "@/lib/requests/model";

/**
 * What a cart with back-order lines becomes, in numbers — the pure half.
 *
 * The checkout shows the customer, before they choose, what each choice costs:
 *
 *   split     «Πληρώνετε τώρα X € — N είδη + μεταφορικά Y €» and
 *             «Κατόπιν παραγγελίας: M είδη, ενδεικτική αξία Z €»
 *   together  «Δεν πληρώνετε τώρα — όλο το καλάθι (ενδεικτική αξία W €)»
 *
 * The «now» figures are NOT added up here. They are the cart's own
 * `computeTotals` run on the in-stock lines only — the very call `placeOrder`
 * makes for the paid half — so the postage, the free-delivery threshold and
 * the VAT on the screen are the ones that will be charged. Splitting moves the
 * threshold: a cart over it can leave an in-stock part under it, and the
 * customer is shown that result, not the whole cart's.
 *
 * The request part is the sum of the lines as the cart priced them; it is
 * indicative (the offer sets the final price and the second shipment's
 * postage) and is labelled so everywhere.
 */

export type BreakdownLine = StockFacts & {
  id: string;
  lineNet: number;
  lineGross: number;
};

/** The paid half: exactly what the order placed now will be charged. */
export type NowPart = {
  itemCount: number;
  unitCount: number;
  lineIds: string[];
  subtotalNet: number;
  subtotalGross: number;
  shippingNet: number;
  shippingGross: number;
  paymentFeeGross: number;
  vatAmount: number;
  totalGross: number;
  /** No price for the postage (ACS has no station there / abroad unavailable). */
  unserviceable: boolean;
  /** The whole cart reached free delivery; the in-stock part alone does not. */
  thresholdLost: boolean;
};

/** A part that becomes a request: nothing is paid now, the value is indicative. */
export type RequestPart = {
  itemCount: number;
  unitCount: number;
  lineIds: string[];
  subtotalNet: number;
  subtotalGross: number;
};

export type CheckoutBreakdown = {
  kind: CartSplitKind;
  shippingMethod: string;
  paymentMethod: string;
  /** The Τ.Κ. the «now» postage was priced for; null = indicative zone. */
  postcode: string | null;
  /** Mixed cart only. */
  split: { now: NowPart; request: RequestPart } | null;
  /** Mixed or all-on-request: the whole cart as one request. */
  together: RequestPart | null;
};

/** The figures `computeTotals` returns that the breakdown reads. */
export type TotalsFacts = {
  subtotalNet: number;
  subtotalGross: number;
  shippingNet: number;
  shippingGross: number;
  paymentFeeGross: number;
  vatAmount: number;
  totalGross: number;
  unserviceable: boolean;
  quoteUnavailable?: boolean;
  freeShippingReached: boolean;
};

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function requestPart(lines: ReadonlyArray<BreakdownLine>): RequestPart {
  return {
    itemCount: lines.length,
    unitCount: lines.reduce((sum, l) => sum + l.quantity, 0),
    lineIds: lines.map((l) => l.id),
    subtotalNet: round(lines.reduce((sum, l) => sum + l.lineNet, 0)),
    subtotalGross: round(lines.reduce((sum, l) => sum + l.lineGross, 0)),
  };
}

export function nowPart(
  lines: ReadonlyArray<BreakdownLine>,
  totals: TotalsFacts,
  whole: Pick<TotalsFacts, "freeShippingReached">,
): NowPart {
  return {
    itemCount: lines.length,
    unitCount: lines.reduce((sum, l) => sum + l.quantity, 0),
    lineIds: lines.map((l) => l.id),
    subtotalNet: totals.subtotalNet,
    subtotalGross: totals.subtotalGross,
    shippingNet: totals.shippingNet,
    shippingGross: totals.shippingGross,
    paymentFeeGross: totals.paymentFeeGross,
    vatAmount: totals.vatAmount,
    totalGross: totals.totalGross,
    unserviceable: totals.unserviceable || totals.quoteUnavailable === true,
    thresholdLost: whole.freeShippingReached && !totals.freeShippingReached && totals.shippingGross > 0,
  };
}

/**
 * The breakdown, from the cart lines, the whole cart's totals and — for a
 * mixed cart — `computeTotals` of the in-stock lines (`nowTotals`).
 */
export function buildBreakdown(input: {
  lines: ReadonlyArray<BreakdownLine>;
  shippingMethod: string;
  paymentMethod: string;
  postcode: string | null;
  cartTotals: Pick<TotalsFacts, "freeShippingReached">;
  nowTotals: TotalsFacts | null;
}): CheckoutBreakdown {
  const split = splitCart(input.lines);
  return {
    kind: split.kind,
    shippingMethod: input.shippingMethod,
    paymentMethod: input.paymentMethod,
    postcode: input.postcode,
    split:
      split.kind === "mixed" && input.nowTotals
        ? {
            now: nowPart(split.ready, input.nowTotals, input.cartTotals),
            request: requestPart(split.onRequest),
          }
        : null,
    together: split.kind === "none" ? null : requestPart(input.lines),
  };
}
