import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Ποιος κωδικός εκπροσωπεί κάθε ομάδα μεγεθών στις λίστες.
 *
 * Τρέχει στο τέλος κάθε συγχρονισμού καταλόγου, μαζικά: οι ομάδες είναι
 * δεκάδες και τα μέλη τους εκατοντάδες, οπότε δύο δηλώσεις SQL αρκούν εκεί που
 * ένα update ανά προϊόν θα ήταν εκατοντάδες αναμονές δικτύου.
 *
 * Ο εκπρόσωπος είναι ο ΜΙΚΡΟΤΕΡΟΣ κωδικός της ομάδας — σταθερή επιλογή, όχι
 * «αυτός με απόθεμα». Το απόθεμα αλλάζει ανά δεκάλεπτο, και μια λίστα που
 * αλλάζει φωτογραφία και τιμή από μόνη της μοιάζει χαλασμένη. Ποια νούμερα
 * υπάρχουν σήμερα το λέει η σελίδα του προϊόντος, όπου και έχει σημασία.
 */
export async function refreshVariantLeads(): Promise<{ groups: number; followers: number }> {
  // Πρώτα όλοι εκπρόσωποι: όσα βγήκαν από ομάδα ή έμειναν μόνα τους πρέπει να
  // ξαναγίνουν ορατά, αλλιώς θα εξαφανίζονταν από τις λίστες για πάντα.
  await prisma.$executeRawUnsafe(
    `UPDATE products SET "isVariantLead" = true WHERE "isVariantLead" = false`,
  );

  const followers = await prisma.$executeRawUnsafe(`
    UPDATE products p SET "isVariantLead" = false
    WHERE p."variantGroup" IS NOT NULL
      AND p.code <> (
        SELECT MIN(q.code) FROM products q
        WHERE q."variantGroup" = p."variantGroup" AND q."isActive" = true
      )
  `);

  const groups = await prisma.product.findMany({
    where: { variantGroup: { not: null }, isActive: true },
    distinct: ["variantGroup"],
    select: { variantGroup: true },
  });

  return { groups: groups.length, followers };
}
