import { prisma } from "@/lib/prisma";
import { hdctool } from "@/lib/hdctool/client";

/**
 * Οι προσφορές του HDCtool, κατεβασμένες στον τοπικό πίνακα καμπανιών.
 *
 * ── Γιατί κατεβαίνουν καθόλου ──────────────────────────────────────────────
 *
 * Η ΤΙΜΗ της προσφοράς ταξιδεύει ανά προϊόν, μέσα στο feed προϊόντων, και
 * κάθεται στο `Product.priceNet` — βλ. `lib/sync/offer-projection.ts`. Αυτό
 * που ΔΕΝ ταξιδεύει έτσι είναι η προσφορά σαν πράγμα: ο τίτλος, το κείμενο σε
 * τρεις γλώσσες, το παράθυρο. Χωρίς αυτά το σήμα της κάρτας θα έδειχνε σε
 * σελίδα `/prosfores/<slug>` που δεν υπάρχει.
 *
 * ── Ένα σύστημα ορίζει τις προσφορές ───────────────────────────────────────
 *
 * Η εγγραφή κατεβαίνει πάντα με `discount: "none"`: η τοπική καμπάνια έχει
 * δική της αριθμητική (`discountedNet`), και ένα ποσοστό εδώ θα κοβόταν πάνω
 * σε τιμή που είναι ΗΔΗ η τιμή προσφοράς. Η εμβέλειά της δεν είναι λίστα slug
 * αλλά `Product.offerSlug` — βλ. `lib/offers/coverage.ts`.
 */

export type FeedOffer = {
  slug: string;
  badge: string | null;
  titleEl: string;
  titleEn: string;
  titleIt: string;
  descriptionEl: string;
  descriptionEn: string;
  descriptionIt: string;
  startsAt: string | Date | null;
  endsAt: string | Date | null;
};

const cut = (value: string | null | undefined, max: number) => (value ?? "").trim().slice(0, max);
const date = (value: string | Date | null) => (value == null ? null : value instanceof Date ? value : new Date(value));

/** Η εγγραφή που γράφεται, από μία προσφορά του feed. Καθαρή συνάρτηση. */
export function offerUpsertData(offer: FeedOffer) {
  const slug = offer.slug.trim();
  const badge = cut(offer.badge, 40) || null;
  /* Ο τίτλος είναι υποχρεωτικός στη στήλη και ορατός στη σελίδα: ένα κενό θα
     έβγαζε άτιτλη σελίδα προσφοράς. Σήμα, και στο τέλος το slug. */
  const titleEl = cut(offer.titleEl, 160) || badge || slug;

  return {
    titleEl,
    titleEn: cut(offer.titleEn, 160) || titleEl,
    titleIt: cut(offer.titleIt, 160) || titleEl,
    descriptionEl: cut(offer.descriptionEl, 400),
    descriptionEn: cut(offer.descriptionEn, 400),
    descriptionIt: cut(offer.descriptionIt, 400),
    badge,
    href: `/prosfores/${slug}`,
    scope: "products" as const,
    productSlugs: [] as string[],
    brandSlug: null,
    categorySlug: null,
    // Καμία αριθμητική εδώ — η τιμή ανήκει στο HDCtool.
    discount: "none" as const,
    discountValue: null,
    startsAt: date(offer.startsAt),
    endsAt: date(offer.endsAt),
    isActive: true,
    fromHdctool: true,
    updatedBy: "HDCtool",
  };
}

export type OffersSyncResult = { upserted: number; retired: number };

/**
 * Τραβά τις ενεργές προσφορές και ευθυγραμμίζει τον τοπικό πίνακα.
 *
 * Ό,τι έφυγε από το feed απενεργοποιείται, δεν σβήνεται: μια προσφορά που
 * τελείωσε κρατά τη σελίδα και το ιστορικό της, και ένα `delete` θα έσβηνε
 * παραγγελίες που δείχνουν σε αυτήν.
 */
export async function syncOffersFromHdctool(): Promise<OffersSyncResult> {
  const response = await hdctool.offers();
  const offers = (response.offers ?? []).filter((o) => o.slug?.trim());

  for (const offer of offers) {
    const slug = offer.slug.trim();
    const data = offerUpsertData(offer);

    /*
     * ΜΙΑ ΠΡΟΣΦΟΡΑ ΧΩΡΙΣ ΠΡΟΪΟΝΤΑ ΕΔΩ ΔΕΝ ΕΜΦΑΝΙΖΕΤΑΙ.
     *
     * Το HDCtool σερβίρει δύο καταστήματα με διαφορετικό κατάλογο: το
     * Milwaukee κρατά μόνο προϊόντα Milwaukee, το Kolleris όλα τα υπόλοιπα.
     * Μια προσφορά σε εργαλεία GEDORE κατεβαίνει και στα δύο, αλλά στο
     * Milwaukee δεν αντιστοιχεί σε κανένα είδος — και θα έβγαζε σελίδα
     * προσφοράς με άδειο πλέγμα, και σήμα σε μπάνερ που δεν πουλά τίποτα.
     *
     * Μετριέται ΜΕΤΑ τον συγχρονισμό προϊόντων, που έχει ήδη γράψει το
     * `offerSlug`. Μια ολοκαίνουργια προσφορά που προηγήθηκε των προϊόντων
     * της μένει ανενεργή για ένα πέρασμα και ανοίγει στο επόμενο.
     */
    const inThisShop = await prisma.product.count({ where: { isActive: true, offerSlug: slug } });
    const row = { ...data, isActive: inThisShop > 0 };

    await prisma.offer.upsert({
      where: { slug },
      create: { slug, ...row },
      update: row,
    });
  }

  const live = offers.map((o) => o.slug.trim());
  const retired = await prisma.offer.updateMany({
    where: { fromHdctool: true, isActive: true, slug: { notIn: live } },
    data: { isActive: false, updatedBy: "HDCtool" },
  });

  return { upserted: offers.length, retired: retired.count };
}
