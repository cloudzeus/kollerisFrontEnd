import { afterEach, describe, expect, it, vi } from "vitest";
import { ga4Event, itemsValue, metaParams, trackAddToCart } from "../ga4-events";

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

  it("mirrors the funnel to the Meta Pixel with net value and ERP codes", () => {
    const gtag = vi.fn();
    const fbq = vi.fn();
    vi.stubGlobal("window", { gtag, fbq });
    const items = [{ item_id: "4933479862", item_name: "M18", price: 100, quantity: 2 }];
    ga4Event("purchase", { transaction_id: "K-1001", value: 200, items });
    expect(fbq).toHaveBeenCalledWith(
      "track",
      "Purchase",
      expect.objectContaining({ currency: "EUR", value: 200, content_ids: ["4933479862"], num_items: 2, content_type: "product" }),
      { eventID: "purchase-K-1001" },
    );
    ga4Event("view_item", { items });
    expect(fbq).toHaveBeenLastCalledWith("track", "ViewContent", expect.objectContaining({ value: 200 }), undefined);
    ga4Event("view_item_list", { items });
    expect(fbq).toHaveBeenCalledTimes(2);
    expect(gtag).toHaveBeenCalledTimes(3);
  });

  it("builds Meta contents with quantity defaulting to 1", () => {
    expect(metaParams({ items: [{ item_id: "a", item_name: "A", price: 5 }] }).contents).toEqual([{ id: "a", quantity: 1, item_price: 5 }]);
  });

  it("sends the catalogue id to Meta when there is one, so catalogue ads match the product", () => {
    const items = [{ item_id: "21191001258", catalog_id: "2304", item_name: "Δράπανο", price: 100 }, { item_id: "X1", item_name: "Χωρίς mtrl", price: 5 }];
    expect(metaParams({ items })).toMatchObject({ content_ids: ["2304", "X1"], contents: [{ id: "2304" }, { id: "X1" }] });
  });
});
