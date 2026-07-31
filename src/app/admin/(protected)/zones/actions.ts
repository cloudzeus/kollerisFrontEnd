"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import {
  addWidget,
  removeWidget,
  reorderZone,
  setWidgetEnabled,
  updateWidget,
} from "@/lib/zones/zones";
import { searchProductsForPicker, searchCategoriesForPicker } from "@/lib/media/picker";
import { uploadImage } from "@/lib/media/bunny";
import type { Locale } from "@/i18n/routing";

/**
 * Zone editing.
 *
 * Authorisation is checked in every action, not only on the page: a server
 * action is a public endpoint, and the nav item being hidden has never been an
 * access control.
 *
 * The storefront is revalidated on every mutation. Widgets are page furniture —
 * an operator who moves one should see it moved, not learn that a cache holds
 * the old order for a while.
 */

async function requireEditor(): Promise<string> {
  const session = await auth();
  assertCan(session?.user.role, "content");
  return session?.user.email ?? "unknown";
}

function refresh() {
  revalidatePath("/", "layout");
  revalidatePath("/admin/zones");
}

export async function actionAdd(zone: string, type: string) {
  const actor = await requireEditor();
  const result = await addWidget(zone, type, actor);
  refresh();
  return result;
}

export async function actionUpdate(id: string, props: Record<string, unknown>) {
  const actor = await requireEditor();
  const result = await updateWidget(id, props, actor);
  refresh();
  return result;
}

export async function actionToggle(id: string, enabled: boolean) {
  const actor = await requireEditor();
  const result = await setWidgetEnabled(id, enabled, actor);
  refresh();
  return result;
}

export async function actionRemove(id: string) {
  await requireEditor();
  const result = await removeWidget(id);
  refresh();
  return result;
}

export async function actionReorder(zone: string, ids: string[]) {
  const actor = await requireEditor();
  const result = await reorderZone(zone, ids, actor);
  refresh();
  return result;
}

/** Product search behind the image picker. */
export async function actionSearchProducts(query: string, locale: Locale) {
  await requireEditor();
  return searchProductsForPicker(query, locale, 24);
}

export async function actionSearchCategories(query: string, locale: Locale) {
  await requireEditor();
  return searchCategoriesForPicker(query, locale, 40);
}

/**
 * Upload one image.
 *
 * Takes FormData rather than a base64 string: a 6MB press JPEG becomes an 8MB
 * string through base64, and server actions have a body limit that a marketing
 * upload will find.
 */
export async function actionUpload(
  form: FormData,
): Promise<{ ok: true; url: string; saved: string } | { ok: false; error: string }> {
  await requireEditor();

  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Δεν βρέθηκε αρχείο" };
  if (file.size > 25 * 1024 * 1024) {
    return { ok: false, error: "Το αρχείο ξεπερνά τα 25MB" };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadImage(buffer, { folder: "widgets", name: file.name });
    const before = Math.round(result.originalBytes / 1024);
    const after = Math.round(result.bytes / 1024);
    return {
      ok: true,
      url: result.url,
      // Shown in the UI: the point of the conversion is invisible otherwise.
      saved: `${before} KB → ${after} KB · ${result.width}×${result.height}`,
    };
  } catch (error) {
    console.error("[zones] upload failed", error);
    return { ok: false, error: error instanceof Error ? error.message : "Η αποστολή απέτυχε" };
  }
}
