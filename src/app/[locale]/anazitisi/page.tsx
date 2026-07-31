import type { Metadata } from "next";
import Image from "next/image";
import { setRequestLocale } from "next-intl/server";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { CompareTray } from "@/components/compare/CompareTray";
import { FilterSidebar } from "@/components/plp/FilterSidebar";
import { Pagination } from "@/components/plp/Pagination";
import { PlpToolbar } from "@/components/plp/PlpToolbar";
import { ProductCard } from "@/components/product/ProductCard";
import { QuickViewProvider } from "@/components/product/QuickViewProvider";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getMiniCart } from "@/lib/cart/cart";
import { getPlpData, parsePlpParams } from "@/lib/catalog/plp";
import { findByExactCode } from "@/lib/catalog/suggest";
import { SUGGEST_MIN_LENGTH } from "@/lib/catalog/suggest-options";
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
import { formatPrice } from "@/lib/format";
import { upGreek } from "@/lib/greek";

type PageProps = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const raw = await searchParams;
  const q = (Array.isArray(raw.q) ? raw.q[0] : raw.q)?.trim() ?? "";
  return {
    title: q ? `Αναζήτηση: ${q}` : "Αναζήτηση",
    // A results page is a view over the catalogue, not a page that should
    // compete in search with the products it lists.
    robots: { index: false, follow: true },
  };
}

/**
 * Search results.
 *
 * Deliberately the PLP engine with `q` as the scope instead of a category.
 * `resolveCategoryScope(undefined)` returns an empty scope, so `getPlpData`
 * already filters the whole catalogue by query — and every facet count it
 * returns is computed against the RESULT SET rather than the catalogue, which
 * is exactly what the spec asks for and what a second implementation would
 * have got subtly wrong.
 *
 * What is genuinely new here is the exact-code band: someone pasting a part
 * number wants that part, not position nine of 340.
 */
export default async function SearchPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const raw = await searchParams;
  const query = (Array.isArray(raw.q) ? raw.q[0] : raw.q)?.trim() ?? "";
  const scopeSlug =
    (Array.isArray(raw.cat) ? raw.cat[0] : raw.cat)?.trim() || undefined;

  const plpParams = parsePlpParams(raw, { categorySlug: scopeSlug });

  const [
    data,
    exact,
    menuTree,
    brands,
    stats,
    rootCategories,
    miniCart,
    compareSelection,
    compareTray,
  ] = await Promise.all([
    query.length >= SUGGEST_MIN_LENGTH ? getPlpData(plpParams, locale) : null,
    query.length >= SUGGEST_MIN_LENGTH ? findByExactCode(query, locale) : null,
    getMenuTree(locale),
    getTopBrands(locale, 16),
    getCatalogueStats(),
    getRootCategories(locale),
    getMiniCart(locale),
    getCompareSelection(),
    getCompareTray(locale),
  ]);

  const perRow = Number(raw.perRow) || 4;
  const gridCols =
    perRow === 2
      ? "sm:grid-cols-2"
      : perRow === 3
        ? "sm:grid-cols-2 lg:grid-cols-3"
        : perRow === 5
          ? "sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5"
          : "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

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

  const hasResults = (data?.total ?? 0) > 0;
  const inStockCount =
    data?.facets.availability.find((item) => item.slug === "in-stock")?.count ??
    0;
  const brandCount = data?.facets.brands.length ?? 0;

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
        {/* Hero */}
        <div className="shell-x bg-k-ink-deep">
          <nav
            aria-label="Breadcrumb"
            className="t-util flex h-11 items-center gap-2.5 text-white/45"
          >
            <Link href="/" className="text-white/60 hover:text-white">
              {upGreek("Αρχική")}
            </Link>
            <span className="text-k-red">/</span>
            <span className="text-white">{upGreek("Αναζήτηση")}</span>
          </nav>

          <div className="flex flex-col gap-5 pt-2.5 pb-7 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
            <div className="min-w-0">
              <h1 className="font-artegra text-[22px] leading-[1.16] font-medium text-balance text-white lg:text-[30px]">
                {query ? (
                  <>
                    {upGreek("Αποτελέσματα για")}{" "}
                    <span className="text-k-red">«{query}»</span>
                  </>
                ) : (
                  upGreek("Αναζήτηση")
                )}
              </h1>

              {query.length >= SUGGEST_MIN_LENGTH ? (
                <p className="mt-3.5 max-w-[640px] text-[13px] leading-[1.68] text-white/60 lg:text-sm">
                  {hasResults ? (
                    <>
                      <strong className="font-semibold text-white">
                        {data!.total.toLocaleString("el-GR")}
                      </strong>{" "}
                      {data!.total === 1 ? "προϊόν" : "προϊόντα"}
                      {brandCount > 0 && (
                        <>
                          {" "}
                          από {brandCount}{" "}
                          {brandCount === 1 ? "brand" : "brands"}
                        </>
                      )}
                      {inStockCount > 0 && (
                        <>
                          , {inStockCount.toLocaleString("el-GR")} άμεσα
                          διαθέσιμα
                        </>
                      )}
                      . Φιλτράρετε αριστερά — όλες οι τιμές με ΦΠΑ.
                    </>
                  ) : (
                    "Δεν βρέθηκε προϊόν με αυτούς τους όρους."
                  )}
                </p>
              ) : (
                <p className="mt-3.5 max-w-[640px] text-[13px] leading-[1.68] text-white/60 lg:text-sm">
                  Γράψτε τουλάχιστον {SUGGEST_MIN_LENGTH} χαρακτήρες — κωδικό,
                  όνομα προϊόντος ή brand.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Exact code — its own band, above everything. */}
        {exact && (
          <section className="shell-x border-b-[3px] border-k-red bg-k-surface-2 py-5 lg:py-6">
            <p className="t-eyebrow mb-3.5 flex items-center gap-2.5 text-k-red">
              <span aria-hidden className="rule-accent block shrink-0" />
              {upGreek("Ακριβής κωδικός")}
            </p>
            <div className="flex flex-wrap items-center gap-5 border border-k-line bg-white p-4 lg:p-5">
              <Link
                href={`/proion/${exact.slug}`}
                className="flex h-20 w-20 shrink-0 items-center justify-center border border-k-line bg-white p-1.5"
              >
                {exact.image ? (
                  <Image
                    src={exact.image}
                    alt=""
                    width={120}
                    height={120}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="t-brand-count text-k-text-5">—</span>
                )}
              </Link>

              <div className="min-w-0 flex-1">
                {exact.brandName && (
                  <p className="t-card-brand text-k-red">{exact.brandName}</p>
                )}
                <Link
                  href={`/proion/${exact.slug}`}
                  className="mt-1 block text-[14px] leading-[1.35] font-semibold text-k-ink transition-colors hover:text-k-red lg:text-[15px]"
                >
                  {exact.name}
                </Link>
                <p className="t-card-sku mt-1 text-k-text-4">
                  {exact.sku}
                  {exact.mpn && exact.mpn !== exact.sku && ` · ${exact.mpn}`}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="font-mono text-[19px] leading-none font-semibold text-k-ink">
                  {exact.priceNet != null
                    ? formatPrice(exact.priceNet, { vatRate: exact.vatRate })
                    : "—"}
                </p>
                <p
                  className={`t-card-stock mt-1.5 flex items-center justify-end gap-1.5 ${
                    exact.inStock ? "text-k-green" : "text-k-text-4"
                  }`}
                >
                  <span
                    aria-hidden
                    className="rounded-pill block h-1.5 w-1.5 bg-current"
                  />
                  {exact.inStock
                    ? `${exact.qty} ${upGreek("τεμ.")}`
                    : upGreek("Κατόπιν")}
                </p>
              </div>

              <AddToCartButton
                productId={exact.id}
                disabled={exact.priceNet == null}
                className="t-btn-sm h-12 shrink-0 bg-k-red px-7 text-white transition-colors hover:bg-k-red-hover"
              />
            </div>
          </section>
        )}

        {data && hasResults ? (
          <>
            <PlpToolbar
              total={data.total}
              facets={data.facets}
              perRow={perRow}
              basePath="/anazitisi"
              params={raw}
            />

            <div className="shell-w bg-white lg:grid lg:grid-cols-[326px_1fr] lg:items-start">
              <FilterSidebar
                facets={data.facets}
                basePath="/anazitisi"
                params={raw}
                className="hidden max-h-[calc(100vh-var(--header-h))] flex-col overflow-hidden lg:sticky lg:top-[var(--header-h)] lg:flex"
              />

              <div className="min-w-0 border-k-line px-4 py-6 lg:border-l lg:px-10 lg:pt-6 lg:pb-10">
                <div className={`grid grid-cols-2 gap-3 lg:gap-4 ${gridCols}`}>
                  {data.products.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      compare={compareStateFor(product.slug, product.scopeKey)}
                    />
                  ))}
                </div>

                <Pagination
                  page={data.page}
                  totalPages={data.totalPages}
                  basePath="/anazitisi"
                  params={raw}
                />
              </div>
            </div>
          </>
        ) : (
          query.length >= SUGGEST_MIN_LENGTH && <NoResults query={query} />
        )}
      </main>

      <SiteFooter categories={rootCategories} />
      <CompareTray tray={compareTray} />
    </QuickViewProvider>
  );
}

/**
 * Zero results.
 *
 * A dead end with "0 αποτελέσματα" is the worst screen in a shop. Every route
 * out of it is concrete: what to try, where to browse, and a phone number
 * answered by people who have been selling these tools for 46 years.
 */
function NoResults({ query }: { query: string }) {
  const tips = [
    {
      title: "Δοκιμάστε τον κωδικό του κατασκευαστή",
      body: "Ψάχνουμε σε κωδικό Kolleris, κωδικό κατασκευαστή και EAN.",
    },
    {
      title: "Λιγότερες λέξεις",
      body: "«τρυπάνι μπετόν 8» → «τρυπάνι 8». Οι λιγότεροι όροι φέρνουν περισσότερα.",
    },
    {
      title: "Δοκιμάστε λατινικά ή ελληνικά",
      body: "Τα brands είναι καταχωρημένα λατινικά — «knipex» αντί για «κνιπεξ».",
    },
    {
      title: "Ψάξτε στον κατάλογο",
      body: "23 κατηγορίες με φίλτρα σε μέγεθος, brand και διαθεσιμότητα.",
    },
  ];

  return (
    <section className="shell-x bg-white py-10 lg:py-16">
      <div className="max-w-2xl">
        <p className="t-eyebrow flex items-center gap-2.5 text-k-red">
          <span aria-hidden className="rule-accent block shrink-0" />
          {upGreek("Καμία αντιστοιχία")}
        </p>
        <h2 className="font-artegra mt-2.5 text-[20px] leading-[1.25] text-k-ink lg:text-[26px]">
          {upGreek(`Δεν βρέθηκε κάτι για «${query}»`)}
        </h2>
        <p className="mt-3 text-[13.5px] leading-[1.65] text-k-text-3">
          Πιθανόν να το έχουμε και να μην το βρήκε η αναζήτηση. Δοκιμάστε τα
          παρακάτω, ή σηκώστε το τηλέφωνο — το βρίσκουμε μαζί σε ένα λεπτό.
        </p>
      </div>

      <div className="mt-7 grid gap-px border border-k-line bg-k-line sm:grid-cols-2 lg:mt-9 lg:grid-cols-4">
        {tips.map((tip) => (
          <div key={tip.title} className="bg-white p-5">
            <p className="text-[13px] leading-[1.35] font-semibold text-k-ink">
              {tip.title}
            </p>
            <p className="mt-1.5 text-[12.5px] leading-[1.6] text-k-text-3">
              {tip.body}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <Link
          href="/katalogos"
          className="t-btn-sm bg-k-ink px-7 py-4 text-white transition-colors hover:bg-k-red"
        >
          {upGreek("Στον κατάλογο")} →
        </Link>
        <a
          href="tel:+302104111355"
          className="t-btn-sm border-[1.5px] border-k-ink px-7 py-4 text-k-ink transition-colors hover:bg-k-ink hover:text-white"
        >
          {upGreek("Τ. 210 411 1355")}
        </a>
      </div>
    </section>
  );
}
