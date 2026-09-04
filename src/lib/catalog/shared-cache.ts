import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";

/**
 * Ό,τι διαβάζεται από τον κατάλογο, κρατημένο ΑΝΑΜΕΣΑ σε αιτήματα.
 *
 * ── Τι έλειπε ──────────────────────────────────────────────────────────────
 *
 * Το `cache()` του React μνημονεύει μέσα σε ΕΝΑ render. Ανάμεσα σε αιτήματα δεν
 * κρατούσε τίποτα, και οι σελίδες απαντούν `no-store` γιατί διαβάζουν καλάθι
 * και γλώσσα από cookies — άρα ούτε το Cloudflare βοηθά. Κάθε επίσκεψη
 * ξανάτρεχε ΟΛΑ τα ερωτήματα.
 *
 * ── Γιατί είναι ασφαλές μόνο εδώ ───────────────────────────────────────────
 *
 * Οι συναρτήσεις που τυλίγονται δεν αγγίζουν cookies ούτε headers· παίρνουν τη
 * γλώσσα ως όρισμα και διαβάζουν μόνο τον κατάλογο. Το καλάθι, η σύγκριση και
 * ο λογαριασμός ΔΕΝ μπαίνουν ποτέ εδώ: είναι ανά χρήστη, και ένα κοινόχρηστο
 * cache θα έδειχνε το καλάθι του ενός στον άλλον.
 */
export const CATALOGUE_TAG = "catalogue";

export function sharedCatalogue<
  F extends (...args: never[]) => Promise<unknown>,
>(key: string, seconds: number, fn: F): F {
  /* `cache()` απ' έξω: μέσα σε ΕΝΑ render η ίδια κλήση δεν χτυπά καν το
     αποθετήριο. `unstable_cache` από μέσα: ανάμεσα σε αιτήματα. Η υπογραφή
     περνά αυτούσια — αλλιώς τα ορίσματα με προεπιλογή γίνονται `unknown`. */
  return cache(
    unstable_cache(
      fn as unknown as (...args: unknown[]) => Promise<unknown>,
      [key],
      {
        revalidate: seconds,
        tags: [CATALOGUE_TAG, key],
      },
    ),
  ) as unknown as F;
}
