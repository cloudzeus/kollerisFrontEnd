import { describe, expect, it } from "vitest";
import { heroOfferItems } from "@/lib/catalog/hero-offers";

const L = { inStock: "Άμεσα διαθέσιμο", order: "Κατόπιν παραγγελίας" };

const product = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  slug: "katsavidia-1616048",
  name: "ΚΑΤΣΑΒΙΔΙΑ 1000V ΣΕΤ 7ΤΕΜ",
  sku: "1616048",
  brandName: "GEDORE",
  image: "https://cdn/x.webp",
  priceNet: 39.5161,
  priceListNet: 57.6129,
  vatRate: 24,
  inStock: true,
  ...over,
}) as never;

describe("heroOfferItems", () => {
  it("δείχνει την τιμή προσφοράς και την κανονική διαγραμμένη, με ΦΠΑ", () => {
    const [i] = heroOfferItems([product()], "el", L);
    expect(i.now).toContain("49,00");
    expect(i.was).toContain("71,44");
  });

  it("το ποσοστό βγαίνει από τις δύο τιμές", () => {
    expect(heroOfferItems([product()], "el", L)[0].off).toBe("−31%");
  });

  it("οδηγεί στο προϊόν, όχι στη λίστα", () => {
    expect(heroOfferItems([product()], "el", L)[0].href).toBe("/proion/katsavidia-1616048");
  });

  /*
   * Χωρίς «πριν» δεν υπάρχει προσφορά να δείξει το hero. Μια κάρτα με μόνο μία
   * τιμή και σήμα «ΠΡΟΣΦΟΡΑ» λέει ψέματα.
   */
  it("προϊόν χωρίς κανονική τιμή δεν μπαίνει", () => {
    expect(heroOfferItems([product({ priceListNet: null })], "el", L)).toHaveLength(0);
  });

  it("κανονική τιμή ίση ή μικρότερη δεν είναι μείωση", () => {
    expect(heroOfferItems([product({ priceListNet: 39.5161 })], "el", L)).toHaveLength(0);
  });

  it("χωρίς τιμή πώλησης δεν μπαίνει", () => {
    expect(heroOfferItems([product({ priceNet: null })], "el", L)).toHaveLength(0);
  });

  it("η διαθεσιμότητα λέγεται με λόγια, όχι με αριθμό", () => {
    expect(heroOfferItems([product()], "el", L)[0].stock).toBe("Άμεσα διαθέσιμο");
    expect(heroOfferItems([product({ inStock: false })], "el", L)[0].stock).toBe("Κατόπιν παραγγελίας");
  });

  it("μεγαλύτερη μείωση πρώτη — το hero έχει χώρο για λίγα", () => {
    const small = product({ slug: "a", priceNet: 50, priceListNet: 55 });
    const big = product({ slug: "b", priceNet: 50, priceListNet: 100 });
    expect(heroOfferItems([small, big], "el", L).map((i) => i.href)).toEqual([
      "/proion/b",
      "/proion/a",
    ]);
  });
});
