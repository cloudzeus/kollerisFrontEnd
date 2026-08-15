import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // Explicit locale: `setRequestLocale` belongs to the render pass, and
  // metadata is generated outside it.
  const t = await getTranslations({ locale, namespace: "sygkrisi.page" });
  return {
    title: t("titlos_sygkrisi_proionton"),
    description: t("perigrafi_sygkrinete_eos_4_proionta"),
    robots: { index: false, follow: true },
  };
}

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
  const t = await getTranslations("sygkrisi.page");
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
              {upGreek(t("archiki"))}
            </Link>
            <span className="text-k-red">/</span>
            <Link
              href="/katalogos"
              className="hidden text-white/60 hover:text-white sm:inline"
            >
              {upGreek(t("katalogos"))}
            </Link>
            <span className="hidden text-k-red sm:inline">/</span>
            <span className="text-white">{upGreek(t("sygkrisi"))}</span>
          </nav>

          <div className="flex flex-col gap-5 pt-2.5 pb-7 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
            <div className="min-w-0">
              <h1 className="font-display text-[22px] leading-[1.16] font-medium text-white lg:text-[30px]">
                {upGreek(t("sygkrisi_proionton"))}
              </h1>
              <p className="mt-3.5 max-w-[640px] text-[13px] leading-[1.68] text-white/60 lg:text-sm">
                {view.columns.length > 0 ? (
                  <>
                    {view.columns.length}{" "}
                    {view.columns.length === 1 ? t("proion") : t("proionta")}
                    {view.scopeLabel ? t("apo", { scopeLabel: view.scopeLabel }) : ""} —{" "}
                    {view.totalRows} {t("charaktiristika_dipla_dipla_apo_ta")}{" "}
                    <strong className="font-semibold text-white">
                      {view.differingRows}
                    </strong>{" "}
                    {t("diaferoyn_oles_oi_times_me")}
                  </>
                ) : (
                  <>
                    {t("epilexte_eos")} {COMPARE_MAX} {t("proionta_tis_idias_katigorias_apo")}
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
                    ? t("proion_afairethike")
                    : t("proionta_afairethikan")}{" "}
                  {t("apo_ti_sygkrisi_i_sygkrisi")}
                </p>
              )}
            </div>

            {view.scopeLabel && (
              <div className="shrink-0 border-l-[3px] border-k-red pl-4">
                <span className="t-eyebrow block text-k-red">
                  {upGreek(t("katigoria"))}
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
                  {t("ta_proionta_ayta_echoyn_akrivos")}
                </p>
              )}

              <p className="t-brand-count mt-4 flex flex-wrap items-center gap-2.5 text-k-text-4">
                <span className="block h-1.5 w-1.5 bg-k-green" />
                {upGreek(
                  t("i_endeixi_kalyteri_timi_mpainei"),
                )}
                <span className="block h-[14px] w-px bg-k-line-2" />
                {upGreek(t("times_me_fpa_diathesimotita_se"))}
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
                    canAddMore ? t("prostheste_sti_sygkrisi") : t("idia_katigoria"),
                  )}
                </p>
                <h2 className="font-display mt-2 text-[19px] leading-[1.2] font-medium text-k-ink lg:text-[25px]">
                  {upGreek(
                    view.scopeLabel
                      ? t("perissotera_se", { scopeLabel: view.scopeLabel })
                      : t("schetika_proionta"),
                  )}
                </h2>
              </div>

              {!canAddMore && (
                <p className="t-brand-count text-k-text-4">
                  {upGreek(
                    t("i_sygkrisi_choraei_proionta_afaireste", { COMPARE_MAX: COMPARE_MAX }),
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
  const t = useTranslations("sygkrisi.page");
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
      <p className="font-display mt-5 text-xl leading-[1.25] text-k-ink">
        {upGreek(t("den_echete_epilexei_proionta"))}
      </p>
      <p className="mx-auto mt-2.5 max-w-md text-[13.5px] leading-[1.6] text-k-text-3">
        {t("ston_katalogo_patiste_sygkrisi_se")} {COMPARE_MAX} {t("proionta_tis_idias_katigorias_tha")}
      </p>
      <Link
        href="/katalogos"
        className="t-btn-sm mt-6 inline-block bg-k-ink px-7 py-4 text-white transition-colors hover:bg-k-red"
      >
        {upGreek(t("ston_katalogo"))} →
      </Link>
    </div>
  );
}
