import "server-only";
import { prisma } from "@/lib/prisma";
import { trackingSummary } from "@/lib/courier/acs";
import { sendDeliveredEmail } from "@/lib/mail/order-delivered-email";
import { sendReviewRequestEmail } from "@/lib/mail/review-request-email";

/**
 * Οι δύο σαρώσεις που κλείνουν τον κύκλο μιας παραγγελίας.
 *
 * ── Γιατί υπάρχουν ────────────────────────────────────────────────────────
 *
 * Το DELIVERED ήταν ετικέτα που δεν έγραφε ποτέ κανείς. Η παραγγελία έμενε
 * SHIPPED για πάντα: ο ιχνηλάτης του πελάτη κρατούσε το τελευταίο βήμα σβηστό
 * ακόμη κι όταν το δέμα είχε παραδοθεί πριν από βδομάδες, και η αίτηση
 * αξιολόγησης — που μετράει επτά ημέρες ΑΠΟ την παράδοση — δεν είχε από πού
 * να ξεκινήσει να μετράει.
 *
 * ── Η ACS αποφασίζει, όχι εμείς ───────────────────────────────────────────
 *
 * Η κατάσταση διαβάζεται από τις σημαίες του `trackingSummary`, όχι από το
 * κείμενο των σημείων ελέγχου. Το «ΜΗ ΠΑΡΑΔΟΘΗΚΕ» περιέχει το «ΠΑΡΑΔΟΘΗΚΕ»,
 * και μια παραγγελία που σημειώνεται παραδομένη κατά λάθος στέλνει σε πελάτη
 * που ακόμη περιμένει ένα email που λέει «ελέγξτε τα είδη σας».
 *
 * ── Μόνο προς τα εμπρός, και μία φορά ─────────────────────────────────────
 *
 * Σαρώνονται μόνο SHIPPED παραγγελίες με voucher. Μια ακυρωμένη δεν γίνεται
 * παραδομένη επειδή η ACS επέστρεψε κάτι, και η σφραγίδα `reviewRequestedAt`
 * εγγυάται ότι η αίτηση αξιολόγησης φεύγει μία φορά — η σάρωση τρέχει ξανά
 * και ξανά, και δεύτερο email που ζητά την ίδια αξιολόγηση είναι ανεπιθύμητο.
 */

/** Πόσο κρατάει η ευγένεια: επτά ημέρες για να δοκιμαστεί το εργαλείο. */
const REVIEW_DELAY_DAYS = 7;

/**
 * Πόσες παραγγελίες ανά πέρασμα.
 *
 * Κάθε μία είναι μια κλήση στην ACS μέσω HDCtool, και η ουρά του SoftOne στο
 * HDCtool είναι μονοθέσια: εκατό ταυτόχρονες θα κρατούσαν τη γραμμή για κάθε
 * άλλη δουλειά. Η σάρωση τρέχει τακτικά — δεν χρειάζεται να τα προλάβει όλα
 * με τη μία.
 */
const BATCH = 25;

export type SweepReport = {
  checked: number;
  delivered: number;
  reviewsRequested: number;
  errors: string[];
};

/** Παραγγελίες σε μεταφορά → παραδομένες, με το email παράδοσης. */
export async function sweepDeliveries(): Promise<Pick<SweepReport, "checked" | "delivered" | "errors">> {
  const orders = await prisma.order.findMany({
    where: { status: "SHIPPED", acsVoucherNo: { not: null }, deliveredAt: null },
    select: { id: true, orderNumber: true, acsVoucherNo: true },
    orderBy: { shippedAt: "asc" },
    take: BATCH,
  });

  const errors: string[] = [];
  let delivered = 0;

  for (const order of orders) {
    const result = await trackingSummary(order.acsVoucherNo!);
    if (!result.ok) {
      errors.push(`${order.orderNumber}: ${result.error}`);
      continue;
    }
    const summary = result.data.summary;
    /*
     * `null` = το voucher δεν έχει σαρωθεί ακόμη στο δίκτυο. Πραγματική
     * απάντηση, όχι σφάλμα — δοκιμάζεται ξανά στο επόμενο πέρασμα.
     *
     * `returned` = επιστροφή στον αποστολέα. ΔΕΝ είναι παράδοση, και το να
     * σταλεί «η παραγγελία σας παραδόθηκε» σε κάποιον που δεν την πήρε ποτέ
     * είναι η χειρότερη εκδοχή αυτού του email. Μένει SHIPPED ώστε να το δει
     * άνθρωπος στη διαχείριση.
     */
    if (!summary || !summary.delivered || summary.returned) continue;

    /*
     * Η ημερομηνία της ACS όπου δίνεται, αλλιώς τώρα.
     * Η σάρωση μπορεί να τρέξει ώρες μετά την πραγματική παράδοση, και οι
     * επτά ημέρες της αξιολόγησης μετρούν από την παράδοση — όχι από τη
     * στιγμή που τυχαία το διαπιστώσαμε.
     */
    const parsed = summary.deliveryDate ? new Date(summary.deliveryDate) : null;
    const deliveredAt =
      parsed && !Number.isNaN(parsed.getTime()) && parsed.getTime() <= Date.now()
        ? parsed
        : new Date();

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "DELIVERED",
        deliveredAt,
        history: {
          create: {
            status: "DELIVERED",
            actor: "acs-sweep",
            note: summary.deliveryInfo?.slice(0, 240) || `ACS ${order.acsVoucherNo}`,
          },
        },
      },
    });
    delivered += 1;

    const mail = await sendDeliveredEmail(order.orderNumber);
    if (!mail.ok) errors.push(`${order.orderNumber}: email παράδοσης — ${mail.error}`);
  }

  return { checked: orders.length, delivered, errors };
}

/** Παραδομένες πριν από επτά ημέρες → αίτηση αξιολόγησης, μία φορά. */
export async function sweepReviewRequests(): Promise<Pick<SweepReport, "reviewsRequested" | "errors">> {
  const cutoff = new Date(Date.now() - REVIEW_DELAY_DAYS * 24 * 3600_000);

  const orders = await prisma.order.findMany({
    where: {
      status: "DELIVERED",
      deliveredAt: { not: null, lte: cutoff },
      reviewRequestedAt: null,
      /*
       * Μόνο παραγγελίες με λογαριασμό. Η φόρμα αξιολόγησης ζητά σύνδεση, οπότε
       * σε επισκέπτη κάθε σύνδεσμος του email καταλήγει σε φόρμα εισόδου —
       * ζητάμε χάρη και δίνουμε εμπόδιο. Φιλτράρονται εδώ και όχι στο email,
       * ώστε να μη σφραγίζονται σαν «στάλθηκε» παραγγελίες που δεν θα σταλούν
       * ποτέ: αν αποκτήσουν λογαριασμό αργότερα, τις πιάνει το επόμενο πέρασμα.
       */
      customerId: { not: null },
    },
    select: { id: true, orderNumber: true },
    orderBy: { deliveredAt: "asc" },
    take: BATCH,
  });

  const errors: string[] = [];
  let requested = 0;

  for (const order of orders) {
    /*
     * Η σφραγίδα ΠΡΙΝ την αποστολή.
     * Αν έμπαινε μετά, μια κατάρρευση ανάμεσα στα δύο θα ξανάστελνε το ίδιο
     * email στο επόμενο πέρασμα. Ένα χαμένο email είναι προτιμότερο από δύο
     * ίδια: το πρώτο δεν το πρόσεξε κανείς, το δεύτερο διαβάζεται ως spam.
     */
    await prisma.order.update({
      where: { id: order.id },
      data: { reviewRequestedAt: new Date() },
    });

    const mail = await sendReviewRequestEmail(order.orderNumber);
    if (!mail.ok) {
      errors.push(`${order.orderNumber}: αίτηση αξιολόγησης — ${mail.error}`);
      continue;
    }
    requested += 1;
  }

  return { reviewsRequested: requested, errors };
}

export async function sweepOrders(): Promise<SweepReport> {
  const deliveries = await sweepDeliveries();
  const reviews = await sweepReviewRequests();
  return {
    checked: deliveries.checked,
    delivered: deliveries.delivered,
    reviewsRequested: reviews.reviewsRequested,
    errors: [...deliveries.errors, ...reviews.errors],
  };
}
