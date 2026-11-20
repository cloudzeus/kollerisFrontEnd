import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  attributionChannel,
  erpAttribution,
  fbcValue,
  gaClientId,
  gaSessionId,
  mergeAttribution,
  parseAttrCookie,
  readClickParams,
  type OrderAttribution,
} from "../attribution";
import { ga4PurchaseBody, metaPurchaseBody, normalisePhone, purchaseChannels, type PurchaseOrder } from "../server-purchase";

const sha = (v: string) => createHash("sha256").update(v).digest("hex");

describe("από πού ήρθε", () => {
  it("κρατά μόνο τις παραμέτρους κλικ", () => {
    expect(readClickParams(new URLSearchParams("utm_source=google&utm_campaign=hdc_1&q=x&gclid=abc"))).toEqual({ utm_source: "google", utm_campaign: "hdc_1", gclid: "abc" });
    expect(readClickParams(new URLSearchParams("q=x"))).toBeNull();
  });

  it("τελευταίο κλικ: το νέο αντικαθιστά όλο το παλιό, χωρίς νέο μένει το παλιό", () => {
    const prev = { gclid: "g", utm_source: "google", ts: 1, landing: "/a" };
    expect(mergeAttribution(prev, { fbclid: "f" }, 5, "/b")).toEqual({ fbclid: "f", ts: 5, landing: "/b" });
    expect(mergeAttribution(prev, null, 5, "/b")).toBe(prev);
    expect(mergeAttribution(null, null, 5, "/b")).toEqual({});
  });

  it("διαβάζει το cookie και αγνοεί ξένα πεδία", () => {
    const v = encodeURIComponent(JSON.stringify({ gclid: "g", evil: "<x>", ts: 7 }));
    expect(parseAttrCookie(v)).toEqual({ gclid: "g", ts: 7 });
    expect(parseAttrCookie("%%%")).toBeNull();
    expect(parseAttrCookie(encodeURIComponent("{}"))).toEqual({});
  });

  it("GA4 client και session id και από τις δύο μορφές του cookie", () => {
    expect(gaClientId("GA1.1.123456789.1700000000")).toBe("123456789.1700000000");
    expect(gaClientId("junk")).toBeUndefined();
    expect(gaSessionId("GS1.1.1732100000.3.1.1732100500.0.0.0")).toBe("1732100000");
    expect(gaSessionId("GS2.1.s1732100000$o3$g1$t1732100500$j60$l0$h0")).toBe("1732100000");
  });

  it("_fbc από το fbclid όταν το Pixel δεν το έγραψε", () => {
    expect(fbcValue(undefined, "abc", 1000)).toBe("fb.1.1000.abc");
    expect(fbcValue("fb.1.9.zzz", "abc", 1000)).toBe("fb.1.9.zzz");
    expect(fbcValue(undefined, undefined, 1)).toBeUndefined();
  });

  it("κανάλι από gclid/fbclid ή utm_source", () => {
    expect(attributionChannel({ gclid: "g" })).toBe("google");
    expect(attributionChannel({ utm_source: "Facebook" })).toBe("meta");
    expect(attributionChannel({ utm_source: "newsletter" })).toBe("newsletter");
    expect(attributionChannel({})).toBeNull();
  });

  it("στο HDCtool δεν πάει IP, user agent ή αναγνωριστικό browser", () => {
    const a: OrderAttribution = { consent: "granted", gclid: "g", utm_campaign: "hdc_1", ip: "1.2.3.4", ua: "UA", gaClientId: "1.2", fbp: "fb" };
    expect(erpAttribution(a)).toEqual({ gclid: "g", utm_campaign: "hdc_1", channel: "google" });
  });
});

const order: PurchaseOrder = {
  orderNumber: "KOL-20261122-0001",
  subtotalNet: "100.00",
  vatAmount: "24.00",
  shippingGross: "4.96",
  email: " Giannis@Example.com ",
  phone: "694 123 4567",
  firstName: "Γιάννης",
  lastName: "Παπάς",
  shipCity: "Νέα Σμύρνη",
  shipPostcode: "171 21",
  shipCountry: "GR",
  paidAt: new Date("2026-11-22T10:00:00Z"),
  attribution: null,
  lines: [{ sku: "4933478", mtrl: 555, name: "Δράπανο", brand: "Milwaukee", unitNet: "50.00", discountPercent: "10", quantity: 2 }],
};
const attr: OrderAttribution = { consent: "granted", gaClientId: "1.2", gaSessionId: "99", fbp: "fb.1.1.1", ip: "1.2.3.4", ua: "UA" };

describe("αγορά από τον server", () => {
  it("GA4: client/session του browser, καθαρές τιμές, κωδικός ERP", () => {
    const b = ga4PurchaseBody(order, attr);
    expect(b.client_id).toBe("1.2");
    expect(b.events[0].params).toMatchObject({ transaction_id: order.orderNumber, value: 100, tax: 24, shipping: 4.96, session_id: "99", currency: "EUR" });
    expect(b.events[0].params.items).toEqual([{ item_id: "4933478", item_name: "Δράπανο", item_brand: "Milwaukee", price: 45, quantity: 2 }]);
  });

  it("Meta: ίδιο event_id με το Pixel, κατακερματισμένα στοιχεία, id καταλόγου = mtrl", () => {
    const b = metaPurchaseBody(order, attr, "https://kolleris.com");
    const e = b.data[0];
    expect(e.event_id).toBe("purchase-KOL-20261122-0001");
    expect(e.event_time).toBe(Date.parse("2026-11-22T10:00:00Z") / 1000);
    expect(e.user_data.em).toEqual([sha("giannis@example.com")]);
    expect(e.user_data.ph).toEqual([sha("306941234567")]);
    expect(e.user_data.zp).toEqual([sha("17121")]);
    expect(e.user_data).toMatchObject({ client_ip_address: "1.2.3.4", client_user_agent: "UA", fbp: "fb.1.1.1" });
    expect(e.custom_data).toMatchObject({ value: 100, currency: "EUR", content_ids: ["555"], order_id: order.orderNumber });
  });

  it("τηλέφωνο E.164", () => {
    expect(normalisePhone("+30 694 123 4567", "GR")).toBe("306941234567");
    expect(normalisePhone("0049 151 2345", "DE")).toBe("491512345");
    expect(normalisePhone("", "GR")).toBeUndefined();
  });

  it("χωρίς συγκατάθεση ή χωρίς κλειδί δεν στέλνει τίποτα ο server", () => {
    const none = { ga4Secret: "", metaToken: "" };
    const ga4 = { ga4Secret: "s", metaToken: "" };
    expect(purchaseChannels(null, ga4)).toEqual({ ga4: false, meta: false });
    expect(purchaseChannels(attr, none)).toEqual({ ga4: false, meta: false });
    expect(purchaseChannels(attr, ga4).ga4).toBe(true);
    expect(purchaseChannels({ ...attr, gaClientId: undefined }, ga4).ga4).toBe(false);
    expect(purchaseChannels({ ...attr, consent: "denied" }, ga4)).toEqual({ ga4: false, meta: false });
  });
});
