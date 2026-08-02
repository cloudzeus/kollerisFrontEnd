"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { deleteOffer, rewriteCopy, saveOffer } from "@/lib/offers/offers";
import { searchBrandsForPicker, searchCategoriesForPicker, searchProductsForPicker } from "@/lib/media/picker";
import { translateText } from "@/lib/ai/deepseek";
import type { OfferDraft } from "@/lib/offers/offer-types";
import type { Locale } from "@/i18n/routing";

/**
 * The offer wizard's endpoints.
 *
 * The storefront is revalidated on every write: a campaign that starts today
 * and is not visible until a cache expires has not started.
 */

async function requireEditor(): Promise<string> {
  const session = await auth();
  assertCan(session?.user.role, "merchandising");
  return session?.user.email ?? "unknown";
}

export async function actionSaveOffer(draft: OfferDraft) {
  const actor = await requireEditor();
  const result = await saveOffer(draft, actor);
  if (result.ok) {
    revalidatePath("/", "layout");
    revalidatePath("/admin/offers");
  }
  return result;
}

export async function actionDeleteOffer(id: string) {
  await requireEditor();
  const result = await deleteOffer(id);
  revalidatePath("/", "layout");
  revalidatePath("/admin/offers");
  return result;
}

/** Marketing rewrites — options to choose from, never applied automatically. */
export async function actionRewrite(input: {
  text: string;
  kind: "title" | "description";
  tone: string;
  context: string;
}) {
  await requireEditor();
  try {
    return { ok: true as const, options: await rewriteCopy(input) };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Απέτυχε." };
  }
}

export async function actionTranslateOffer(input: { text: string; to: "en" | "it"; maxChars: number }) {
  await requireEditor();
  try {
    return {
      ok: true as const,
      text: await translateText({ text: input.text, from: "el", to: input.to, maxChars: input.maxChars }),
    };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Απέτυχε." };
  }
}

export async function actionSearchProducts(query: string, locale: Locale) {
  await requireEditor();
  return searchProductsForPicker(query, locale, 24);
}

export async function actionSearchBrands(query: string, locale: Locale) {
  await requireEditor();
  return searchBrandsForPicker(query, locale);
}

export async function actionSearchCategories(query: string, locale: Locale) {
  await requireEditor();
  return searchCategoriesForPicker(query, locale, 40);
}
