"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/account/session";

/**
 * Η υποβολή μιας αξιολόγησης.
 *
 * Το δικαίωμα ελέγχεται ΕΔΩ, ξανά, και όχι μόνο στην οθόνη που δείχνει τη
 * φόρμα: το productId είναι ένα string που μπορεί να στείλει οποιοσδήποτε, και
 * μια λίστα «τι μπορείς να αξιολογήσεις» δεν είναι έλεγχος πρόσβασης — είναι
 * βοήθημα πλοήγησης.
 *
 * Κάθε υποβολή ΞΑΝΑΜΠΑΙΝΕΙ σε αναμονή, ακόμη κι όταν επεξεργάζεται εγκεκριμένη.
 * Αλλιώς μια εγκεκριμένη κριτική θα ήταν κενή επιταγή: γράφεις κάτι αθώο,
 * περνάει, και μετά το αλλάζεις σε ό,τι θέλεις.
 */
const schema = z.object({
  productId: z.string().min(1),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().min(20, "Γράψτε λίγα λόγια — τουλάχιστον 20 χαρακτήρες.").max(4000),
});

export type ReviewResult =
  | { ok: true }
  | { ok: false; error: string };

export async function submitReview(formData: FormData): Promise<ReviewResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Χρειάζεται σύνδεση." };

  const parsed = schema.safeParse({
    productId: formData.get("productId"),
    rating: formData.get("rating"),
    title: formData.get("title") || undefined,
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ελέγξτε τα πεδία." };
  }
  const input = parsed.data;

  /* Η απόδειξη της αγοράς. Παραδομένη ή απεσταλμένη — μια παραγγελία που
     πληρώθηκε χθες δεν έχει τίποτα να πει για το εργαλείο. */
  const purchase = await prisma.orderLine.findFirst({
    where: {
      productId: input.productId,
      order: { customerId: user.id, status: { in: ["SHIPPED", "DELIVERED"] } },
    },
    orderBy: { order: { createdAt: "asc" } },
    select: { order: { select: { id: true, orderNumber: true } } },
  });
  if (!purchase) {
    return { ok: false, error: "Μπορείτε να αξιολογήσετε μόνο προϊόντα που έχετε παραλάβει." };
  }

  await prisma.productReview.upsert({
    where: {
      productId_customerId: { productId: input.productId, customerId: user.id },
    },
    create: {
      productId: input.productId,
      customerId: user.id,
      orderId: purchase.order.id,
      orderNumber: purchase.order.orderNumber,
      rating: input.rating,
      title: input.title || null,
      body: input.body,
    },
    update: {
      rating: input.rating,
      title: input.title || null,
      body: input.body,
      status: "pending",
      moderationNote: null,
      moderatedAt: null,
      moderatedBy: null,
    },
  });

  /* Η επεξεργασία εγκεκριμένης την αποσύρει από το site μέχρι να ξαναεγκριθεί,
     οπότε ο μέσος όρος πρέπει να ξαναγραφτεί τώρα. */
  await recomputeRating(input.productId);

  revalidatePath("/logariasmos/axiologiseis");
  return { ok: true };
}

/**
 * Ξαναγράφει τον μέσο όρο και το πλήθος ενός προϊόντος.
 *
 * Από τις ΕΓΚΕΚΡΙΜΕΝΕΣ μόνο. Καλείται σε κάθε αλλαγή κατάστασης — σπάνιο
 * γεγονός, σε αντίθεση με την ανάγνωση, που γίνεται σε κάθε κάρτα κάθε λίστας.
 */
export async function recomputeRating(productId: string): Promise<void> {
  const agg = await prisma.productReview.aggregate({
    where: { productId, status: "approved" },
    _avg: { rating: true },
    _count: { _all: true },
  });

  await prisma.product.update({
    where: { id: productId },
    data: {
      ratingCount: agg._count._all,
      // Null και όχι μηδέν όταν δεν υπάρχει καμία: το μηδέν είναι βαθμολογία,
      // και μια κάρτα με «0 αστέρια» λέει κάτι που κανείς δεν είπε.
      ratingAvg: agg._count._all > 0 ? (agg._avg.rating ?? 0) : null,
    },
  });
}
