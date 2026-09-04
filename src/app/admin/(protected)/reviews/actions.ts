"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { recomputeRating } from "@/lib/account/review-actions";

/**
 * Έγκριση και απόρριψη αξιολογήσεων.
 *
 * Ο μέσος όρος ξαναγράφεται σε ΚΑΘΕ αλλαγή κατάστασης, και όχι μόνο στην
 * έγκριση: η απόσυρση μιας εγκεκριμένης πρέπει να την αφαιρέσει από τον μέσο
 * όρο, αλλιώς το προϊόν κρατά για πάντα μια βαθμολογία που δεν φαίνεται
 * πουθενά.
 */
async function requireModerator(): Promise<string> {
  const session = await auth();
  assertCan(session?.user.role, "content");
  return session?.user.email ?? "unknown";
}

export async function approveReview(id: string) {
  const actor = await requireModerator();
  const row = await prisma.productReview.update({
    where: { id },
    data: { status: "approved", moderationNote: null, moderatedAt: new Date(), moderatedBy: actor },
    select: { productId: true },
  });
  await recomputeRating(row.productId);
  revalidatePath("/admin/reviews");
  return { ok: true as const };
}

export async function rejectReview(id: string, note: string) {
  const actor = await requireModerator();
  const row = await prisma.productReview.update({
    where: { id },
    data: {
      status: "rejected",
      // Ο λόγος φτάνει στον πελάτη. Κριτική που εξαφανίζεται χωρίς εξήγηση
      // διαβάζεται ως λογοκρισία — και επιστρέφει ως τηλεφώνημα.
      moderationNote: note.trim().slice(0, 400) || "Δεν πληροί τους όρους δημοσίευσης.",
      moderatedAt: new Date(),
      moderatedBy: actor,
    },
    select: { productId: true },
  });
  await recomputeRating(row.productId);
  revalidatePath("/admin/reviews");
  return { ok: true as const };
}
