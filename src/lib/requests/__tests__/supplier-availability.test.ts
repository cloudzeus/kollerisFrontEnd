import { describe, expect, it } from "vitest";
import { isOnRequest, splitCart } from "@/lib/requests/model";
import { isFromSupplier } from "@/lib/catalog/availability";

describe("Milwaukee supplier XML availability", () => {
  it("a product the supplier has is bought, never requested", () => {
    expect(isOnRequest({ inStock: false, supplierAvailable: true, availableQty: 0, quantity: 2 })).toBe(false);
    // More than we hold: the supplier fills the line.
    expect(isOnRequest({ inStock: true, supplierAvailable: true, availableQty: 1, quantity: 3 })).toBe(false);
  });

  it("without the supplier the request rule is unchanged", () => {
    expect(isOnRequest({ inStock: false, supplierAvailable: false, availableQty: 0, quantity: 1 })).toBe(true);
    expect(isOnRequest({ inStock: true, availableQty: 1, quantity: 3 })).toBe(true);
    expect(isOnRequest({ inStock: true, availableQty: 5, quantity: 3 })).toBe(false);
  });

  it("a cart of supplier lines is an ordinary order", () => {
    const lines = [
      { inStock: false, supplierAvailable: true, availableQty: 0, quantity: 1 },
      { inStock: true, availableQty: 4, quantity: 1 },
    ];
    expect(splitCart(lines).kind).toBe("none");
  });

  it("the label says supplier only when it is not ours", () => {
    expect(isFromSupplier({ inStock: false, supplierAvailable: true })).toBe(true);
    expect(isFromSupplier({ inStock: true, supplierAvailable: true })).toBe(false);
    expect(isFromSupplier({ inStock: false, supplierAvailable: false })).toBe(false);
    expect(isFromSupplier({ inStock: false })).toBe(false);
  });
});
