import { describe, expect, it } from "vitest";
import { faqJsonLd } from "@/lib/seo/product-faq";
import { liveFigures, withLiveFigures } from "@/lib/seo/live-figures";

const stats = { products: 10649, inStock: 6492, brands: 20 };
const live = (s: string) => liveFigures(s, stats, "el");

describe("liveFigures", () => {
  it("αντικαθιστά τα tokens", () => {
    expect(live("{products}+ κωδικοί, {inStock} διαθέσιμοι, {brands} brands")).toBe("10.649+ κωδικοί, 6.492 διαθέσιμοι, 20 brands");
  });

  it("διορθώνει τα παγωμένα νούμερα του αποθηκευμένου κειμένου", () => {
    expect(live("Υπάρχουν 6.503 κωδικοί σε άμεση διαθεσιμότητα, από συνολικά 10.652+ κωδικούς.")).toBe(
      "Υπάρχουν 6.492 κωδικοί σε άμεση διαθεσιμότητα, από συνολικά 10.649+ κωδικούς.",
    );
  });

  it("αφήνει νούμερο κατηγορίας που απέχει πραγματικά", () => {
    expect(live("Τα εργαλεία χειρός έχουν 6.706 κωδικούς")).toBe("Τα εργαλεία χειρός έχουν 6.706 κωδικούς");
  });

  it("αφήνει νούμερο που δεν μετρά κωδικούς", () => {
    expect(live("Παραγγελίες άνω των 10.652 ευρώ")).toBe("Παραγγελίες άνω των 10.652 ευρώ");
  });
});

describe("withLiveFigures", () => {
  const fields = {
    seoTitle: "{products} κωδικοί",
    metaDescription: null,
    faq: [{ q: "Πόσοι {brands};", a: "Έχουμε 10.652 κωδικούς" }],
    h1: "{brands} brands",
    intro: null,
    ogDescription: "6.503 κωδικοί",
  };

  it("καλύπτει όλα τα πεδία", () => {
    expect(withLiveFigures(fields, stats, "el")).toEqual({
      seoTitle: "10.649 κωδικοί",
      metaDescription: null,
      faq: [{ q: "Πόσοι 20;", a: "Έχουμε 10.649 κωδικούς" }],
      h1: "20 brands",
      intro: null,
      ogDescription: "6.492 κωδικοί",
    });
  });

  it("το FAQPage JSON-LD λέει λέξη προς λέξη ό,τι οι ορατές ερωτήσεις", () => {
    const { faq } = withLiveFigures(fields, stats, "el");
    const ld = faqJsonLd(faq!)!;
    expect(ld.mainEntity.map((e) => [e.name, e.acceptedAnswer.text])).toEqual(faq!.map((p) => [p.q, p.a]));
  });
});
