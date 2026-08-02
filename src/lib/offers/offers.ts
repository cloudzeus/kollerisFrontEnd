import "server-only";
import { prisma } from "@/lib/prisma";
import { chat } from "@/lib/ai/deepseek";
import type { OfferDraft, OfferRow } from "@/lib/offers/offer-types";
import { validate } from "@/lib/offers/offer-types";
import type { Locale } from "@/i18n/routing";

/**
 * Reading and writing campaigns.
 *
 * An offer records what it covers, what it takes off and for how long. It does
 * NOT apply that discount to a cart: pricing policy belongs to HDCtool by an
 * earlier decision, and two systems computing the same discount from different
 * rules is how a shop charges the wrong amount. What lives here is the
 * campaign — its words, its reach, its window — and the storefront shows it.
 */

const toRow = (row: {
  id: string; slug: string; titleEl: string; titleEn: string; titleIt: string;
  descriptionEl: string; descriptionEn: string; descriptionIt: string;
  badge: string | null; href: string; scope: string; productSlugs: string[];
  brandSlug: string | null; categorySlug: string | null; discount: string;
  discountValue: unknown; bogoBuy: number | null; bogoFree: number | null;
  maxPerCustomer: number | null; maxTotal: number | null; usedCount: number;
  image: string | null; imageWide: string | null; video: string | null;
  startsAt: Date | null; endsAt: Date | null; isActive: boolean; updatedAt: Date;
}): OfferRow => ({
  id: row.id,
  slug: row.slug,
  titleEl: row.titleEl, titleEn: row.titleEn, titleIt: row.titleIt,
  descriptionEl: row.descriptionEl, descriptionEn: row.descriptionEn, descriptionIt: row.descriptionIt,
  badge: row.badge ?? "",
  href: row.href,
  scope: row.scope as OfferRow["scope"],
  productSlugs: row.productSlugs,
  brandSlug: row.brandSlug ?? "",
  categorySlug: row.categorySlug ?? "",
  discount: row.discount as OfferRow["discount"],
  discountValue: row.discountValue == null ? null : Number(row.discountValue),
  bogoBuy: row.bogoBuy, bogoFree: row.bogoFree,
  maxPerCustomer: row.maxPerCustomer, maxTotal: row.maxTotal, usedCount: row.usedCount,
  image: row.image ?? "", imageWide: row.imageWide ?? "", video: row.video ?? "",
  startsAt: row.startsAt, endsAt: row.endsAt,
  isActive: row.isActive, updatedAt: row.updatedAt,
});

export async function listOffers(): Promise<OfferRow[]> {
  const rows = await prisma.offer.findMany({ orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }] });
  return rows.map(toRow);
}

export async function getOffer(id: string): Promise<OfferRow | null> {
  const row = await prisma.offer.findUnique({ where: { id } });
  return row ? toRow(row) : null;
}

/** The title in the visitor's language, Greek as the fallback. */
export const offerTitle = (row: Pick<OfferRow, "titleEl" | "titleEn" | "titleIt">, locale: Locale) =>
  (locale === "en" ? row.titleEn : locale === "it" ? row.titleIt : row.titleEl) || row.titleEl;

export const offerDescription = (
  row: Pick<OfferRow, "descriptionEl" | "descriptionEn" | "descriptionIt">,
  locale: Locale,
) => (locale === "en" ? row.descriptionEn : locale === "it" ? row.descriptionIt : row.descriptionEl) || row.descriptionEl;

const at = (value: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export async function saveOffer(
  draft: OfferDraft,
  actor: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const problems = Object.values(validate(draft));
  if (problems.length > 0) return { ok: false, error: problems[0]! };

  const clash = await prisma.offer.findUnique({ where: { slug: draft.slug }, select: { id: true } });
  if (clash && clash.id !== draft.id) return { ok: false, error: `Το slug «${draft.slug}» χρησιμοποιείται ήδη.` };

  const data = {
    slug: draft.slug.trim(),
    titleEl: draft.titleEl.trim().slice(0, 160),
    titleEn: draft.titleEn.trim().slice(0, 160),
    titleIt: draft.titleIt.trim().slice(0, 160),
    descriptionEl: draft.descriptionEl.trim().slice(0, 400),
    descriptionEn: draft.descriptionEn.trim().slice(0, 400),
    descriptionIt: draft.descriptionIt.trim().slice(0, 400),
    badge: draft.badge.trim() || null,
    href: draft.href.trim().slice(0, 255),
    scope: draft.scope,
    // Only the field the chosen scope uses is kept. Leaving the others behind
    // means a campaign narrowed from a brand to three products still claims the
    // brand somewhere, and the next reader has to guess which one counts.
    productSlugs: draft.scope === "products" ? draft.productSlugs : [],
    brandSlug: draft.scope === "brand" ? draft.brandSlug || null : null,
    categorySlug: draft.scope === "category" ? draft.categorySlug || null : null,
    discount: draft.discount,
    discountValue: draft.discount === "bogo" || draft.discount === "none" ? null : draft.discountValue,
    bogoBuy: draft.discount === "bogo" ? draft.bogoBuy : null,
    bogoFree: draft.discount === "bogo" ? draft.bogoFree : null,
    maxPerCustomer: draft.maxPerCustomer,
    maxTotal: draft.maxTotal,
    image: draft.image || null,
    imageWide: draft.imageWide || null,
    video: draft.video || null,
    startsAt: at(draft.startsAt),
    endsAt: at(draft.endsAt),
    isActive: draft.isActive,
    updatedBy: actor.slice(0, 120),
  };

  const row = draft.id
    ? await prisma.offer.update({ where: { id: draft.id }, data, select: { id: true } })
    : await prisma.offer.create({ data, select: { id: true } });

  return { ok: true, id: row.id };
}

export async function deleteOffer(id: string): Promise<{ ok: true }> {
  await prisma.offer.delete({ where: { id } });
  return { ok: true };
}

/**
 * Rewrite a campaign line as marketing copy.
 *
 * Separate from the generic translator because the job is different: this
 * rewrites rather than translates, and the instruction that matters is what NOT
 * to do — no exclamation marks, no invented claims, no numbers the campaign did
 * not state. A model asked for "better marketing copy" will otherwise promise
 * free shipping nobody offered.
 */
export async function rewriteCopy({
  text,
  kind,
  tone,
  context,
}: {
  text: string;
  kind: "title" | "description";
  tone: string;
  context: string;
}): Promise<string[]> {
  if (!text.trim()) return [];

  const system = [
    "Είσαι copywriter σε e-shop επαγγελματικών εργαλείων στην Ελλάδα.",
    `Ξαναγράψε το κείμενο ως ${kind === "title" ? "τίτλο προσφοράς" : "σύντομη περιγραφή προσφοράς"}.`,
    `Ύφος: ${tone}.`,
    context ? `Η προσφορά αφορά: ${context}.` : "",
    kind === "title" ? "Μέχρι 60 χαρακτήρες." : "Μέχρι 160 χαρακτήρες, μία ή δύο προτάσεις.",
    "ΜΗΝ επινοήσεις εκπτώσεις, ποσά, ημερομηνίες ή παροχές που δεν αναφέρονται.",
    "Χωρίς θαυμαστικά και χωρίς κεφαλαία λέξεις για έμφαση.",
    'Απάντησε ΜΟΝΟ με πίνακα JSON τριών συμβολοσειρών, π.χ. ["πρώτη", "δεύτερη", "τρίτη"]. Χωρίς αντικείμενα, χωρίς κλειδιά.',
  ]
    .filter(Boolean)
    .join(" ");

  const raw = await chat(system, text, 700);
  try {
    const parsed: unknown = JSON.parse(raw.replace(/```(?:json)?/g, "").trim());
    if (!Array.isArray(parsed)) return [];

    // The model is asked for strings and sometimes sends objects anyway —
    // `[{ "επιλογή": "…" }]`. Reading the first string out of an object costs
    // three lines and turns a silent empty list into a working feature; the
    // prompt asks plainly, and this catches the day it does not listen.
    return parsed
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const first = Object.values(item).find((v) => typeof v === "string");
          return typeof first === "string" ? first : "";
        }
        return "";
      })
      .map((value) => value.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}
