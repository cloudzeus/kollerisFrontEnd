import { getTranslations, getLocale } from "next-intl/server";
import { logoScaleStyle } from "@/lib/catalog/brand-logo";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import type { BrandTile } from "@/lib/catalog/queries";
import { SectionHeading } from "./SectionHeading";
import { upGreek } from "@/lib/greek";

/*
 * `prefetch={false}` σε κάθε σύνδεσμο αυτού του αρχείου.
 * ─────────────────────────────────────────────────────────────────────────────
 * Μετρημένο στην παραγωγή: μία επίσκεψη στο `/katalogos` έβγαζε **34** αιτήματα
 * RSC — 18 για κατηγορίες, 14 για την πλοήγηση και το υποσέλιδο, καθένα 450-780ms.
 * Κάθε ένα από αυτά είναι ΠΛΗΡΗΣ απόδοση στον διακομιστή, γιατί οι σελίδες
 * απαντούν `cache-control: no-store` (διαβάζουν καλάθι και γλώσσα από cookies).
 *
 * Δηλαδή ένας επισκέπτης παρήγαγε 34 renders, και με μερικούς ταυτόχρονους ο
 * διακομιστής κορεννύεται — γι' αυτό «αργεί σε ΟΛΕΣ τις σελίδες» και όχι σε μία.
 *
 * Η πλοήγηση και το υποσέλιδο είναι σε κάθε σελίδα και δείχνουν παντού· κανείς
 * δεν πρόκειται να πατήσει και τα δεκατέσσερα. Το prefetch έχει νόημα για τον
 * έναν σύνδεσμο που ΘΑ πατηθεί, όχι για τον κατάλογο των πάντων.
 */

/**
 * Brand wall — live brands ordered by how many listed products each has, with
 * the real count under the name. Brands with zero listed products are filtered
 * out in `getTopBrands`, per the spec's rule for the Brands page.
 *
 * Handoff: 8 columns / 92px cells on desktop. Mobile 390 has no brand wall in
 * the handoff, so this collapses to a 3-up grid rather than inventing one.
 */
export async function BrandWall({
  brands,
  totalBrands,
}: {
  brands: BrandTile[];
  totalBrands: number;
}) {
  const locale = await getLocale();
  const t = await getTranslations("home.BrandWall");
  if (brands.length === 0) return null;

  return (
    <section className="border-t border-k-line bg-white shell-x py-7 lg:pt-15 lg:pb-16">
      <SectionHeading
        center
        eyebrow="Exclusive partnerships"
        title={t("ta_brands_poy_antiprosopeyoyme")}
      >
        <p className="t-news-body mt-3 text-k-text-3">
          {totalBrands} {t("brands_me_energa_proionta_mia")}
        </p>
      </SectionHeading>

      <div className="grid grid-cols-3 gap-px border border-k-line bg-k-line sm:grid-cols-4 lg:grid-cols-8">
        {brands.map((brand) => (
          <Link
            key={brand.id}
            href={`/brands/${brand.slug}`}
            className="flex h-[132px] flex-col items-center justify-center gap-1.5 bg-white p-5 transition-colors hover:bg-k-surface-2 lg:h-[150px]"
            prefetch={false}
          >
            {brand.logo ? (
              /* Square source art — see the note in MegaMenu. */
              <Image
                src={brand.logo}
                alt={brand.name}
                /* Εγγενές μέγεθος διπλάσιο του αποδοσμένου, για οθόνες 2x:
                   στα 176 ένα λογότυπο 116px θα ανέβαινε μόλις 1,5 φορά. */
                width={200}
                height={200}
                style={logoScaleStyle(brand.slug)}
                className="block h-[76px] w-[76px] max-w-full object-contain lg:h-[90px] lg:w-[90px]"
              />
            ) : (
              <span className="t-brand-name text-k-text-2">{brand.name}</span>
            )}
            <span className="t-brand-count text-k-text-6">
              {brand.productCount.toLocaleString(locale)} {upGreek(t("kod"))}
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-3.5 flex justify-center">
        <Link
          href="/brands"
          className="t-link-mono border-b-[1.5px] border-k-red pb-[3px] text-k-ink transition-colors hover:text-k-red"
          prefetch={false}
        >
          {upGreek(t("ola_ta_brands", { totalBrands: totalBrands }))} →
        </Link>
      </div>
    </section>
  );
}
