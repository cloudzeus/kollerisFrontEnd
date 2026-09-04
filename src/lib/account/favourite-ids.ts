import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/account/session";

/**
 * Τα αγαπημένα του συνδεδεμένου πελάτη, ως σύνολο id.
 *
 * ΕΝΑ ερώτημα ανά αίτημα, όχι ένα ανά κάρτα: ένα πλέγμα 96 προϊόντων θα ρωτούσε
 * 96 φορές «είναι αυτό αγαπημένο;». Ο πελάτης έχει δεκάδες αγαπημένα, όχι
 * χιλιάδες, οπότε ολόκληρο το σύνολο κοστίζει λιγότερο από ένα join.
 *
 * Ο επισκέπτης παίρνει άδειο σύνολο χωρίς να ακουμπήσει τη βάση.
 */
export const favouriteIds = cache(async (): Promise<Set<string>> => {
  const user = await getCurrentUser();
  if (!user) return new Set();

  const rows = await prisma.favourite.findMany({
    where: { customerId: user.id },
    select: { productId: true },
  });
  return new Set(rows.map((r) => r.productId));
});
