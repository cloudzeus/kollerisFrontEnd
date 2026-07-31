import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { CompareAdviceBand } from "@/components/compare/CompareAdviceBand";
import { CompareMatrix } from "@/components/compare/CompareMatrix";
import { CompareToolbar } from "@/components/compare/CompareToolbar";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { ProductCard } from "@/components/product/ProductCard";
import { QuickViewProvider } from "@/components/product/QuickViewProvider";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getMiniCart } from "@/lib/cart/cart";
import {
  getCatalogueStats,
  getMenuTree,
  getRootCategories,
  getTopBrands,
} from "@/lib/catalog/queries";
import {
  COMPARE_MAX,
  getCompareSelection,
  getCompareSuggestions,
  getCompareView,
  parseIdsParam,
} from "@/lib/compare/compare";
import { upGreek } from "@/lib/greek";

type PageProps = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "Σύγκριση προϊόντων",
  description:
    "Συγκρίνετε έως 4 προϊόντα της ίδιας κατηγορίας — τιμή, διαθεσιμότητα, εγγύηση και πλήρη τεχνικά χαρακτηριστικά δίπλα-δίπλα.",
  // A comparison is a working view over the catalogue, not a page that should
  // compete with the PDPs it links to.
  robots: { index: false, follow: true },
};

/**
 * Compare — `?ids=` is the source of truth, the cookie is the fallback.
 *
 * The URL wins so a comparison can be sent to a colleague, so the back button
 * undoes a column removal, and so the two display toggles cost no JavaScript.
 * The cookie is what the tray on the catalogue pages writes; arriving here with
 * no query at all simply picks it up.
 *
 * The page is a server component end to end. The only client code on it is the
 * add-to-cart button in each column head and the compare checkbox on the
 * suggestion cards — two leaves, each taking plain strings.
 */
export default async function ComparePage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const raw = await searchParams;
  const selection = await getCompareSelection();
  const requested = raw.ids ? parseIdsParam(raw.ids) : selection.slugs;

  const diffOnly = raw.diff === "1";
  const highlightBest = raw.best === "1";

  const [view, menuTree, brands, stats, rootCategories, miniCart] =
    await Promise.all([
      getCompareView(requested, locale),
      getMenuTree(locale),
      getTopBrands(locale, 16),
      getCatalogueStats(),
      getRootCategories(locale),
      getMiniCart(locale),
    ]);

  const ids = view.columns.map((c) => c.slug);
  const suggestions = await getCompareSuggestions(
    view.scopeKey,
    ids,
    locale,
    5,
  );
  const canAddMore = view.columns.length < COMPARE_MAX;

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
            <Link
              href="/katalogos"
              className="hidden text-white/60 hover:text-white sm:inline"
            >
              {upGreek("Κατάλογος")}
            </Link>
            <span className="hidden text-k-red sm:inline">/</span>
            <span className="text-white">{upGreek("Σύγκριση")}</span>
          </nav>

          <div className="flex flex-col gap-5 pt-2.5 pb-7 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
            <div className="min-w-0">
              <h1 className="font-artegra text-[22px] leading-[1.16] font-medium text-white lg:text-[30px]">
                {upGreek("Σύγκριση προϊόντων")}
              </h1>
              <p className="mt-3.5 max-w-[640px] text-[13px] leading-[1.68] text-white/60 lg:text-sm">
                {view.columns.length > 0 ? (
                  <>
                    {view.columns.length}{" "}
                    {view.columns.length === 1 ? "προϊόν" : "προϊόντα"}
                    {view.scopeLabel ? ` από «${view.scopeLabel}»` : ""} —{" "}
                    {view.totalRows} χαρακτηριστικά δίπλα-δίπλα, από τα οποία{" "}
                    <strong className="font-semibold text-white">
                      {view.differingRows}
                    </strong>{" "}
                    διαφέρουν. Όλες οι τιμές με ΦΠΑ.
                  </>
                ) : (
                  <>
                    Επιλέξτε έως {COMPARE_MAX} προϊόντα της ίδιας κατηγορίας από
                    τον κατάλογο και δείτε τα χαρακτηριστικά τους δίπλα-δίπλα.
                  </>
                )}
              </p>

              {view.dropped.length > 0 && (
                <p className="mt-3.5 flex items-start gap-2.5 border-l-[3px] border-k-amber bg-white/5 px-3 py-2 text-[12.5px] leading-[1.5] text-white/70">
                  <span
                    aria-hidden
                    className="mt-1 block h-1.5 w-1.5 shrink-0 bg-k-amber"
                  />
                  {view.dropped.length}{" "}
                  {view.dropped.length === 1
                    ? "προϊόν αφαιρέθηκε"
                    : "προϊόντα αφαιρέθηκαν"}{" "}
                  από τη σύγκριση — η σύγκριση γίνεται μόνο μεταξύ προϊόντων της
                  ίδιας κατηγορίας, και το προϊόν πρέπει να είναι διαθέσιμο στο
                  eshop.
                </p>
              )}
            </div>

            {view.scopeLabel && (
              <div className="shrink-0 border-l-[3px] border-k-red pl-4">
                <span className="t-eyebrow block text-k-red">
                  {upGreek("Κατηγορία")}
                </span>
                <span className="mt-1.5 block text-[13px] leading-[1.35] text-white lg:text-[15px]">
                  {upGreek(view.scopeLabel)}
                </span>
              </div>
            )}
          </div>
        </div>

        {view.columns.length === 0 ? (
          <EmptyCompare />
        ) : (
          <>
            <CompareToolbar
              ids={ids}
              diffOnly={diffOnly}
              highlightBest={highlightBest}
              totalRows={view.totalRows}
              differingRows={view.differingRows}
              columnCount={view.columns.length}
            />

            <div className="shell-x bg-white pt-5 pb-8 lg:pt-7 lg:pb-12">
              <CompareMatrix
                columns={view.columns}
                groups={view.groups}
                diffOnly={diffOnly}
                highlightBest={highlightBest}
                ids={ids}
              />

              {diffOnly && view.differingRows === 0 && (
                <p className="border border-k-line bg-k-surface-2 px-5 py-10 text-center text-[13px] text-k-text-3">
                  Τα προϊόντα αυτά έχουν ακριβώς τα ίδια καταχωρημένα
                  χαρακτηριστικά. Ξεχωρίζουν μόνο στην τιμή και στη
                  διαθεσιμότητα.
                </p>
              )}

              <p className="t-brand-count mt-4 flex flex-wrap items-center gap-2.5 text-k-text-4">
                <span className="block h-1.5 w-1.5 bg-k-green" />
                {upGreek(
                  "Η ένδειξη «καλύτερη τιμή» μπαίνει μόνο σε μεγέθη με σαφή μονάδα και σαφή κατεύθυνση",
                )}
                <span className="block h-[14px] w-px bg-k-line-2" />
                {upGreek("τιμές με ΦΠΑ · διαθεσιμότητα σε πραγματικό χρόνο")}
              </p>
            </div>

            <CompareAdviceBand advice={view.advice} columns={view.columns} />
          </>
        )}

        {suggestions.length > 0 && (
          <section className="shell-x border-t border-k-line bg-white py-7 lg:py-11">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="t-eyebrow text-k-red">
                  {upGreek(
                    canAddMore ? "Προσθέστε στη σύγκριση" : "Ίδια κατηγορία",
                  )}
                </p>
                <h2 className="font-artegra mt-2 text-[19px] leading-[1.2] font-medium text-k-ink lg:text-[25px]">
                  {upGreek(
                    view.scopeLabel
                      ? `Περισσότερα σε ${view.scopeLabel}`
                      : "Σχετικά προϊόντα",
                  )}
                </h2>
              </div>

              {!canAddMore && (
                <p className="t-brand-count text-k-text-4">
                  {upGreek(
                    `Η σύγκριση χωράει ${COMPARE_MAX} προϊόντα — αφαιρέστε ένα πρώτα`,
                  )}
                </p>
              )}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:mt-7 lg:grid-cols-5 lg:gap-4">
              {suggestions.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  compare={{ selected: false, disabled: !canAddMore }}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      <SiteFooter categories={rootCategories} />
    </QuickViewProvider>
  );
}

function EmptyCompare() {
  return (
    <div className="shell-x bg-white py-16 text-center lg:py-24">
      <span
        aria-hidden
        className="mx-auto flex h-14 w-14 items-center justify-center border-[1.5px] border-k-line-2 text-k-text-5"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M4 20V9M10 20V4M16 20v-7M22 20H2" />
        </svg>
      </span>
      <p className="font-artegra mt-5 text-xl leading-[1.25] text-k-ink">
        {upGreek("Δεν έχετε επιλέξει προϊόντα")}
      </p>
      <p className="mx-auto mt-2.5 max-w-md text-[13.5px] leading-[1.6] text-k-text-3">
        Στον κατάλογο, πατήστε «Σύγκριση» σε έως {COMPARE_MAX} προϊόντα της
        ίδιας κατηγορίας. Θα δείτε εδώ τιμή, διαθεσιμότητα, εγγύηση και όλα τα
        τεχνικά χαρακτηριστικά δίπλα-δίπλα.
      </p>
      <Link
        href="/katalogos"
        className="t-btn-sm mt-6 inline-block bg-k-ink px-7 py-4 text-white transition-colors hover:bg-k-red"
      >
        {upGreek("Στον κατάλογο")} →
      </Link>
    </div>
  );
}
