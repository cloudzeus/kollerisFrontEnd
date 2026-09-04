"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/account/session";

/**
 * Αγαπημένα προϊόντα.
 *
 * Ο πελάτης εργαλείων δεν αγοράζει με την πρώτη: κοιτάζει, συγκρίνει, ρωτάει
 * τον υπεύθυνο, και γυρίζει σε δύο μέρες. Χωρίς αποθήκευση, το «γυρίζω αργότερα»
 * σημαίνει «ψάχνω από την αρχή» — και συχνά «το βρίσκω αλλού».
 *
 * Ο διακόπτης δεν επιστρέφει σφάλμα σε επισκέπτη· επιστρέφει `signedOut`, και η
 * οθόνη τον στέλνει στη σύνδεση κρατώντας το προϊόν. Ένα κόκκινο μήνυμα λάθους
 * για κάτι που είναι απλώς «δεν σε ξέρω ακόμη» τιμωρεί τον χρήστη για τη δική
 * μας απαίτηση.
 */
export type FavouriteToggle =
  | { ok: true; favourite: boolean }
  | { ok: false; reason: "signedOut" | "notFound" };

export async function toggleFavourite(productId: string): Promise<FavouriteToggle> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "signedOut" };

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, slug: true },
  });
  if (!product) return { ok: false, reason: "notFound" };

  const existing = await prisma.favourite.findUnique({
    where: { customerId_productId: { customerId: user.id, productId: product.id } },
    select: { id: true },
  });

  if (existing) {
    await prisma.favourite.delete({ where: { id: existing.id } });
  } else {
    await prisma.favourite.create({ data: { customerId: user.id, productId: product.id } });
  }

  // Μόνο η σελίδα των αγαπημένων: οι λίστες κρατούν τη δική τους κατάσταση στον
  // περιηγητή, και μια ανανέωση καταλόγου για ένα πάτημα καρδιάς είναι
  // δυσανάλογη.
  revalidatePath("/logariasmos/agapimena");

  return { ok: true, favourite: !existing };
}
