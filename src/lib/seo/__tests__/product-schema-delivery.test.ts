import { describe, expect, it } from "vitest";
import { shippingDetails } from "../product-schema";

describe("χρόνος παράδοσης στο schema", () => {
  it("από το απόθεμα: φεύγει αυθημερόν ή την επόμενη", () => {
    expect(shippingDetails("el").deliveryTime.handlingTime).toMatchObject({ minValue: 0, maxValue: 1 });
  });

  it("από τον προμηθευτή: 3–5 εργάσιμες συνολικά, όπως λέει η σελίδα", () => {
    const d = shippingDetails("el", { fromSupplier: true }).deliveryTime;
    expect(d.handlingTime.minValue + d.transitTime.minValue).toBe(3);
    expect(d.handlingTime.maxValue + d.transitTime.maxValue).toBe(5);
  });

  it("δωρεάν μεταφορικά με ΦΠΑ, όπως οι τιμές του schema (150 καθαρά = 186)", () => {
    expect(shippingDetails("el").shippingRate.eligibleTransactionVolume.minPrice).toBe(186);
  });
});
