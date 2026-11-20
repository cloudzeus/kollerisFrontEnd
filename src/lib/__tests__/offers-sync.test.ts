import { describe, expect, it } from "vitest";
import { offerUpsertData, type FeedOffer } from "@/lib/sync/offers-sync";

const feed: FeedOffer = {
  slug: "black-friday-2026",
  badge: "BLACK FRIDAY",
  titleEl: "Black Friday 2026",
  titleEn: "Black Friday 2026",
  titleIt: "Black Friday 2026",
  descriptionEl: "Μειωμένες τιμές σε επιλεγμένα εργαλεία.",
  descriptionEn: "Reduced prices on selected tools.",
  descriptionIt: "Prezzi ridotti su utensili selezionati.",
  startsAt: "2026-11-24T00:00:00.000Z",
  endsAt: "2026-11-30T21:59:59.000Z",
};

describe("προσφορά HDCtool → τοπική καμπάνια", () => {
  it("κρατά κείμενα, σήμα, παράθυρο και οδηγεί στη σελίδα της", () => {
    const d = offerUpsertData(feed);
    expect(d).toMatchObject({
      titleEl: "Black Friday 2026",
      descriptionIt: "Prezzi ridotti su utensili selezionati.",
      badge: "BLACK FRIDAY",
      href: "/prosfores/black-friday-2026",
      isActive: true,
      fromHdctool: true,
    });
    expect(d.startsAt).toEqual(new Date("2026-11-24T00:00:00.000Z"));
    expect(d.endsAt).toEqual(new Date("2026-11-30T21:59:59.000Z"));
  });

  /*
   * ΤΟ ΚΡΙΣΙΜΟ TEST.
   *
   * Η τοπική καμπάνια έχει δική της αριθμητική (`discountedNet`). Αν μια
   * προσφορά HDCtool κατέβαινε με ποσοστό, η τιμή θα κοβόταν δεύτερη φορά πάνω
   * σε τιμή που είναι ήδη η τιμή προσφοράς. Το HDCtool ορίζει την τιμή· η
   * τοπική εγγραφή είναι μόνο η παρουσίαση.
   */
  it("ΚΑΜΙΑ αριθμητική: η τιμή ανήκει στο HDCtool", () => {
    const d = offerUpsertData(feed);
    expect(d.discount).toBe("none");
    expect(d.discountValue).toBeNull();
  });

  it("η εμβέλεια λύνεται από τα προϊόντα, όχι από λίστα slug", () => {
    const d = offerUpsertData(feed);
    expect(d.productSlugs).toEqual([]);
    expect(d.brandSlug).toBeNull();
    expect(d.categorySlug).toBeNull();
  });

  it("χωρίς τίτλο, ο τίτλος είναι το σήμα — ποτέ κενός", () => {
    expect(offerUpsertData({ ...feed, titleEl: "   " }).titleEl).toBe("BLACK FRIDAY");
    expect(offerUpsertData({ ...feed, titleEl: "", badge: null }).titleEl).toBe("black-friday-2026");
  });

  it("κενό παράθυρο μένει κενό, δεν γίνεται σήμερα", () => {
    const d = offerUpsertData({ ...feed, startsAt: null, endsAt: null });
    expect(d.startsAt).toBeNull();
    expect(d.endsAt).toBeNull();
  });

  // Οι στήλες έχουν όρια· μια περιγραφή 600 χαρακτήρων θα έριχνε όλο τον
  // συγχρονισμό αντί για μία προσφορά.
  it("κόβει στα όρια των στηλών", () => {
    const d = offerUpsertData({ ...feed, titleEl: "α".repeat(200), descriptionEl: "β".repeat(500), badge: "γ".repeat(60) });
    expect(d.titleEl).toHaveLength(160);
    expect(d.descriptionEl).toHaveLength(400);
    expect(d.badge).toHaveLength(40);
  });
});
