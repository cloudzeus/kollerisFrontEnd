import { describe, expect, it } from "vitest";
import { offerProjection } from "@/lib/sync/offer-projection";

/**
 * Η προβολή της προσφοράς πάνω στις στήλες τιμής του καταλόγου.
 *
 * Το feed στέλνει τιμές ΜΕ ΦΠΑ· εδώ μέσα γίνονται καθαρές, γιατί έτσι τις
 * κρατά ο κατάλογος (`priceNet`, 4 δεκαδικά) και έτσι τις ξαναφτιάχνει η
 * βιτρίνα χωρίς να χάσει λεπτό.
 */

const VAT = 24;
const base = { pricer02: 189.14, priceWeb: null, priceRetail: null };
const offer = {
  ...base,
  priceOffer: 149,
  offerBasePrice: 189.14,
  offerDiscountPct: 21.22,
  offerBadge: "ΠΡΟΣΦΟΡΑ",
  offerSlug: "xristougenna-2026",
  offerEndsAt: "2026-12-31T23:59:59.000Z",
  price30dLow: 160,
};

describe("χωρίς προσφορά", () => {
  it("η τιμή είναι το PRICER02 καθαρό, καμία διαγραμμένη", () => {
    const r = offerProjection(base, VAT);
    expect(r.priceNet).toBe(152.5323);
    expect(r.priceList).toBeNull();
    expect(r.onSale).toBe(false);
    expect(r.offerSlug).toBeNull();
    expect(r.price30dLowNet).toBeNull();
  });

  it("κενό από το ERP: τίποτα, όχι μηδέν", () => {
    expect(offerProjection({ pricer02: null, priceWeb: null, priceRetail: null }, VAT).priceNet).toBeNull();
  });
});

describe("με προσφορά", () => {
  it("η τιμή προσφοράς χρεώνεται, η παγωμένη κανονική διαγράφεται", () => {
    const r = offerProjection(offer, VAT);
    // 149 / 1,24 = 120,1613 → ×1,24 ξαναβγάζει ακριβώς 149
    expect(r.priceNet).toBe(120.1613);
    expect(r.priceList).toBe(152.5323);
    expect(r.onSale).toBe(true);
  });

  it("κρατά σήμα, κλειδί, ποσοστό, λήξη και 30ήμερο χαμηλό", () => {
    const r = offerProjection(offer, VAT);
    expect(r.offerSlug).toBe("xristougenna-2026");
    expect(r.offerBadge).toBe("ΠΡΟΣΦΟΡΑ");
    expect(r.offerDiscountPct).toBe(21.22);
    expect(r.offerEndsAt).toEqual(new Date("2026-12-31T23:59:59.000Z"));
    expect(r.price30dLowNet).toBe(129.0323);
  });

  // Η παγωμένη τιμή είναι ο λόγος που υπάρχει: κανόνας τιμολόγησης στη μέση
  // της προσφοράς δεν επιτρέπεται να αλλάξει τη διαγραμμένη.
  it("η διαγραμμένη είναι η ΠΑΓΩΜΕΝΗ, όχι η σημερινή τιμή του ERP", () => {
    const r = offerProjection({ ...offer, pricer02: 210 }, VAT);
    expect(r.priceList).toBe(152.5323);
  });
});

describe("ό,τι δεν είναι μείωση δεν είναι προσφορά", () => {
  it("τιμή προσφοράς ίση ή πάνω από την κανονική: αγνοείται ολόκληρη", () => {
    const r = offerProjection({ ...offer, priceOffer: 189.14 }, VAT);
    expect(r.onSale).toBe(false);
    expect(r.priceList).toBeNull();
    expect(r.offerSlug).toBeNull();
    expect(r.priceNet).toBe(152.5323);
  });

  it("χωρίς slug δεν υπάρχει προσφορά — η σελίδα δεν θα άνοιγε", () => {
    expect(offerProjection({ ...offer, offerSlug: null }, VAT).onSale).toBe(false);
  });

  it("μηδενική ή αρνητική τιμή προσφοράς αγνοείται", () => {
    expect(offerProjection({ ...offer, priceOffer: 0 }, VAT).onSale).toBe(false);
    expect(offerProjection({ ...offer, priceOffer: -5 }, VAT).onSale).toBe(false);
  });

  // Παλιό HDCtool: κανένα πεδίο προσφοράς. Δεν σβήνει τίποτα, δεν δηλώνει τίποτα.
  it("feed χωρίς πεδία προσφοράς δεν σπάει", () => {
    expect(offerProjection(base, VAT).onSale).toBe(false);
  });
});

describe("Omnibus", () => {
  it("το 30ήμερο χαμηλό μπαίνει μόνο όσο τρέχει προσφορά", () => {
    expect(offerProjection({ ...base, price30dLow: 160 }, VAT).price30dLowNet).toBeNull();
  });

  it("μηδενικό χαμηλό δεν είναι τιμή", () => {
    expect(offerProjection({ ...offer, price30dLow: 0 }, VAT).price30dLowNet).toBeNull();
  });
});

describe("σειρά και sticker", () => {
  const withSticker = {
    ...offer,
    offerPosition: 3,
    offerSticker: "pct",
    offerStickerUrl: "https://hdctool.wwa.gr/api/public/offer-stickers/pct-21.svg",
    offerStickerAlt: "Έκπτωση 21%",
  };

  it("περνούν όπως ήρθαν όταν τρέχει προσφορά", () => {
    const r = offerProjection(withSticker, VAT);
    expect(r.offerPosition).toBe(3);
    expect(r.offerSticker).toBe("pct");
    expect(r.offerStickerUrl).toBe("https://hdctool.wwa.gr/api/public/offer-stickers/pct-21.svg");
    expect(r.offerStickerAlt).toBe("Έκπτωση 21%");
  });

  it("σβήνουν μαζί με την προσφορά", () => {
    const r = offerProjection({ ...withSticker, offerSlug: null }, VAT);
    expect(r.offerPosition).toBeNull();
    expect(r.offerSticker).toBeNull();
    expect(r.offerStickerUrl).toBeNull();
  });

  it("URL που δεν είναι https: κανένα sticker", () => {
    for (const url of ["javascript:alert(1)", "http://x.gr/a.svg", "https://x.gr/a b.svg", ""]) {
      const r = offerProjection({ ...withSticker, offerStickerUrl: url }, VAT);
      expect(r.offerSticker).toBeNull();
      expect(r.offerStickerUrl).toBeNull();
    }
  });
});
