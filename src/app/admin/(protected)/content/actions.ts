"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { CONTENT, CONTENT_BY_KEY } from "@/lib/content/registry";
import { getContent, listForAdmin, setContent } from "@/lib/content/content";
import { OpenRouterError, translateValue } from "@/lib/ai/openrouter";
import { routing, type Locale } from "@/i18n/routing";

export type SaveResult = { ok: boolean; saved: number; errors: string[] };

export type TranslateFieldResult = { ok: true; value: string } | { ok: false; error: string };
export type TranslatePageResult = { ok: true; values: Record<string, string> } | { ok: false; error: string };

/** Kinds whose value is prose worth translating; url/image are left alone. */
const TRANSLATABLE = new Set(["text", "long", "rich"]);

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

/**
 * Translate one block's Greek source into another locale, via OpenRouter.
 *
 * The result is returned to the editor as an unsaved draft — it is never
 * written here. The Greek source is whatever the shop shows today (a saved el
 * row, or the compiled fallback), so a translation always has something to work
 * from. The API key stays on the server; only the translated string crosses back.
 */
export async function translateField(key: string, toLocale: string): Promise<TranslateFieldResult> {
  const session = await auth();
  assertCan(session?.user.role, "content");

  if (!routing.locales.includes(toLocale as Locale)) return { ok: false, error: "Άγνωστη γλώσσα" };

  const def = CONTENT_BY_KEY.get(key);
  if (!def) return { ok: false, error: `Άγνωστο κλειδί: ${key}` };
  if (!TRANSLATABLE.has(def.kind)) return { ok: false, error: "Αυτό το πεδίο δεν μεταφράζεται." };

  const source = await getContent(key, routing.defaultLocale);
  if (!source.trim()) return { ok: true, value: "" };

  try {
    const value = await translateValue({
      kind: def.kind,
      text: source,
      from: routing.defaultLocale,
      to: toLocale,
      maxChars: def.maxChars,
    });
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: error instanceof OpenRouterError ? error.message : "Σφάλμα μετάφρασης." };
  }
}

/**
 * Fill every still-untranslated block on one page from Greek. Blocks already
 * edited in the target locale are left as they are; url/image blocks are skipped.
 * Returns a draft map {key: value} the editor applies without saving.
 */
export async function translatePage(pageId: string, toLocale: string): Promise<TranslatePageResult> {
  const session = await auth();
  assertCan(session?.user.role, "content");

  if (!routing.locales.includes(toLocale as Locale)) return { ok: false, error: "Άγνωστη γλώσσα" };

  const views = await listForAdmin(toLocale as Locale);
  const stillFallback = new Set(views.filter((v) => v.isFallback).map((v) => v.key));

  const defs = CONTENT.filter(
    (c) => c.page === pageId && TRANSLATABLE.has(c.kind) && stillFallback.has(c.key),
  );

  const values: Record<string, string> = {};
  try {
    for (const def of defs) {
      const source = await getContent(def.key, routing.defaultLocale);
      if (!source.trim()) continue;
      values[def.key] = await translateValue({
        kind: def.kind,
        text: source,
        from: routing.defaultLocale,
        to: toLocale,
        maxChars: def.maxChars,
      });
    }
  } catch (error) {
    return { ok: false, error: error instanceof OpenRouterError ? error.message : "Σφάλμα μετάφρασης." };
  }

  return { ok: true, values };
}
