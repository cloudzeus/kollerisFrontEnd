import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { campaignWhere } from "@/lib/offers/coverage";

/**
 * Το σήμα προσφοράς μιας κάρτας.
 *
 * Η `campaignsForProducts` έκανε ήδη αυτή τη δουλειά — και δεν την καλούσε
 * κανείς. Ήταν φτιαγμένη για μια λίστα slug, δηλαδή για κλήση από τη σελίδα,
 * και οι σελίδες που δείχνουν κάρτες είναι δεκατέσσερις: PLP, μάρκα,
 * αναζήτηση, προσφορές, νέες αφίξεις, αρχική, σχετικά προϊόντα, σύγκριση.
 * Δεκατέσσερα σημεία που πρέπει να θυμάται κανείς, και το δέκατο πέμπτο που θα
 * προστεθεί δεν θα το θυμάται.
 *
 * Εδώ το ερώτημα αντιστρέφεται: η ΚΑΡΤΑ ρωτάει, μία φορά, και ο κατάλογος των
 * ενεργών καμπανιών χτίζεται μία φορά ανά αίτημα.
 *
 * ── Γιατί δεν κοστίζει ─────────────────────────────────────────────────────
 *
 * Οι καμπάνιες είναι λίγες και τα προϊόντα χιλιάδες, οπότε ρωτάμε τις
 * καμπάνιες, όχι τα προϊόντα. Και από τους τρεις τρόπους που μια καμπάνια
 * ορίζει την εμβέλειά της, οι δύο απαντιούνται χωρίς καμία επίσκεψη στη βάση:
 *
 *   λίστα προϊόντων — η κάρτα έχει το slug της
 *   μάρκα          — η κάρτα έχει το brandSlug της
 *   κατηγορία      — μόνο αυτή θέλει ερώτημα, γιατί η κατηγορία ζει σε τρεις
 *                    διαφορετικές στήλες του ERP ανάλογα με το επίπεδο
 *
 * Άρα ένα πλέγμα 96 καρτών με δύο καμπάνιες μάρκας κάνει ΕΝΑ ερώτημα — αυτό
 * που φέρνει τις καμπάνιες.
 */
export type OfferBadge = {
  /** Το κείμενο πάνω στο σήμα, π.χ. «-30%». */
  label: string;
  /** Ο τίτλος της καμπάνιας, για το `title` και για την ανάγνωση με φωνή. */
  title: string;
  href: string;
  /**
   * Το ποσοστό έκπτωσης της γραμμής, 0 όταν η καμπάνια δεν μειώνει τιμή.
   *
   * ΠΟΣΟΣΤΟ και όχι ποσό, επειδή έτσι το θέλει το παραστατικό: η γραμμή του
   * SoftOne κρατά την κανονική τιμή στο `PRICE` και την έκπτωση χωριστά στο
   * `DISC1PRC` («Εκπτ.%1» — επιβεβαιωμένο με `getTableFields` πάνω στο ζωντανό
   * ERP, όχι υποθετικό). Στέλνοντας προ-εκπτωμένη τιμή, το παραστατικό θα
   * έδειχνε ότι το προϊόν πουλήθηκε φθηνότερα χωρίς να λέει γιατί, και η
   * έκπτωση δεν θα εμφανιζόταν σε καμία αναφορά.
   *
   * Η έκπτωση σε ΠΟΣΟ μετατρέπεται εδώ σε ποσοστό για τον ίδιο λόγο.
   */
  discountPercent: number;
};

/**
 * Το ποσοστό που αφαιρεί μια καμπάνια από τη γραμμή.
 *
 * `bogo` και `none` δεν μειώνουν τιμή μονάδας — το «δύο στην τιμή του ενός»
 * είναι ποσότητα, όχι τιμή, και θα ήταν λάθος να παρουσιαστεί ως −50%.
 */
export function campaignDiscountPercent(
  discount: string,
  value: number | null,
  unitNet: number | null,
): number {
  if (!value || value <= 0) return 0;
  if (discount === "percent") return Math.min(90, value);
  if (discount === "amount") {
    if (!unitNet || unitNet <= 0) return 0;
    // Ποτέ πάνω από 90%: μια έκπτωση ποσού μεγαλύτερη από την τιμή θα έδινε
    // αρνητική ή μηδενική τιμή, που δεν είναι προσφορά αλλά σφάλμα καταχώρισης.
    return Math.min(90, (value / unitNet) * 100);
  }
  return 0;
}

type Live = {
  badge: OfferBadge;
  discount: string;
  discountValue: number | null;
  productSlugs: Set<string> | null;
  brandSlug: string | null;
  categorySlugs: Set<string> | null;
};

const GENERIC = "ΠΡΟΣΦΟΡΑ";

const liveCampaigns = cache(async (locale: string): Promise<Live[]> => {
  const now = new Date();
  const rows = await prisma.offer.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    select: {
      slug: true,
      titleEl: true,
      titleEn: true,
      titleIt: true,
      badge: true,
      discount: true,
      discountValue: true,
      scope: true,
      productSlugs: true,
      brandSlug: true,
      categorySlug: true,
    },
    // Σταθερή σειρά: με δύο καμπάνιες πάνω στο ίδιο προϊόν, η κάρτα πρέπει να
    // δείχνει την ίδια και στις δύο επισκέψεις, αλλιώς μοιάζει με σφάλμα.
    orderBy: [{ startsAt: "desc" }, { slug: "asc" }],
  });

  return Promise.all(
    rows.map(async (row) => {
      const title =
        (locale === "en" ? row.titleEn : locale === "it" ? row.titleIt : row.titleEl) || row.titleEl;
      const badge: OfferBadge = {
        // Ελεύθερο κείμενο· άδειο σημαίνει «δεν το όρισε κανείς», όχι «χωρίς σήμα».
        label: row.badge?.trim() || GENERIC,
        title,
        href: `/prosfores/${row.slug}`,
        // Το ποσό εξαρτάται από την τιμή του προϊόντος, οπότε λύνεται στο σημείο
        // της κλήσης· εδώ μένει ό,τι είναι κοινό για όλη την καμπάνια.
        discountPercent: campaignDiscountPercent(row.discount, Number(row.discountValue), null),
      };

      if (row.scope === "products") {
        return {
          badge,
          discount: row.discount,
          discountValue: row.discountValue == null ? null : Number(row.discountValue),
          productSlugs: new Set(row.productSlugs),
          brandSlug: null,
          categorySlugs: null,
        };
      }
      if (row.scope === "brand") {
        return {
          badge,
          discount: row.discount,
          discountValue: row.discountValue == null ? null : Number(row.discountValue),
          productSlugs: null,
          brandSlug: row.brandSlug,
          categorySlugs: null,
        };
      }

      /*
       * Η κατηγορία είναι η μόνη που δεν απαντιέται από όσα κρατά η κάρτα.
       * Λύνεται σε ΣΥΝΟΛΟ SLUG μία φορά ανά αίτημα, αντί για ένα ερώτημα ανά
       * κάρτα: μια καμπάνια κατηγορίας πάνω σε πλέγμα 96 καρτών θα ήταν 96
       * ερωτήματα που ρωτούν όλα το ίδιο πράγμα.
       */
      const where = await campaignWhere(row);
      const common = {
        badge,
        discount: row.discount,
        discountValue: row.discountValue == null ? null : Number(row.discountValue),
        productSlugs: null,
        brandSlug: null,
      };
      if (!where) return { ...common, categorySlugs: null };

      const covered = await prisma.product.findMany({ where, select: { slug: true } });
      return { ...common, categorySlugs: new Set(covered.map((p) => p.slug)) };
    }),
  );
});

/**
 * Η καμπάνια που καλύπτει αυτό το προϊόν, ή τίποτα.
 *
 * Το `unitNet` είναι προαιρετικό και χρειάζεται μόνο για έκπτωση σε ΠΟΣΟ, που
 * δεν μπορεί να γίνει ποσοστό χωρίς να ξέρουμε την τιμή.
 */
export async function offerBadgeFor(
  product: { slug: string; brandSlug: string | null; unitNet?: number | null },
  locale: string,
): Promise<OfferBadge | null> {
  const campaigns = await liveCampaigns(locale);
  for (const c of campaigns) {
    const hit =
      c.productSlugs?.has(product.slug) ||
      (c.brandSlug != null && product.brandSlug != null && c.brandSlug === product.brandSlug) ||
      c.categorySlugs?.has(product.slug);
    if (!hit) continue;

    return {
      ...c.badge,
      discountPercent: round2(
        campaignDiscountPercent(c.discount, c.discountValue, product.unitNet ?? null),
      ),
    };
  }
  return null;
}

/** Δύο δεκαδικά — όσα κρατά και η στήλη του παραστατικού. */
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Η τιμή μετά την έκπτωση της καμπάνιας. */
export function discountedNet(unitNet: number, discountPercent: number): number {
  if (discountPercent <= 0) return unitNet;
  return round2(unitNet * (1 - discountPercent / 100));
}
