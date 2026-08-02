/**
 * What an offer is.
 *
 * Client-safe: the wizard, the pickers and the banner widget all read these,
 * and the module that queries them is `server-only`.
 */

export type OfferScope = "products" | "brand" | "category";
export type OfferDiscount = "percent" | "amount" | "bogo" | "none";

/** Per-locale copy. Greek is written; the others are translated from it. */
export type OfferCopy = {
  titleEl: string;
  titleEn: string;
  titleIt: string;
  descriptionEl: string;
  descriptionEn: string;
  descriptionIt: string;
};

export type OfferDraft = OfferCopy & {
  id?: string;
  slug: string;
  badge: string;
  href: string;

  scope: OfferScope;
  productSlugs: string[];
  brandSlug: string;
  categorySlug: string;

  discount: OfferDiscount;
  discountValue: number | null;
  bogoBuy: number | null;
  bogoFree: number | null;

  maxPerCustomer: number | null;
  maxTotal: number | null;

  image: string;
  imageWide: string;
  video: string;

  /** `datetime-local` strings — local wall clock, no zone. */
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

export type OfferRow = Omit<OfferDraft, "startsAt" | "endsAt"> & {
  id: string;
  startsAt: Date | null;
  endsAt: Date | null;
  usedCount: number;
  updatedAt: Date;
};

export const DISCOUNT_LABEL: Record<OfferDiscount, string> = {
  percent: "Ποσοστό",
  amount: "Ποσό σε ευρώ",
  bogo: "1 + 1 δώρο",
  none: "Χωρίς έκπτωση",
};

export const SCOPE_LABEL: Record<OfferScope, string> = {
  products: "Επιλεγμένα προϊόντα",
  brand: "Όλη η μάρκα",
  category: "Όλη η κατηγορία",
};

/**
 * The badge a campaign writes on itself, derived from its own numbers.
 *
 * Typed badges drift from the discount they describe — "-30%" left behind on a
 * campaign somebody changed to -20% is worse than no badge. This is offered as
 * the default and can still be overridden, because "ΔΩΡΕΑΝ ΜΕΤΑΦΟΡΙΚΑ" is not
 * derivable from a number.
 */
export function suggestedBadge(draft: Pick<OfferDraft, "discount" | "discountValue" | "bogoBuy" | "bogoFree">): string {
  switch (draft.discount) {
    case "percent":
      return draft.discountValue ? `-${draft.discountValue}%` : "";
    case "amount":
      return draft.discountValue ? `-${draft.discountValue}€` : "";
    case "bogo":
      return draft.bogoBuy && draft.bogoFree ? `${draft.bogoBuy}+${draft.bogoFree}` : "";
    default:
      return "";
  }
}

export function emptyOffer(): OfferDraft {
  return {
    slug: "",
    titleEl: "", titleEn: "", titleIt: "",
    descriptionEl: "", descriptionEn: "", descriptionIt: "",
    badge: "",
    href: "/prosfores",
    scope: "products",
    productSlugs: [],
    brandSlug: "",
    categorySlug: "",
    discount: "percent",
    discountValue: null,
    bogoBuy: 1,
    bogoFree: 1,
    maxPerCustomer: null,
    maxTotal: null,
    image: "",
    imageWide: "",
    video: "",
    startsAt: "",
    endsAt: "",
    isActive: true,
  };
}

/**
 * What is wrong with this draft, per wizard step.
 *
 * Returned as a map rather than the first error: a wizard that reveals one
 * problem at a time makes somebody walk the same four steps four times.
 */
export function validate(draft: OfferDraft): Partial<Record<"copy" | "scope" | "terms", string>> {
  const problems: Partial<Record<"copy" | "scope" | "terms", string>> = {};

  if (!draft.titleEl.trim()) problems.copy = "Ο ελληνικός τίτλος είναι υποχρεωτικός.";
  else if (!draft.slug.trim()) problems.copy = "Το slug είναι υποχρεωτικό.";
  else if (!/^[a-z0-9-]+$/.test(draft.slug)) problems.copy = "Το slug δέχεται μόνο πεζά, αριθμούς και παύλες.";

  if (draft.scope === "products" && draft.productSlugs.length === 0)
    problems.scope = "Διαλέξτε τουλάχιστον ένα προϊόν.";
  if (draft.scope === "brand" && !draft.brandSlug) problems.scope = "Διαλέξτε μάρκα.";
  if (draft.scope === "category" && !draft.categorySlug) problems.scope = "Διαλέξτε κατηγορία.";

  if (draft.discount === "percent") {
    if (!draft.discountValue) problems.terms = "Ορίστε ποσοστό.";
    else if (draft.discountValue <= 0 || draft.discountValue >= 100)
      problems.terms = "Το ποσοστό πρέπει να είναι μεταξύ 1 και 99.";
  }
  if (draft.discount === "amount" && !draft.discountValue) problems.terms = "Ορίστε ποσό.";
  if (draft.discount === "bogo" && (!draft.bogoBuy || !draft.bogoFree))
    problems.terms = "Ορίστε πόσα αγοράζει και πόσα παίρνει δώρο.";

  if (draft.startsAt && draft.endsAt && new Date(draft.endsAt) <= new Date(draft.startsAt))
    problems.terms = "Η λήξη πρέπει να είναι μετά την έναρξη.";

  return problems;
}
