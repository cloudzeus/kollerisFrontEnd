import { getTranslations } from "next-intl/server";
import { alternatesFor } from "@/lib/seo/urls";
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
import { getNewArrivals } from "@/lib/catalog/editorial";
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
import { Zone } from "@/components/zones/Zone";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // Explicit locale: `setRequestLocale` belongs to the render pass, and
  // metadata is generated outside it.
  const t = await getTranslations({ locale, namespace: "nees-afixeis.page" });
  return {
    // Each language is a page in its own right: its own canonical, and the
    // other two declared as alternates so they are read as translations
    // rather than as duplicates competing with each other.
    alternates: alternatesFor("/nees-afixeis", locale),
    title: t("titlos_nees_afixeis"),
    description: t("perigrafi_ti_mpike_stin_apothiki"),
  };
}

/**
 * New arrivals, as a TIMELINE rather than a grid.
 *
 * The distinctive move, and the reason the page exists: a flat grid of the 200
 * newest codes answers "what is new" but not "when did the range move", which is
 * the question a buyer who visits monthly actually has. Grouping by the month
 * each product entered the ERP turns the page into a record of the catalogue
 * changing — and every date on it is `Product.erpInsertedAt`, a real ERP field
 * populated on all 5.305 products, not a badge someone ticked.
 *
 * `Product.isNew` is deliberately unused: it is false on every row in the
 * projection, so a page built on it would be permanently empty.
 */
export default async function NewArrivalsPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const t = await getTranslations("nees-afixeis.page");
  const { locale } = await params;
  setRequestLocale(locale);

  const [
    arrivals,
    menuTree,
    brands,
    stats,
    rootCategories,
    miniCart,
    compareSelection,
    compareTray,
  ] = await Promise.all([
    getNewArrivals(locale),
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

  /*
   * The last-arrival DATE leads, not the 30-day count.
   *
   * The catalogue moves in batches — 534 codes landed in one month, then
   * nothing for weeks — so a rolling 30-day window is legitimately 0 much of
   * the time, and a strip opening with a bare "0" reads as a broken page
   * rather than as a quiet quarter. The date says the same thing and explains
   * it in the same breath.
   */
  const lastArrival = arrivals.newestAt ? new Date(arrivals.newestAt) : null;
  const windows = [
    lastArrival
      ? {
          label: t("teleytaia_afixi"),
          value: lastArrival.toLocaleDateString(locale, {
            day: "2-digit",
            month: "short",
          }),
          unit: String(lastArrival.getFullYear()),
        }
      : {
          label: t("teleytaies_30_imeres"),
          value: arrivals.last30.toLocaleString(locale),
          unit: t("kod"),
        },
    {
      label: t("teleytaio_trimino"),
      value: arrivals.last90.toLocaleString(locale),
      unit: t("kod"),
    },
    {
      label: t("teleytaios_chronos"),
      value: arrivals.lastYear.toLocaleString(locale),
      unit: t("kod"),
    },
    {
      label: t("synolo_katalogoy"),
      value: arrivals.total.toLocaleString(locale),
      unit: t("kod"),
    },
  ];

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
        <Zone id="arrivals.top" locale={locale} />
        <div className="shell-x bg-k-ink-deep">
          <nav
            aria-label="Breadcrumb"
            className="t-util flex h-11 items-center gap-2.5 text-white/45"
          >
            <Link href="/" className="text-white/60 hover:text-white">
              {upGreek(t("archiki"))}
            </Link>
            <span className="text-k-red">/</span>
            <span className="text-white">{upGreek(t("nees_afixeis"))}</span>
          </nav>

          <div className="pt-2.5 pb-8">
            <h1 className="font-display text-[22px] leading-[1.16] t-display text-balance text-white lg:text-[30px]">
              {upGreek(t("ti_mpike_stin_apothiki"))}
            </h1>
            <p className="mt-3.5 max-w-[620px] text-[13px] leading-[1.68] text-white/60 lg:text-sm">
              {t("ochi_mia_lista_me_neo")}
            </p>
          </div>
        </div>

        {/* Rolling windows — the page's own summary, before the timeline. */}
        <dl className="shell-w grid grid-cols-2 gap-px border-b border-k-line bg-k-line lg:grid-cols-4">
          {windows.map((w) => (
            <div key={w.label} className="bg-white px-5 py-4 lg:px-8 lg:py-5">
              <dt className="t-account-label text-k-text-4">
                {upGreek(w.label)}
              </dt>
              <dd className="mt-1.5 font-mono text-[19px] leading-[1.1] font-semibold text-k-ink lg:text-[24px]">
                {w.value}
                <span className="t-brand-count ml-1.5 font-sans text-k-text-4">
                  {upGreek(w.unit)}
                </span>
              </dd>
            </div>
          ))}
        </dl>

        {arrivals.periods.length === 0 ? (
          <section className="shell-x bg-white py-16 text-center">
            <p className="font-display text-xl text-k-ink">
              {upGreek(t("den_yparchoyn_akomi_katachorimenes_imerominies"))}
            </p>
          </section>
        ) : (
          <section className="band-base">
            <div className="shell-x py-8 lg:py-12">
              {/*
                The rail is a left border on the whole list, and each period
                punches its marker onto it. Drawn with borders rather than an
                absolutely-positioned line so it cannot drift out of alignment
                when a period grows.
              */}
              <ol className="border-l-[2px] border-k-line pl-6 lg:pl-10">
                {arrivals.periods.map((period, index) => (
                  <li
                    key={period.key}
                    id={period.key}
                    className="relative pb-10 last:pb-0 lg:pb-14"
                  >
                    <span
                      aria-hidden
                      className={`absolute top-[7px] -left-[calc(1.5rem+5px)] block h-2 w-2 lg:-left-[calc(2.5rem+5px)] ${
                        index === 0 ? "bg-k-red" : "bg-k-line-2"
                      }`}
                    />

                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
                      <time
                        dateTime={period.date}
                        className={`t-eyebrow ${index === 0 ? "text-k-red" : "text-k-text-4"}`}
                      >
                        {upGreek(period.label)}
                      </time>
                      <span className="t-brand-count font-mono text-k-ink">
                        {period.count.toLocaleString(locale)}{" "}
                        {upGreek(period.count === 1 ? t("kodikos") : t("kodikoi"))}
                      </span>
                      {index === 0 && (
                        <span className="t-badge bg-k-red px-[7px] py-[3px] text-white">
                          {upGreek(t("pio_prosfata"))}
                        </span>
                      )}
                    </div>

                    {period.brands.length > 0 && (
                      <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-k-text-3">
                        {period.brands.map((brand) => (
                          <span
                            key={brand}
                            className="t-card-brand text-k-text-3"
                          >
                            {brand}
                          </span>
                        ))}
                      </p>
                    )}

                    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
                      {period.products.map((product) => (
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

                    {period.count > period.products.length && (
                      <p className="t-brand-count mt-3.5 text-k-text-4">
                        {upGreek(
                          t("akomi_ayton_ton_mina", {
                            n: (period.count - period.products.length).toLocaleString(locale),
                          }),
                        )}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}

        <section className="band-alt border-t border-k-line">
          <div className="shell-x py-8 lg:py-12">
            <SectionHead
              eyebrow={t("den_to_vrikate_edo")}
              title={t("o_katalogos_einai_megalyteros_apo")}
              lead={t("oi_afixeis_deichnoyn_ti_kinithike")}
              meta={
                <Link
                  href="/katalogos"
                  className="t-btn-sm inline-block bg-k-ink px-7 py-4 text-white transition-colors hover:bg-k-red"
                >
                  {upGreek(t("ston_katalogo"))} →
                </Link>
              }
            />
          </div>
        </section>
      </main>

      <SiteFooter categories={rootCategories} />
      <CompareTray tray={compareTray} />
    </QuickViewProvider>
  );
}
