import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/i18n/routing";

/**
 * Τα αδέλφια ενός προϊόντος — τα ίδια παπούτσια σε άλλο νούμερο.
 *
 * Επιστρέφει ΟΛΑ τα μεγέθη της ομάδας, όχι μόνο τα διαθέσιμα: ένα νούμερο που
 * απλώς λείπει από τη λίστα είναι αόρατο, και ο πελάτης δεν μαθαίνει ποτέ ότι
 * το 45 υπάρχει αλλά τελείωσε. Το `inStock` το λέει, και ο επιλογέας το δείχνει
 * απενεργοποιημένο — «υπάρχει, δεν το έχουμε τώρα» αντί για σιωπή.
 */
export type VariantOption = {
  slug: string;
  label: string;
  /** Η σειρά που όρισε ο χειριστής στο HDCtool — 36 πριν από 37, S πριν από M. */
  order: number;
  inStock: boolean;
  /** Το νόημα του «M»: άλλο στα ρούχα, άλλο στα γάντια. */
  family: string | null;
  current: boolean;
};

export const variantsOf = cache(
  async (
    product: { id: string; variantGroup: string | null },
    locale: Locale,
  ): Promise<VariantOption[]> => {
    void locale;
    if (!product.variantGroup) return [];

    const rows = await prisma.product.findMany({
      where: { isActive: true, variantGroup: product.variantGroup },
      select: {
        id: true,
        slug: true,
        code: true,
        qty: true,
        inStock: true,
        sizes: { select: { label: true, family: true, order: true }, orderBy: { order: "asc" } },
      },
    });

    const options: VariantOption[] = [];
    for (const row of rows) {
      const size = row.sizes[0];
      // Χωρίς ετικέτα δεν υπάρχει τι να πατήσει κανείς. Δεν θα έπρεπε να συμβεί
      // — η ομάδα χτίζεται πάνω στην ανάθεση μεγέθους — αλλά μια γραμμή χωρίς
      // ετικέτα ως κενό κουμπί είναι χειρότερη από μια γραμμή που λείπει.
      if (!size) continue;
      options.push({
        slug: row.slug,
        label: size.label,
        order: size.order,
        inStock: row.inStock && Number(row.qty ?? 0) > 0,
        family: size.family,
        current: row.id === product.id,
      });
    }

    /*
     * Διπλά νούμερα: κρατά ένα, και προτιμά αυτό με απόθεμα.
     * ─────────────────────────────────────────────────────────────────────
     * Ο κατάλογος έχει πραγματικές διπλοκαταχωρίσεις — δύο MTRL για το ίδιο
     * είδος, ίδιο όνομα, ίδιος MPN, ίδιο νούμερο. Δύο κουμπιά «42» δίπλα-δίπλα
     * είναι ερώτηση χωρίς απάντηση για τον πελάτη.
     */
    const byLabel = new Map<string, VariantOption>();
    for (const option of options) {
      const kept = byLabel.get(option.label);
      if (!kept || (!kept.inStock && option.inStock) || option.current) {
        byLabel.set(option.label, kept?.current ? kept : option);
      }
    }

    return [...byLabel.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "el"));
  },
);
