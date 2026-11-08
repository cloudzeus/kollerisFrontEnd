import { afterEach, describe, expect, it, vi } from "vitest";
import { itemsValue, trackAddToCart } from "../ga4-events";

describe("ga4-events", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sums price × quantity to cents", () => {
    expect(itemsValue([{ item_id: "a", item_name: "A", price: 10.005, quantity: 3 }, { item_id: "b", item_name: "B", price: 1.1 }])).toBe(31.12);
  });

  it("sends add_to_cart in EUR only for a successful add with an item", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag });
    trackAddToCart({ ok: false });
    trackAddToCart({ ok: true });
    trackAddToCart({ ok: true, item: { item_id: "21191001258", item_name: "Τρυπάνι", price: 9.5, quantity: 2 } });
    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenCalledWith("event", "add_to_cart", expect.objectContaining({ currency: "EUR", value: 19 }));
  });

  it("is a no-op when gtag is not loaded (development, blocked script)", () => {
    vi.stubGlobal("window", {});
    expect(() => trackAddToCart({ ok: true, item: { item_id: "x", item_name: "X" } })).not.toThrow();
  });
});
