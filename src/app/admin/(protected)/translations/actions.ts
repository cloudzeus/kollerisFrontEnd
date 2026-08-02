"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { listMissing, setTranslation, translateMissing, type TargetLocale } from "@/lib/i18n/coverage";
import type { TranslatableSource } from "@/lib/i18n/coverage-types";

/**
 * Translation management.
 *
 * Every write revalidates the storefront: a translation that lands but is not
 * visible until a cache expires reads as a translation that did not land.
 */

async function requireEditor(): Promise<void> {
  const session = await auth();
  assertCan(session?.user.role, "content");
}

export async function actionTranslateMissing(
  source: TranslatableSource,
  locale: TargetLocale,
  limit = 200,
) {
  await requireEditor();
  const result = await translateMissing(source, locale, { limit });
  revalidatePath("/", "layout");
  revalidatePath("/admin/translations");
  return result;
}

export async function actionListMissing(source: TranslatableSource, locale: TargetLocale) {
  await requireEditor();
  return listMissing(source, locale);
}

export async function actionSetTranslation(
  source: TranslatableSource,
  locale: TargetLocale,
  id: string,
  value: string,
) {
  await requireEditor();
  const result = await setTranslation(source, locale, id, value);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
