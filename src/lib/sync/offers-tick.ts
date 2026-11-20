import { syncOffersFromHdctool } from "@/lib/sync/offers-sync";

/**
 * Οι προσφορές, ανεξάρτητα από τα προϊόντα.
 *
 * ── Γιατί δεν αρκεί το webhook ─────────────────────────────────────────────
 *
 * Το κατάστημα μαθαίνει για αλλαγές με webhook, και το webhook φεύγει όταν
 * αλλάζει ΠΡΟΪΟΝ. Μια προσφορά όμως ξεκινά, λήγει ή εξαντλείται χωρίς να
 * αλλάξει καμία γραμμή προϊόντος στο HDCtool: η ενεργοποίηση γράφει τιμές στο
 * ERP και στις δικές της γραμμές, όχι στον κατάλογο.
 *
 * Επαληθεύτηκε στην παραγωγή: μετά την ενεργοποίηση της πρώτης προσφοράς το
 * Milwaukee, που ρωτά κάθε πέντε λεπτά, την είχε αμέσως — ενώ εδώ δεν έφτασε
 * ποτέ, γιατί κανένα webhook δεν είχε λόγο να φύγει.
 *
 * Ποτέ δεν πετά: τρέχει μέσα σε timer, και μια σκέτη εξαίρεση από timer είναι
 * unhandled rejection που ρίχνει τον server.
 */
export async function offersTick(): Promise<void> {
  try {
    const result = await syncOffersFromHdctool();
    if (result.upserted > 0 || result.retired > 0) {
      console.log(`[offers-tick] ${result.upserted} ενεργές, ${result.retired} έληξαν`);
    }
  } catch (error) {
    console.error(
      "[offers-tick] αποτυχία συγχρονισμού προσφορών:",
      error instanceof Error ? error.message : String(error),
    );
  }
}
