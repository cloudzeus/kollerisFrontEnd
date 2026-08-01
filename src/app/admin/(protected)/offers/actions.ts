"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { deleteOffer, saveOffer } from "@/lib/banners/banners";

/**
 * Offer editing.
 *
 * The storefront is revalidated on every write: an offer is on the page, and an
 * operator who ends a campaign should see it gone rather than learn that a
 * cache holds it for a while.
 */

async function requireEditor(): Promise<string> {
  const session = await auth();
  assertCan(session?.user.role, "merchandising");
  return session?.user.email ?? "unknown";
}

function refresh() {
  revalidatePath("/", "layout");
  revalidatePath("/admin/offers");
}

/** Dates arrive as `datetime-local` strings — local wall clock, no zone. */
const at = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

export async function actionSaveOffer(input: {
  id?: string;
  slug: string;
  title: string;
  badge?: string;
  href: string;
  image?: string;
  imageWide?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive?: boolean;
}) {
  const actor = await requireEditor();
  const result = await saveOffer(
    { ...input, startsAt: at(input.startsAt), endsAt: at(input.endsAt) },
    actor,
  );
  if (result.ok) refresh();
  return result;
}

export async function actionDeleteOffer(id: string) {
  await requireEditor();
  const result = await deleteOffer(id);
  if (result.ok) refresh();
  return result;
}
