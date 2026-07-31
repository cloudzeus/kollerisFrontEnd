"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { CONTENT } from "@/lib/content/registry";
import { setContent } from "@/lib/content/content";
import { routing, type Locale } from "@/i18n/routing";

export type SaveResult = { ok: boolean; saved: number; errors: string[] };

/**
 * Save edited copy for one locale.
 *
 * Authorisation is checked here, not only on the page: a server action is a
 * public endpoint.
 *
 * Every storefront path is revalidated, not just the homepage. Copy edited here
 * appears in the header, the cart and the product page too, and an operator who
 * changes a shipping message should not have to learn which pages cache it.
 */
export async function saveContent(locale: string, formData: FormData): Promise<SaveResult> {
  const session = await auth();
  assertCan(session?.user.role, "content");

  if (!routing.locales.includes(locale as Locale)) {
    return { ok: false, saved: 0, errors: ["Άγνωστη γλώσσα"] };
  }

  const actor = session?.user.email ?? "unknown";
  const errors: string[] = [];
  const changed: string[] = [];

  for (const def of CONTENT) {
    const raw = formData.get(def.key);
    if (typeof raw !== "string") continue;

    const result = await setContent(def.key, locale as Locale, raw, actor);
    if (result.ok) changed.push(def.key);
    else errors.push(result.error);
  }

  if (changed.length > 0) {
    await prisma.adminAuditLog.create({
      data: {
        userId: session!.user.id,
        action: "content.update",
        entity: "ContentBlock",
        entityId: `${locale}:${changed.join(",")}`.slice(0, 255),
        diff: { locale, keys: changed },
      },
    });
  }

  revalidatePath("/", "layout");
  revalidatePath("/admin/content");
  return { ok: errors.length === 0, saved: changed.length, errors };
}
