"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import {
  assignBanner,
  createBanner,
  deleteBanner,
  deleteTemplate,
  discardDraft,
  duplicateBanner,
  publish,
  renameBanner,
  saveDraft,
  saveTemplate,
  searchOffersForPicker,
  unassignZone,
} from "@/lib/banners/banners";
import { resolveCells } from "@/lib/banners/resolve";
import { productAssets, searchProductsForPicker } from "@/lib/media/picker";
import { productFill } from "@/lib/banners/product-fill";
import { generateCopy, translateText } from "@/lib/ai/deepseek";
import type { BannerContent, GridCell } from "@/lib/banners/contract";
import type { Locale } from "@/i18n/routing";

/**
 * Banner editing.
 *
 * Every action re-checks authorisation. A server action is a public endpoint —
 * the nav item being hidden has never been access control.
 */

async function requireEditor(): Promise<string> {
  const session = await auth();
  assertCan(session?.user.role, "content");
  return session?.user.email ?? "unknown";
}

export async function actionSaveTemplate(input: {
  id?: string;
  name: string;
  columns: number;
  rows: number;
  cells: GridCell[];
  aspect: string | null;
}) {
  const actor = await requireEditor();
  const result = await saveTemplate(input, actor);
  if (result.ok) revalidatePath("/admin/banners/templates");
  return result;
}

export async function actionDeleteTemplate(id: string) {
  await requireEditor();
  const result = await deleteTemplate(id);
  if (result.ok) revalidatePath("/admin/banners/templates");
  return result;
}

/* ───────────────────────── Banners ───────────────────────── */

/** A draft change touches nothing public; publishing and assigning do. */
function refreshStorefront() {
  revalidatePath("/", "layout");
}

export async function actionCreateBanner(name: string, templateId: string) {
  const actor = await requireEditor();
  const result = await createBanner(name, templateId, actor);
  if (result.ok) revalidatePath("/admin/banners");
  return result;
}

export async function actionDuplicateBanner(id: string) {
  const actor = await requireEditor();
  const result = await duplicateBanner(id, actor);
  /* Μόνο η λίστα του διαχειριστή. Το αντίγραφο γεννιέται ως πρόχειρο και
     χωρίς τοποθετήσεις, οπότε το κατάστημα δεν άλλαξε σε τίποτα. */
  if (result.ok) revalidatePath("/admin/banners");
  return result;
}

export async function actionRenameBanner(id: string, name: string) {
  const actor = await requireEditor();
  const result = await renameBanner(id, name, actor);
  if (result.ok) revalidatePath("/admin/banners");
  return result;
}

export async function actionSaveDraft(id: string, content: BannerContent) {
  const actor = await requireEditor();
  return saveDraft(id, content, actor);
}

export async function actionPublish(id: string) {
  const actor = await requireEditor();
  const result = await publish(id, actor);
  if (result.ok) {
    refreshStorefront();
    revalidatePath("/admin/banners");
  }
  return result;
}

export async function actionDiscardDraft(id: string) {
  const actor = await requireEditor();
  const result = await discardDraft(id, actor);
  if (result.ok) revalidatePath(`/admin/banners/${id}`);
  return result;
}

export async function actionDeleteBanner(id: string) {
  await requireEditor();
  const result = await deleteBanner(id);
  if (result.ok) {
    refreshStorefront();
    revalidatePath("/admin/banners");
  }
  return result;
}

export async function actionAssign(zone: string, bannerId: string) {
  await requireEditor();
  const result = await assignBanner(zone, bannerId);
  if (result.ok) refreshStorefront();
  return result;
}

export async function actionUnassign(zone: string) {
  await requireEditor();
  const result = await unassignZone(zone);
  if (result.ok) refreshStorefront();
  return result;
}

/**
 * Live values for the editor canvas and the preview.
 *
 * The same resolver the storefront uses, so the editor shows the real title and
 * the real price rather than the slug somebody typed. A Map does not cross the
 * server-action boundary; a record does.
 */
export async function actionResolve(content: BannerContent, locale: Locale) {
  await requireEditor();
  return Object.fromEntries(await resolveCells(content, locale));
}

/* ───────────────────────── Pickers ───────────────────────── */

export async function actionSearchProducts(query: string, locale: Locale) {
  await requireEditor();
  return searchProductsForPicker(query, locale, 24);
}

/** Every photograph a bound product can lend, for the editor's rail. */
export async function actionProductAssets(slug: string, locale: Locale) {
  await requireEditor();
  return productAssets(slug, locale);
}

export async function actionSearchOffers(query: string) {
  await requireEditor();
  return searchOffersForPicker(query);
}

/* ───────────────────────── Copy ───────────────────────── */

export async function actionGenerateCopy(input: {
  field: string;
  context: string;
  maxChars?: number;
  locale: string;
}) {
  await requireEditor();
  return generateCopy(input);
}

export async function actionTranslate(input: {
  text: string;
  from: string;
  to: string;
  maxChars?: number;
}) {
  await requireEditor();
  return translateText(input);
}

/**
 * Ένα προϊόν, έτοιμο για κελί: φωτογραφία (κομμένη αν ζητηθεί), κείμενο
 * (του καταλόγου, ή γραμμένο από την DeepSeek αν λείπει), και η διεύθυνση της
 * σελίδας του.
 *
 * Μία κλήση αντί για έξι κινήσεις στη διεπαφή. Το πρωτότυπο αρχείο δεν
 * πειράζεται ποτέ — η αφαίρεση φόντου ανεβάζει νέο δίπλα του.
 */
export async function actionProductFill(
  slug: string,
  locale: Locale,
  options?: { cutout?: boolean; write?: boolean },
) {
  await requireEditor();
  return productFill(slug, locale, options ?? {});
}
