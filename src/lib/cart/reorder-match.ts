import type { ReorderPlan, ReorderSkip, ReorderPriceChange } from "@/lib/cart/reorder";

/** Just enough of an order line to decide with. */
export type ReorderSourceLine = {
  productId: string | null;
  mtrl: number | null;
  sku: string;
  name: string;
  quantity: number;
  unitNet: unknown;
};

/** Just enough of a live product to decide with. */
export type ReorderCandidate = {
  id: string;
  mtrl: number;
  code: string;
  code2: string;
  priceNet: unknown;
};

/**
 * The whole decision, as a pure function.
 *
 * Split out from the query deliberately. What makes a reorder right or wrong is
 * entirely in here — which product a two-year-old line still points at, and
 * what happens when it points at nothing — and none of it needs a database to
 * be checked. The alternative is verifying the delisted and repriced branches
 * against live data, which means editing the shop's real catalogue to make a
 * test case. That is not a trade worth making for a green tick.
 */
export function matchOrderLines(
  lines: ReorderSourceLine[],
  products: ReorderCandidate[],
): Omit<ReorderPlan, "orderNumber"> {
  const byId = new Map(products.map((p) => [p.id, p]));
  const byMtrl = new Map(products.map((p) => [p.mtrl, p]));
  const byCode = new Map<string, ReorderCandidate>();
  for (const p of products) {
    // `code2` first: it is the manufacturer's number, which is what the order
    // line stored. Never overwrite a hit — the first product to claim a code
    // wins, and a duplicate code is a catalogue fault, not a choice to make here.
    if (p.code2 && !byCode.has(p.code2)) byCode.set(p.code2, p);
    if (p.code && !byCode.has(p.code)) byCode.set(p.code, p);
  }

  const add = new Map<string, { quantity: number; priceNet: number }>();
  const skipped: ReorderSkip[] = [];
  const priceChanges: ReorderPriceChange[] = [];

  for (const line of lines) {
    const product =
      (line.productId ? byId.get(line.productId) : undefined) ??
      (line.mtrl != null ? byMtrl.get(line.mtrl) : undefined) ??
      byCode.get(line.sku);

    if (!product) {
      skipped.push({ name: line.name, reason: "delisted" });
      continue;
    }

    /*
     * A product with no price is not orderable, whatever its flags say.
     *
     * The cart reads `priceNet` directly, so a null would become a €0 line and
     * a basket that quietly undercharges — the one failure mode worth being
     * strict about. `addToCart` does not check this because a product without a
     * price has no Add button to press; a reorder has no such gate, so it checks.
     */
    const now = Number(product.priceNet ?? 0);
    if (!Number.isFinite(now) || now <= 0) {
      skipped.push({ name: line.name, reason: "no_price" });
      continue;
    }

    const then = Number(line.unitNet);
    // Half a cent: below that it is rounding, not a price change.
    if (Math.abs(now - then) > 0.005) priceChanges.push({ name: line.name, then, now });

    const existing = add.get(product.id);
    add.set(product.id, { quantity: (existing?.quantity ?? 0) + line.quantity, priceNet: now });
  }

  const rows = [...add].map(([productId, row]) => ({ productId, ...row }));
  return {
    add: rows,
    units: rows.reduce((sum, r) => sum + r.quantity, 0),
    skipped,
    priceChanges,
  };
}
