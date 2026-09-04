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
};

type Live = {
  badge: OfferBadge;
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
      };

      if (row.scope === "products") {
        return {
          badge,
          productSlugs: new Set(row.productSlugs),
          brandSlug: null,
          categorySlugs: null,
        };
      }
      if (row.scope === "brand") {
        return { badge, productSlugs: null, brandSlug: row.brandSlug, categorySlugs: null };
      }

      /*
       * Η κατηγορία είναι η μόνη που δεν απαντιέται από όσα κρατά η κάρτα.
       * Λύνεται σε ΣΥΝΟΛΟ SLUG μία φορά ανά αίτημα, αντί για ένα ερώτημα ανά
       * κάρτα: μια καμπάνια κατηγορίας πάνω σε πλέγμα 96 καρτών θα ήταν 96
       * ερωτήματα που ρωτούν όλα το ίδιο πράγμα.
       */
      const where = await campaignWhere(row);
      if (!where) return { badge, productSlugs: null, brandSlug: null, categorySlugs: null };

      const covered = await prisma.product.findMany({ where, select: { slug: true } });
      return {
        badge,
        productSlugs: null,
        brandSlug: null,
        categorySlugs: new Set(covered.map((p) => p.slug)),
      };
    }),
  );
});

/** Η καμπάνια που καλύπτει αυτό το προϊόν, ή τίποτα. */
export async function offerBadgeFor(
  product: { slug: string; brandSlug: string | null },
  locale: string,
): Promise<OfferBadge | null> {
  const campaigns = await liveCampaigns(locale);
  for (const c of campaigns) {
    if (c.productSlugs?.has(product.slug)) return c.badge;
    if (c.brandSlug && product.brandSlug && c.brandSlug === product.brandSlug) return c.badge;
    if (c.categorySlugs?.has(product.slug)) return c.badge;
  }
  return null;
}
