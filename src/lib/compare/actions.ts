"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  COMPARE_COOKIE,
  COMPARE_COOKIE_MAX_AGE,
  COMPARE_MAX,
  getCompareSelection,
  parseCompareCookie,
  scopeOf,
  serialiseCompareCookie,
  type CompareSelection,
} from "@/lib/compare/compare";

/**
 * Compare mutations.
 *
 * The selection is a cookie, so these are the only place it is written. Every
 * rule the tray depends on — the four-column cap, the one-classification lock —
 * is enforced here rather than in the button, because a disabled button is a
 * hint, not a constraint.
 */

export type CompareActionResult =
  | { ok: true; selected: boolean; count: number }
  | { ok: false; error: "invalid_input" | "product_unavailable" | "full" | "wrong_scope" };

async function writeSelection(selection: CompareSelection) {
  const store = await cookies();
  if (selection.slugs.length === 0 || !selection.scopeKey) {
    store.delete(COMPARE_COOKIE);
  } else {
    store.set(COMPARE_COOKIE, serialiseCompareCookie(selection), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: COMPARE_COOKIE_MAX_AGE,
    });
  }

  /*
   * The tray and every card's checkbox are server-rendered into the layout, so
   * a narrower revalidation would leave forty checkboxes showing the wrong
   * state on whichever grid the click happened in. Next ships the fresh RSC
   * payload back with the action response — no navigation, no client store.
   */
  revalidatePath("/", "layout");
}

const slugSchema = z.object({ slug: z.string().min(1).max(140) });

export async function toggleCompare(input: unknown): Promise<CompareActionResult> {
  const parsed = slugSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { slug } = parsed.data;

  const current = await getCompareSelection();

  // Removing never needs the product to still exist — a delisted item must
  // still be removable from the tray.
  if (current.slugs.includes(slug)) {
    const slugs = current.slugs.filter((s) => s !== slug);
    await writeSelection(slugs.length ? { ...current, slugs } : { scopeKey: null, slugs: [] });
    return { ok: true, selected: false, count: slugs.length };
  }

  const product = await prisma.product.findFirst({
    where: { slug, isActive: true },
    select: { cccSubgroup2: true, mtrgroup: true, mtrcategory: true },
  });
  if (!product) return { ok: false, error: "product_unavailable" };

  const scope = scopeOf(product);
  if (!scope) return { ok: false, error: "wrong_scope" };

  // First pick sets the scope. A pick from elsewhere is refused rather than
  // silently starting a new comparison — losing three selections to a stray
  // click is worse than being told no.
  if (current.scopeKey && current.scopeKey !== scope.key) {
    return { ok: false, error: "wrong_scope" };
  }
  if (current.slugs.length >= COMPARE_MAX) return { ok: false, error: "full" };

  const slugs = [...current.slugs, slug];
  await writeSelection({ scopeKey: scope.key, slugs });
  return { ok: true, selected: true, count: slugs.length };
}

export async function clearCompare(): Promise<CompareActionResult> {
  await writeSelection({ scopeKey: null, slugs: [] });
  return { ok: true, selected: false, count: 0 };
}

/**
 * Form-action variants for the tray.
 *
 * `<form action={…}>` in a server component needs no client component at all,
 * and keeps remove/clear working as plain POSTs.
 */
export async function removeFromCompareForm(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const current = parseCompareCookie((await cookies()).get(COMPARE_COOKIE)?.value);
  const slugs = current.slugs.filter((s) => s !== slug);
  await writeSelection(slugs.length ? { ...current, slugs } : { scopeKey: null, slugs: [] });
}

export async function clearCompareForm() {
  await writeSelection({ scopeKey: null, slugs: [] });
}
