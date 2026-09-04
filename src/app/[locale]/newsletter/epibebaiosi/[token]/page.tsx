import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getMiniCart } from "@/lib/cart/cart";
import { getCatalogueStats, getMenuTree, getRootCategories, getTopBrands } from "@/lib/catalog/queries";
import { confirmSubscription } from "@/lib/newsletter/subscribe";
import { upGreek } from "@/lib/greek";

/**
 * Ο προορισμός του συνδέσμου επιβεβαίωσης.
 *
 * Δεν είναι ευρετηριάσιμη: ένα token μιας χρήσης σε αποτελέσματα αναζήτησης
 * είναι και άχρηστο και διαρροή. Και δεν κάνει redirect στην αρχική «επειδή
 * πέτυχε» — ο επισκέπτης έκανε μια ενέργεια και θέλει να δει ότι μετρήθηκε.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ConfirmPage({
  params,
}: {
  params: Promise<{ locale: Locale; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  const [result, categories, menuTree, brands, stats, miniCart] = await Promise.all([
    confirmSubscription(token),
    getRootCategories(locale),
    getMenuTree(locale),
    getTopBrands(locale, 16),
    getCatalogueStats(),
    getMiniCart(locale),
  ]);

  const ok = result === "confirmed";

  return (
    <>
      <SiteChrome locale={locale} cart={miniCart} categories={menuTree} brands={brands} stats={stats} />

      <main id="main" className="shell-x py-16 lg:py-24">
        <div className="max-w-[62ch]">
          <p className="t-eyebrow text-k-gold-ink">{upGreek("Newsletter")}</p>
          <h1 className="font-display mt-3 text-[34px] leading-[1.08] t-display uppercase lg:text-[46px]">
            {ok ? "Η εγγραφή σας ολοκληρώθηκε." : "Ο σύνδεσμος δεν ισχύει."}
          </h1>
          <p className="mt-5 text-[15px] leading-[1.7] text-k-text-2">
            {ok
              ? "Θα λαμβάνετε προσφορές, νέα προϊόντα και ανακοινώσεις — το πολύ δύο email τον μήνα. Σε κάθε ένα από αυτά υπάρχει σύνδεσμος διαγραφής που δουλεύει με ένα κλικ."
              : "Ο σύνδεσμος επιβεβαίωσης ισχύει για 48 ώρες και χρησιμοποιείται μία φορά. Αν πέρασε ο χρόνος ή τον έχετε ήδη πατήσει, ξεκινήστε την εγγραφή από την αρχή."}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/prosfores"
              className="font-sans bg-k-red px-7 py-3.5 text-[15px] font-bold tracking-[0.08em] text-white transition-colors hover:bg-k-red-hover"
            >
              {upGreek("Δείτε τις προσφορές")}
            </Link>
            <Link
              href="/"
              className="font-sans border border-k-line-strong px-7 py-3.5 text-[15px] font-bold tracking-[0.08em] text-k-ink transition-colors hover:border-k-ink"
            >
              {upGreek("Στην αρχική")}
            </Link>
          </div>
        </div>
      </main>

      <SiteFooter categories={categories} />
    </>
  );
}
