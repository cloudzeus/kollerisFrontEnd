import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { SectionHead } from "@/components/chrome/SectionHead";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { CompareTray } from "@/components/compare/CompareTray";
import { ProductCard } from "@/components/product/ProductCard";
import { QuickViewProvider } from "@/components/product/QuickViewProvider";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getMiniCart } from "@/lib/cart/cart";
import { getNewArrivals, getOffers } from "@/lib/catalog/editorial";
import {
  getCatalogueStats,
  getMenuTree,
  getRootCategories,
  getTopBrands,
} from "@/lib/catalog/queries";
import {
  COMPARE_MAX,
  getCompareSelection,
  getCompareTray,
} from "@/lib/compare/compare";
import { upGreek } from "@/lib/greek";

export const metadata: Metadata = {
  title: "Προσφορές",
  description:
    "Πραγματικές μειώσεις τιμής σε επαγγελματικά εργαλεία. Όλες οι τιμές με ΦΠΑ, διαθεσιμότητα σε πραγματικό χρόνο.",
};

/**
 * Offers.
 *
 * The page is complete and wired to the real query — and it will render an
 * empty state until HDCtool grows a promotional price, because right now there
 * are no offers in the data.
 *
 * That is deliberate. The struck-through prices this site used to show were the
 * standing gap between two SoftOne price lists: 3.600 of 5.305 products (68%)
 * permanently "on sale", 2.192 of them at exactly −6%. A shop where two thirds
 * of the catalogue is always discounted has no discounts, and the Omnibus
 * directive treats an announced reduction as a claim about a previous price.
 *
 * So the empty state is not an apology. It says what is true, and routes the
 * visitor to the two things that ARE real value here: arrivals, and partner
 * pricing for trade accounts.
 */
export default async function OffersPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [
    offers,
    arrivals,
    menuTree,
    brands,
    stats,
    rootCategories,
    miniCart,
    compareSelection,
    compareTray,
  ] = await Promise.all([
    getOffers(locale, 24),
    getNewArrivals(locale, 1, 5),
    getMenuTree(locale),
    getTopBrands(locale, 16),
    getCatalogueStats(),
    getRootCategories(locale),
    getMiniCart(locale),
    getCompareSelection(),
    getCompareTray(locale),
  ]);

  const compareStateFor = (slug: string, scopeKey?: string | null) => {
    const selected = compareSelection.slugs.includes(slug);
    return {
      selected,
      disabled:
        !selected &&
        (compareSelection.slugs.length >= COMPARE_MAX ||
          (compareSelection.scopeKey != null &&
            scopeKey !== compareSelection.scopeKey)),
    };
  };

  const hasOffers = offers.products.length > 0;
  const latest = arrivals.periods[0];

  return (
    <QuickViewProvider locale={locale}>
      <SiteChrome
        locale={locale}
        cart={miniCart}
        categories={menuTree}
        brands={brands}
        stats={stats}
      />

      <main id="main">
        <div className="shell-x bg-k-ink-deep">
          <nav
            aria-label="Breadcrumb"
            className="t-util flex h-11 items-center gap-2.5 text-white/45"
          >
            <Link href="/" className="text-white/60 hover:text-white">
              {upGreek("Αρχική")}
            </Link>
            <span className="text-k-red">/</span>
            <span className="text-white">{upGreek("Προσφορές")}</span>
          </nav>

          <div className="pt-2.5 pb-8">
            <h1 className="font-artegra text-[22px] leading-[1.16] font-medium text-balance text-white lg:text-[30px]">
              {upGreek("Προσφορές")}
            </h1>
            <p className="mt-3.5 max-w-[640px] text-[13px] leading-[1.68] text-white/60 lg:text-sm">
              {hasOffers ? (
                <>
                  <strong className="font-semibold text-white">
                    {offers.total}
                  </strong>{" "}
                  κωδικοί σε μειωμένη τιμή
                  {offers.bestPercent != null && (
                    <>, με μεγαλύτερη μείωση −{offers.bestPercent}%</>
                  )}
                  . Όλες οι τιμές με ΦΠΑ.
                </>
              ) : (
                "Δεν τρέχει προσφορά αυτή τη στιγμή — και δεν θα βρείτε εδώ μόνιμες «εκπτώσεις» που δεν είναι εκπτώσεις."
              )}
            </p>
          </div>
        </div>

        {hasOffers ? (
          <section className="band-base">
            <div className="shell-x py-8 lg:py-12">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
                {offers.products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    compare={compareStateFor(product.slug, product.scopeKey)}
                  />
                ))}
              </div>
            </div>
          </section>
        ) : (
          <>
            {/*
              An honest empty state. It explains WHY there is nothing here —
              which is a stronger commercial message than a fake discount — and
              then hands over to the two things that are genuinely worth a
              visit.
            */}
            <section className="band-base">
              <div className="shell-x py-9 lg:py-14">
                <div className="max-w-3xl">
                  <p className="t-eyebrow flex items-center gap-2.5 text-k-red">
                    <span aria-hidden className="rule-accent block shrink-0" />
                    {upGreek("Καμία ενεργή προσφορά")}
                  </p>
                  <h2 className="font-artegra mt-3 text-[21px] leading-[1.2] text-balance text-k-ink lg:text-[28px]">
                    {upGreek("Μια έκπτωση που τρέχει πάντα δεν είναι έκπτωση")}
                  </h2>
                  <p className="mt-4 text-[13.5px] leading-[1.75] text-k-text-2">
                    Θα μπορούσαμε να δείχνουμε διαγραμμένη τιμή στα δύο τρίτα
                    του καταλόγου — η διαφορά ανάμεσα στη λιανική τιμή και στην
                    τιμή του eshop υπάρχει σε 3.600 από τους 5.305 κωδικούς μας.
                    Δεν το κάνουμε, γιατί δεν είναι μείωση: είναι η μόνιμη
                    διαφορά δύο τιμοκαταλόγων.
                  </p>
                  <p className="mt-3 text-[13.5px] leading-[1.75] text-k-text-2">
                    Όταν κάνουμε πραγματική προσφορά, θα τη δείτε εδώ — με την
                    προηγούμενη τιμή και το πόσο κερδίζετε.
                  </p>
                </div>

                <div className="mt-8 grid gap-px border border-k-line bg-k-line lg:mt-10 lg:grid-cols-2">
                  <div className="flex flex-col gap-3 border-l-[3px] border-k-red bg-white p-5 lg:p-7">
                    <p className="t-eyebrow text-k-red">
                      {upGreek("Η πραγματική έκπτωση")}
                    </p>
                    <p className="font-artegra text-[17px] leading-[1.3] text-k-ink lg:text-xl">
                      {upGreek("Τιμή συνεργάτη για επαγγελματίες")}
                    </p>
                    <p className="text-[12.5px] leading-[1.65] text-k-text-3">
                      Αν αγοράζετε για εταιρεία, η έκπτωση δεν είναι εποχιακή —
                      είναι μόνιμη και ισχύει σε όλο τον κατάλογο. Συν τιμολόγιο
                      και πληρωμή επί πιστώσει.
                    </p>
                    <Link
                      href="/eggrafi"
                      className="t-btn-sm mt-auto self-start bg-k-ink px-6 py-3.5 text-white transition-colors hover:bg-k-red"
                    >
                      {upGreek("Αίτηση B2B")} →
                    </Link>
                  </div>

                  <div className="flex flex-col gap-3 bg-white p-5 lg:p-7">
                    <p className="t-eyebrow text-k-text-4">
                      {upGreek("Ό,τι κινήθηκε τελευταία")}
                    </p>
                    <p className="font-artegra text-[17px] leading-[1.3] text-k-ink lg:text-xl">
                      {upGreek(
                        latest
                          ? `${latest.count.toLocaleString("el-GR")} ${
                              latest.count === 1
                                ? "νέος κωδικός"
                                : "νέοι κωδικοί"
                            }`
                          : "Νέες αφίξεις",
                      )}
                    </p>
                    <p className="text-[12.5px] leading-[1.65] text-k-text-3">
                      {latest
                        ? `Μπήκαν στην αποθήκη τον ${latest.label.toLowerCase()}. Δείτε τι άλλαξε στη γκάμα, μήνα προς μήνα.`
                        : "Δείτε τι μπήκε τελευταία στην αποθήκη, μήνα προς μήνα."}
                    </p>
                    <Link
                      href="/nees-afixeis"
                      className="t-btn-sm mt-auto self-start border-[1.5px] border-k-ink px-6 py-3.5 text-k-ink transition-colors hover:bg-k-ink hover:text-white"
                    >
                      {upGreek("Νέες αφίξεις")} →
                    </Link>
                  </div>
                </div>
              </div>
            </section>

            {latest && latest.products.length > 0 && (
              <section className="band-alt border-t border-k-line">
                <div className="shell-x py-8 lg:py-12">
                  <SectionHead
                    eyebrow={latest.label}
                    title="Πιο πρόσφατα στην αποθήκη"
                    meta={
                      <Link
                        href="/nees-afixeis"
                        className="t-btn-sm inline-block border-[1.5px] border-k-ink px-6 py-3.5 text-k-ink transition-colors hover:bg-k-ink hover:text-white"
                      >
                        {upGreek("Όλες οι αφίξεις")} →
                      </Link>
                    }
                  />
                  <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
                    {latest.products.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        compare={compareStateFor(
                          product.slug,
                          product.scopeKey,
                        )}
                      />
                    ))}
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <SiteFooter categories={rootCategories} />
      <CompareTray tray={compareTray} />
    </QuickViewProvider>
  );
}
