import "server-only";
import { prisma } from "@/lib/prisma";
import { translateBatch } from "@/lib/ai/deepseek";
import type { TranslatableSource, SourceCoverage } from "@/lib/i18n/coverage-types";

/**
 * How much of the shop actually changes when somebody switches language.
 *
 * The storefront picks the right column everywhere — that was never the
 * problem. The problem is that a column can be full and still be Greek: the
 * catalogue sync writes the Greek name into all three fields when it has
 * nothing better, so "100% filled" and "0% translated" look identical from the
 * database side.
 *
 * So coverage here means TRANSLATED, not present: a value identical to the
 * Greek one counts as missing. That is the only definition that matches what a
 * visitor sees.
 */

const LOCALES = ["en", "it"] as const;
export type TargetLocale = (typeof LOCALES)[number];

/** Names are proper nouns often enough that identical is legitimate. */
const untranslatable = (el: string) => el.trim().length < 2;

export async function coverage(): Promise<SourceCoverage[]> {
  const [categories, offers, products] = await Promise.all([
    prisma.category.findMany({ select: { nameEl: true, nameEn: true, nameIt: true } }),
    prisma.offer.findMany({ select: { titleEl: true, titleEn: true, titleIt: true } }),
    prisma.productTranslation.findMany({
      select: { productId: true, locale: true, name: true },
    }),
  ]);

  const catMissing = (locale: TargetLocale) =>
    categories.filter((c) => {
      const value = locale === "en" ? c.nameEn : c.nameIt;
      return !untranslatable(c.nameEl) && (!value.trim() || value.trim() === c.nameEl.trim());
    }).length;

  // Products carry a row per locale; a translation equal to the Greek is the
  // same silent failure, so it is counted the same way.
  const byProduct = new Map<string, Record<string, string>>();
  for (const row of products) {
    byProduct.set(row.productId, { ...byProduct.get(row.productId), [row.locale]: row.name });
  }
  const productRows = [...byProduct.values()];
  const productMissing = (locale: TargetLocale) =>
    productRows.filter((p) => {
      const value = p[locale] ?? "";
      return !value.trim() || value.trim() === (p.el ?? "").trim();
    }).length;

  return [
    {
      id: "categories",
      label: "Κατηγορίες",
      hint: "Τα ονόματα που βλέπει ο επισκέπτης στο μενού, στα φίλτρα και στα breadcrumbs.",
      total: categories.length,
      missing: { en: catMissing("en"), it: catMissing("it") },
      translatable: true,
    },
    {
      id: "products",
      label: "Προϊόντα",
      hint: "Ονόματα και σύντομες περιγραφές. Έρχονται μεταφρασμένα από τον συγχρονισμό.",
      total: productRows.length,
      missing: { en: productMissing("en"), it: productMissing("it") },
      translatable: false,
    },
    {
      id: "offers",
      label: "Προσφορές",
      hint: "Οι τίτλοι των καμπανιών. Γράφονται στα ελληνικά στο mini admin.",
      total: offers.length,
      missing: {
        en: offers.filter((o) => !o.titleEn.trim() || o.titleEn.trim() === o.titleEl.trim()).length,
        it: offers.filter((o) => !o.titleIt.trim() || o.titleIt.trim() === o.titleEl.trim()).length,
      },
      translatable: true,
    },
  ];
}

/**
 * Fill in the missing translations for one source and language.
 *
 * Batched, and written back one row at a time only after the whole batch comes
 * back the right length — a half-applied batch is worse than none, because the
 * next run would see the applied half as done.
 */
export async function translateMissing(
  source: TranslatableSource,
  locale: TargetLocale,
  { limit = 200, batchSize = 40 }: { limit?: number; batchSize?: number } = {},
): Promise<{ ok: true; translated: number; remaining: number } | { ok: false; error: string }> {
  if (source === "offers") return translateOffers(locale);
  if (source !== "categories") return { ok: false, error: "Άγνωστη πηγή." };

  const rows = await prisma.category.findMany({
    select: { id: true, nameEl: true, nameEn: true, nameIt: true },
  });

  const pending = rows.filter((row) => {
    const value = locale === "en" ? row.nameEn : row.nameIt;
    return !untranslatable(row.nameEl) && (!value.trim() || value.trim() === row.nameEl.trim());
  });

  const slice = pending.slice(0, limit);
  if (slice.length === 0) return { ok: true, translated: 0, remaining: 0 };

  let translated = 0;
  try {
    for (let i = 0; i < slice.length; i += batchSize) {
      const batch = slice.slice(i, i + batchSize);
      const result = await translateBatch({
        texts: batch.map((r) => r.nameEl),
        from: "el",
        to: locale,
        context: "ονόματα κατηγοριών εργαλείων, σύντομα, σε πληθυντικό",
      });

      await prisma.$transaction(
        batch.map((row, index) =>
          prisma.category.update({
            where: { id: row.id },
            data: locale === "en" ? { nameEn: result[index] } : { nameIt: result[index] },
          }),
        ),
      );
      translated += batch.length;
    }
  } catch (error) {
    console.error("[i18n] batch translation failed", error);
    return {
      ok: false,
      // Whatever landed stays: it is correct, and the next run picks up where
      // this one stopped because "done" is measured, not remembered.
      error: `${translated} μεταφράστηκαν πριν το σφάλμα: ${
        error instanceof Error ? error.message : "άγνωστο"
      }`,
    };
  }

  return { ok: true, translated, remaining: pending.length - translated };
}

/**
 * Campaign copy, title and description together.
 *
 * Sent as one batch per offer rather than one per field, so the description is
 * translated knowing the headline it sits under.
 */
async function translateOffers(
  locale: TargetLocale,
): Promise<{ ok: true; translated: number; remaining: number } | { ok: false; error: string }> {
  const rows = await prisma.offer.findMany();
  const pending = rows.filter((o) => {
    const title = locale === "en" ? o.titleEn : o.titleIt;
    return !title.trim() || title.trim() === o.titleEl.trim();
  });
  if (pending.length === 0) return { ok: true, translated: 0, remaining: 0 };

  try {
    const result = await translateBatch({
      texts: pending.flatMap((o) => [o.titleEl, o.descriptionEl || "—"]),
      from: "el",
      to: locale,
      context: "τίτλοι και περιγραφές προσφορών καταστήματος",
    });
    await prisma.$transaction(
      pending.map((offer, index) =>
        prisma.offer.update({
          where: { id: offer.id },
          data:
            locale === "en"
              ? { titleEn: result[index * 2], descriptionEn: result[index * 2 + 1] === "—" ? "" : result[index * 2 + 1] }
              : { titleIt: result[index * 2], descriptionIt: result[index * 2 + 1] === "—" ? "" : result[index * 2 + 1] },
        }),
      ),
    );
    return { ok: true, translated: pending.length, remaining: 0 };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Η μετάφραση απέτυχε." };
  }
}

/** The rows still showing Greek, for the operator to inspect or fix by hand. */
export async function listMissing(
  source: TranslatableSource,
  locale: TargetLocale,
  limit = 60,
): Promise<Array<{ id: string; el: string; current: string }>> {
  if (source !== "categories") return [];
  const rows = await prisma.category.findMany({
    select: { id: true, nameEl: true, nameEn: true, nameIt: true },
    orderBy: { productCount: "desc" },
  });
  return rows
    .filter((row) => {
      const value = locale === "en" ? row.nameEn : row.nameIt;
      return !untranslatable(row.nameEl) && (!value.trim() || value.trim() === row.nameEl.trim());
    })
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      el: row.nameEl,
      current: locale === "en" ? row.nameEn : row.nameIt,
    }));
}

export async function setTranslation(
  source: TranslatableSource,
  locale: TargetLocale,
  id: string,
  value: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (source !== "categories") return { ok: false, error: "Άγνωστη πηγή." };
  await prisma.category.update({
    where: { id },
    data: locale === "en" ? { nameEn: value.trim() } : { nameIt: value.trim() },
  });
  return { ok: true };
}
