import type { SeoFields } from "@/lib/seo/seo-fix-protocol";

export type LiveFigures = { products: number; inStock: number; brands: number };

/** A grouped number that counts codes: «6.503 κωδικοί», «10.652+ διαθέσιμους κωδικούς». */
const COUNT_OF_CODES = /\d{1,3}(?:\.\d{3})+(?=\+?\s+(?:[\p{L}-]+\s+){0,2}κωδικ)/gu;
const STALE_TOLERANCE = 0.02;
/** A count the sentence itself calls in stock: «6.285 άμεσα διαθέσιμοι», «6.503 κωδικοί σε άμεση διαθεσιμότητα». */
const COUNT_IN_STOCK = /\d{1,3}(?:\.\d{3})+(?=\+?\s+(?:[\p{L}-]+\s+){0,2}(?:άμεσα\s+διαθέσιμ|σε\s+άμεση\s+διαθεσιμότητα))/gu;
/** «από 20 brands», «21 brands με ενεργά προϊόντα». */
const COUNT_OF_BRANDS = /\b\d{1,3}(?=\s+brands\b)/gu;

/**
 * Stored SEO text says numbers from the day it was written, so the page ended
 * up showing 10.652 next to 10.649. New text can use {products}, {inStock} and
 * {brands}.
 *
 * shortcut: text already stored has literal numbers, so a catalogue total within
 * 2% is treated as stale; drop this once that text has been re-applied with tokens.
 */
export function liveFigures(text: string, figures: LiveFigures, locale: string): string {
  const format = (n: number) => n.toLocaleString(locale);
  return text
    .replace(/\{(products|inStock|brands)\}/g, (_, key: keyof LiveFigures) =>
      key === "brands" ? String(figures.brands) : format(figures[key]),
    )
    // The sentence says what it counts, so these need no tolerance: stock moves by more than 2% in a week.
    .replace(COUNT_IN_STOCK, (match) => (figures.inStock > 0 ? format(figures.inStock) : match))
    .replace(COUNT_OF_BRANDS, (match) => (figures.brands > 0 ? String(figures.brands) : match))
    .replace(COUNT_OF_CODES, (match) => {
      const value = Number(match.replaceAll(".", ""));
      const live = [figures.products, figures.inStock].find(
        (n) => n > 0 && Math.abs(value - n) / n <= STALE_TOLERANCE,
      );
      return live === undefined ? match : format(live);
    });
}

export function withLiveFigures(fields: SeoFields, figures: LiveFigures, locale: string): SeoFields {
  const text = (value: string | null) => value && liveFigures(value, figures, locale);
  return {
    seoTitle: text(fields.seoTitle),
    metaDescription: text(fields.metaDescription),
    faq: fields.faq?.map(({ q, a }) => ({ q: text(q)!, a: text(a)! })) ?? null,
    h1: text(fields.h1),
    intro: text(fields.intro),
    ogDescription: text(fields.ogDescription),
  };
}
