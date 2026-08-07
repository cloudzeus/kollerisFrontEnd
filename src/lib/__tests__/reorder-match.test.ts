import { describe, expect, it } from "vitest";
import { matchOrderLines } from "@/lib/cart/reorder-match";
import type { ReorderCandidate, ReorderSourceLine } from "@/lib/cart/reorder-match";

/**
 * What reordering an old order actually puts in the basket.
 *
 * These cases are the ones that cannot be checked against the live shop: today
 * every line of every order still resolves to a listed product at an unchanged
 * price, so the delisted, unpriced and repriced branches would need somebody to
 * edit the real catalogue to produce a test case. The rule is pure, so they are
 * checked here instead — which is also where they stay checked once the
 * catalogue does move.
 */

function line(over: Partial<ReorderSourceLine> = {}): ReorderSourceLine {
  return {
    productId: "p1",
    mtrl: 1001,
    sku: "ABC-1",
    name: "Δίσκος κοπής 125mm",
    quantity: 1,
    unitNet: 10,
    ...over,
  };
}

function product(over: Partial<ReorderCandidate> = {}): ReorderCandidate {
  return { id: "p1", mtrl: 1001, code: "K-1", code2: "ABC-1", priceNet: 10, ...over };
}

describe("matchOrderLines", () => {
  it("adds a line whose product is unchanged, with no notices", () => {
    const out = matchOrderLines([line()], [product()]);
    expect(out.add).toEqual([{ productId: "p1", quantity: 1, priceNet: 10 }]);
    expect(out.units).toBe(1);
    expect(out.skipped).toEqual([]);
    expect(out.priceChanges).toEqual([]);
  });

  it("names a delisted product instead of quietly dropping it", () => {
    const out = matchOrderLines([line({ name: "Παλιό εργαλείο" })], []);
    expect(out.add).toEqual([]);
    expect(out.skipped).toEqual([{ name: "Παλιό εργαλείο", reason: "delisted" }]);
  });

  it("refuses a product with no price rather than adding it at zero", () => {
    const out = matchOrderLines([line()], [product({ priceNet: null })]);
    expect(out.add).toEqual([]);
    expect(out.skipped).toEqual([{ name: "Δίσκος κοπής 125mm", reason: "no_price" }]);
  });

  it("treats a zero price as no price", () => {
    const out = matchOrderLines([line()], [product({ priceNet: 0 })]);
    expect(out.skipped[0]?.reason).toBe("no_price");
  });

  it("reports a price change as then and now, and still adds the line", () => {
    const out = matchOrderLines([line({ unitNet: 12 })], [product({ priceNet: 19.9 })]);
    expect(out.add).toEqual([{ productId: "p1", quantity: 1, priceNet: 19.9 }]);
    expect(out.priceChanges).toEqual([{ name: "Δίσκος κοπής 125mm", then: 12, now: 19.9 }]);
  });

  it("ignores a sub-cent difference, which is rounding rather than a change", () => {
    const out = matchOrderLines([line({ unitNet: 10.002 })], [product({ priceNet: 10 })]);
    expect(out.priceChanges).toEqual([]);
  });

  it("writes the price on the cart line from today, never from the old order", () => {
    const out = matchOrderLines([line({ unitNet: 5 })], [product({ priceNet: 8 })]);
    expect(out.add[0]!.priceNet).toBe(8);
  });

  /*
   * The three fallbacks. `productId` is not a foreign key by design, so it is
   * the first to rot; `mtrl` survives a re-import; the printed code survives a
   * product rebuilt from scratch. A reorder that only tried the first would
   * report a stocked product as delisted.
   */
  it("falls back to MTRL when the stored product id no longer exists", () => {
    const out = matchOrderLines([line({ productId: "gone" })], [product({ id: "p9" })]);
    expect(out.add).toEqual([{ productId: "p9", quantity: 1, priceNet: 10 }]);
  });

  it("falls back to the manufacturer code when both id and MTRL have moved", () => {
    const out = matchOrderLines(
      [line({ productId: "gone", mtrl: 4242 })],
      [product({ id: "p9", mtrl: 1001 })],
    );
    expect(out.add).toEqual([{ productId: "p9", quantity: 1, priceNet: 10 }]);
  });

  it("matches on the internal code too, for a line whose sku was that", () => {
    const out = matchOrderLines(
      [line({ productId: null, mtrl: null, sku: "K-1" })],
      [product({ id: "p9" })],
    );
    expect(out.add[0]?.productId).toBe("p9");
  });

  it("sums two lines that resolve to the same product", () => {
    const out = matchOrderLines(
      [line({ quantity: 2 }), line({ productId: null, mtrl: null, sku: "K-1", quantity: 3 })],
      [product()],
    );
    expect(out.add).toEqual([{ productId: "p1", quantity: 5, priceNet: 10 }]);
    expect(out.units).toBe(5);
  });

  it("counts units rather than lines", () => {
    const out = matchOrderLines(
      [line({ quantity: 4 }), line({ productId: "p2", mtrl: 2002, sku: "X-2", quantity: 3 })],
      [product(), product({ id: "p2", mtrl: 2002, code: "K-2", code2: "X-2" })],
    );
    expect(out.add).toHaveLength(2);
    expect(out.units).toBe(7);
  });

  it("adds what it can and reports what it cannot, from one mixed order", () => {
    const out = matchOrderLines(
      [
        line(),
        line({ productId: "p2", mtrl: 2002, sku: "X-2", name: "Καταργημένο", quantity: 2 }),
        line({ productId: "p3", mtrl: 3003, sku: "Y-3", name: "Ακριβότερο", unitNet: 30 }),
      ],
      [product(), product({ id: "p3", mtrl: 3003, code: "K-3", code2: "Y-3", priceNet: 36 })],
    );
    expect(out.units).toBe(2);
    expect(out.skipped).toEqual([{ name: "Καταργημένο", reason: "delisted" }]);
    expect(out.priceChanges).toEqual([{ name: "Ακριβότερο", then: 30, now: 36 }]);
  });

  it("handles Decimal-like values, which is what Prisma returns", () => {
    const decimal = (v: number) => ({ toString: () => String(v), valueOf: () => v });
    const out = matchOrderLines(
      [line({ unitNet: decimal(10) })],
      [product({ priceNet: decimal(11.5) })],
    );
    expect(out.add[0]!.priceNet).toBe(11.5);
    expect(out.priceChanges[0]).toEqual({ name: "Δίσκος κοπής 125mm", then: 10, now: 11.5 });
  });
});
