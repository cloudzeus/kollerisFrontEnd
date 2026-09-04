import "server-only";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/i18n/routing";
import type { OrderStatus } from "@/generated/prisma/enums";

/**
 * Αξιολογήσεις προϊόντων από πελάτες που τα αγόρασαν.
 *
 * Η αγορά είναι ΠΡΟΫΠΟΘΕΣΗ, όχι σήμα δίπλα στο όνομα. Ένα κατάστημα εργαλείων
 * ζει από την εμπιστοσύνη επαγγελματιών, και μια κριτική από κάποιον που δεν
 * κράτησε ποτέ το εργαλείο αξίζει λιγότερο από καμία — τραβάει κάτω και όσες
 * είναι αληθινές.
 *
 * ── Ποια παραγγελία μετράει ────────────────────────────────────────────────
 *
 * Μόνο ΠΑΡΑΔΟΜΕΝΗ ή απεσταλμένη. Μια παραγγελία που πληρώθηκε χθες δεν έχει
 * τίποτα να πει για το εργαλείο· η αξιολόγηση αφορά τη χρήση, όχι την αγορά.
 * Ακυρωμένες και αποτυχημένες δεν δίνουν δικαίωμα καθόλου.
 *
 * ── Οι παραλλαγές μετρούν ως ένα ───────────────────────────────────────────
 *
 * Αγόρασε το παπούτσι σε 42 και αξιολογεί «το παπούτσι», όχι «το 42». Η κριτική
 * γράφεται στο προϊόν που αγοράστηκε, αλλά διαβάζεται σε όλη την ομάδα — τα
 * αδέλφια είναι το ίδιο αντικείμενο σε άλλο νούμερο.
 */

/** Οι καταστάσεις παραγγελίας που δίνουν δικαίωμα αξιολόγησης. */
const DELIVERED_STATUSES: OrderStatus[] = ["SHIPPED", "DELIVERED"];

export type ReviewableItem = {
  productId: string;
  slug: string;
  name: string;
  image: string | null;
  orderNumber: string;
  orderId: string;
  purchasedAt: Date;
  /** Η υπάρχουσα αξιολόγηση, όταν έχει ήδη γραφτεί. */
  existing: {
    id: string;
    rating: number;
    title: string | null;
    body: string;
    status: "pending" | "approved" | "rejected";
    moderationNote: string | null;
  } | null;
};

/**
 * Τι μπορεί να αξιολογήσει αυτός ο πελάτης, και τι έχει ήδη αξιολογήσει.
 *
 * Μία εγγραφή ανά ΠΡΟΪΟΝ, όχι ανά γραμμή παραγγελίας: όποιος αγόρασε το ίδιο
 * τρυπάνι τρεις φορές δεν έχει τρεις γνώμες. Κρατιέται η παλαιότερη αγορά, που
 * είναι και αυτή με τη μεγαλύτερη χρήση πίσω της.
 */
export async function reviewableItems(
  customerId: string,
  locale: Locale,
): Promise<ReviewableItem[]> {
  const lines = await prisma.orderLine.findMany({
    where: {
      productId: { not: null },
      order: { customerId, status: { in: DELIVERED_STATUSES } },
    },
    orderBy: { order: { createdAt: "asc" } },
    select: {
      productId: true,
      name: true,
      imageUrl: true,
      order: { select: { id: true, orderNumber: true, createdAt: true } },
    },
  });
  if (lines.length === 0) return [];

  type Line = (typeof lines)[number];
  const firstByProduct = new Map<string, Line>();
  for (const line of lines) {
    if (line.productId && !firstByProduct.has(line.productId)) {
      firstByProduct.set(line.productId, line);
    }
  }
  const productIds = [...firstByProduct.keys()];

  const [products, reviews] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        slug: true,
        name: true,
        isActive: true,
        images: { where: { isFeature: true }, take: 1, select: { url: true } },
        translations: { select: { locale: true, name: true } },
      },
    }),
    prisma.productReview.findMany({
      where: { customerId, productId: { in: productIds } },
      select: {
        id: true, productId: true, rating: true, title: true, body: true,
        status: true, moderationNote: true,
      },
    }),
  ]);

  const byId = new Map(products.map((p) => [p.id, p]));
  const reviewByProduct = new Map(reviews.map((r) => [r.productId, r]));

  const items: ReviewableItem[] = [];
  for (const [productId, line] of firstByProduct) {
    const product = byId.get(productId);
    // Προϊόν που έφυγε από τον κατάλογο: η αξιολόγηση δεν θα είχε πού να
    // εμφανιστεί, και το κενό πλαίσιο στη λίστα είναι χειρότερο από την απουσία.
    if (!product?.isActive) continue;

    const existing = reviewByProduct.get(productId);
    const translated = product.translations.find((t) => t.locale === locale)?.name;
    items.push({
      productId,
      slug: product.slug,
      // Το όνομα του ΚΑΤΑΛΟΓΟΥ, όχι το παγωμένο της παραγγελίας: ο πελάτης
      // αξιολογεί το προϊόν όπως λέγεται σήμερα.
      name: translated?.trim() || product.name,
      image: product.images[0]?.url ?? line.imageUrl,
      orderNumber: line.order.orderNumber,
      orderId: line.order.id,
      purchasedAt: line.order.createdAt,
      existing: existing
        ? {
            id: existing.id,
            rating: existing.rating,
            title: existing.title,
            body: existing.body,
            status: existing.status,
            moderationNote: existing.moderationNote,
          }
        : null,
    });
  }

  // Τα ΑΝΑΞΙΟΛΟΓΗΤΑ πρώτα: αυτά είναι η δουλειά που έχει η σελίδα να προτείνει.
  return items.sort((a, b) => {
    if (!a.existing !== !b.existing) return a.existing ? 1 : -1;
    return b.purchasedAt.getTime() - a.purchasedAt.getTime();
  });
}

/** Οι εγκεκριμένες αξιολογήσεις ενός προϊόντος — και ολόκληρης της ομάδας του. */
export async function approvedReviews(product: {
  id: string;
  variantGroup: string | null;
}) {
  const scope = product.variantGroup
    ? { product: { variantGroup: product.variantGroup } }
    : { productId: product.id };

  return prisma.productReview.findMany({
    where: { status: "approved", ...scope },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      rating: true,
      title: true,
      body: true,
      createdAt: true,
      customer: { select: { firstName: true, lastName: true } },
    },
  });
}
