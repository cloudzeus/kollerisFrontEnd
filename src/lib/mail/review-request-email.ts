import "server-only";
import { prisma } from "@/lib/prisma";
import { sendTemplateMail } from "@/lib/mail/send-template";
import { siteOrigin } from "@/lib/seo/urls";

/**
 * «Πώς δούλεψαν;» — επτά ημέρες μετά την παράδοση, μία φορά.
 *
 * ── Μόνο σε όποιον μπορεί όντως να αξιολογήσει ────────────────────────────
 *
 * Η φόρμα αξιολόγησης ζητά σύνδεση: το `reviewableItems` ξεκινά από
 * `customerId`. Μια παραγγελία επισκέπτη δεν έχει λογαριασμό, οπότε κάθε
 * σύνδεσμος του email θα κατέληγε σε φόρμα εισόδου — ζητάμε χάρη και δίνουμε
 * εμπόδιο. Αυτές οι παραγγελίες απλώς δεν λαμβάνουν το μήνυμα.
 *
 * ── Και μόνο για είδη που υπάρχουν ακόμη ──────────────────────────────────
 *
 * Οι γραμμές παραγγελίας είναι στιγμιότυπο και κρατούν το όνομα ακόμη κι όταν
 * το προϊόν έχει φύγει από τον κατάλογο. Χωρίς `productId` δεν υπάρχει τι να
 * αξιολογηθεί, και ένα «Αξιολόγηση →» δίπλα σε κάτι που δεν πωλείται πια
 * είναι σύνδεσμος προς το πουθενά.
 *
 * ── Χωρίς κλίμακα 1–5 ─────────────────────────────────────────────────────
 *
 * Το template προσφέρει πέντε κουμπιά ενός κλικ για τη συνολική εμπειρία.
 * Δεν υπάρχει σημείο που να καταγράφει τέτοια βαθμολογία — πέντε κουμπιά που
 * δεν κάνουν τίποτα είναι χειρότερα από κανένα, γιατί ο παραλήπτης νομίζει
 * ότι βαθμολόγησε. Το `review.scale` μένει κενό και το μπλοκ δεν αποδίδεται.
 */

export async function sendReviewRequestEmail(orderNumber: string) {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { lines: true },
  });
  if (!order) return { ok: false as const, error: "Η παραγγελία δεν βρέθηκε." };
  if (!order.customerId) {
    return { ok: false as const, error: "Παραγγελία χωρίς λογαριασμό — δεν μπορεί να αξιολογήσει." };
  }

  const reviewsUrl = `${siteOrigin()}/logariasmos/axiologiseis`;

  /*
   * Ένα είδος ανά προϊόν. Δύο μεγέθη του ίδιου κωδικού είναι δύο γραμμές
   * παραγγελίας και μία αξιολόγηση — το ίδιο προϊόν δύο φορές στη λίστα
   * μοιάζει με σφάλμα.
   */
  const seen = new Set<string>();
  const items = order.lines
    .filter((line) => {
      if (!line.productId || seen.has(line.productId)) return false;
      seen.add(line.productId);
      return true;
    })
    .map((line) => ({
      brand: line.brand ?? "",
      sku: line.sku,
      name: line.name,
      image: line.imageUrl ?? "",
      review_url: reviewsUrl,
    }));

  if (items.length === 0) {
    return { ok: false as const, error: "Καμία γραμμή με προϊόν που να αξιολογείται." };
  }

  return sendTemplateMail({
    to: order.email,
    templateId: "review-request",
    subject: `Πώς δούλεψαν; Αξιολογήστε την παραγγελία ${order.orderNumber}`,
    preheader: "60 δευτερόλεπτα. Βοηθάτε άλλους επαγγελματίες να επιλέξουν σωστά.",
    context: order.orderNumber,
    data: {
      recipient: {
        first_name: order.firstName,
        last_name: order.lastName,
        email: order.email,
      },
      order: { number: order.orderNumber, items },
      review: { scale: [] },
    },
    text: [
      `Πώς δούλεψαν; Αξιολογήστε την παραγγελία ${order.orderNumber}`,
      "",
      ...items.map((i) => `· ${i.name}`),
      "",
      `Αξιολογήστε: ${reviewsUrl}`,
      "",
      "Κάτι δεν πήγε καλά; Μη γράψετε αξιολόγηση — απαντήστε σε αυτό το email.",
    ].join("\n"),
  });
}
