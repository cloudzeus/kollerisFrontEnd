"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import {
  clearSpec,
  clearSpecForSubgroup,
  deleteImage,
  saveImageOrder,
  saveSpec,
} from "@/lib/pim/pim";
import { searchProductsForPicker } from "@/lib/media/picker";
import type { Locale } from "@/i18n/routing";

/**
 * Catalogue edits.
 *
 * These write to HDCtool, not here. The local projection is not touched: it is
 * a copy, and editing the copy would make the two disagree until the next sync
 * papered over it. The screen tells the operator the change lands on the
 * storefront after that sync — which is honest, and is the price of edits that
 * apply on Magento and Skroutz too.
 */

async function requireCatalogue(): Promise<void> {
  const session = await auth();
  assertCan(session?.user.role, "catalogue");
}

export async function actionSearch(query: string, locale: Locale) {
  await requireCatalogue();
  return searchProductsForPicker(query, locale, 20);
}

export async function actionSaveOrder(mtrl: number, urls: string[], featureUrl: string | null) {
  await requireCatalogue();
  const result = await saveImageOrder(mtrl, urls, featureUrl);
  revalidatePath("/admin/catalogue");
  return result;
}

export async function actionSaveSpec(mtrl: number, field: string, value: string, locale: Locale) {
  await requireCatalogue();
  const result = await saveSpec(mtrl, field, value, locale);
  revalidatePath("/admin/catalogue");
  return result;
}

/** Remove the field from this product only. */
export async function actionClearSpec(mtrl: number, field: string) {
  await requireCatalogue();
  const result = await clearSpec(mtrl, field);
  revalidatePath("/admin/catalogue");
  return result;
}

/**
 * Remove the field from every product in the same final subgroup.
 *
 * The bulk one. A wrong spec is usually wrong for the whole family it was
 * imported with, and fixing them one at a time is how half of them stay wrong —
 * but it writes to products nobody is looking at, so the UI confirms first and
 * reports how many changed.
 */
export async function actionClearSpecSubgroup(mtrl: number, field: string) {
  await requireCatalogue();
  const result = await clearSpecForSubgroup(mtrl, field);
  revalidatePath("/admin/catalogue");
  return result;
}

/** Remove one image from the product. */
export async function actionDeleteImage(mtrl: number, url: string) {
  await requireCatalogue();
  const result = await deleteImage(mtrl, url);
  revalidatePath("/admin/catalogue");
  return result;
}
