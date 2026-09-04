import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageMeta } from "@/lib/seo/urls";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { FilterSidebar } from "@/components/plp/FilterSidebar";
import { Pagination } from "@/components/plp/Pagination";
import { PlpToolbar } from "@/components/plp/PlpToolbar";
import { ProductCard } from "@/components/product/ProductCard";
import { CompareTray } from "@/components/compare/CompareTray";
import { QuickViewProvider } from "@/components/product/QuickViewProvider";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getMiniCart } from "@/lib/cart/cart";
import { COMPARE_MAX, getCompareSelection, getCompareTray } from "@/lib/compare/compare";
import { getPlpData, parsePlpParams } from "@/lib/catalog/plp";
import {
  getCatalogueStats,
  getMenuTree,
  getRootCategories,
  getTopBrands,
} from "@/lib/catalog/queries";
import { upGreek } from "@/lib/greek";

/**
 * Every product, in one list.
 *
 * `/katalogos` shows the categories and nothing else, so a customer who wants
 * to browse rather than to navigate had nowhere to go: the only way to see
 * products was to pick a category first and accept its boundary. For a shop
 * whose customers often know the tool but not which of our headings it lives
 * under, that is a wall in the middle of the catalogue.
 *
 * Nothing new underneath it. `getPlpData` has always taken the category as
 * OPTIONAL — `resolveCategoryScope(undefined)` returns an empty scope, which
 * filters nothing — so the same query, the same filters, the same sorting and
 * the same facets that power a category listing produce this one. What was
 * missing was a page that asked for it.
 *
 * The filters do the work the category tree used to: brand, availability,
 * price, and the category itself as a facet rather than as a URL. Somebody who
 * lands here and wants ΕΡΓΑΛΕΙΑ ΧΕΙΡΟΣ can tick it and stay, instead of
 * starting again from a different page.
 */

type PageProps = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "katalogos.page" });
  const title = t("ola_ta_proionta");
  const description = t("olos_o_katalogos_se_mia_lista");
  return {
    /* Canonical, γλώσσες και Open Graph μαζί: το `openGraph` κληρονομείται
       ολόκληρο από όποια σελίδα δεν ορίζει δικό της, οπότε 12 από 16 σελίδες
       μοιράζονταν με τον τίτλο της αρχικής. */
    ...pageMeta({ path: "/proionta", locale, title, description }),
    title,
    description,
  };
}

export default async function AllProductsPage({ params, searchParams }: PageProps) {
  const t = await getTranslations("katalogos.page");
  const { locale } = await params;
  setRequestLocale(locale);

  const raw = await searchParams;
  // No `categorySlug`: the scope is the whole catalogue.
  const plpParams = parsePlpParams(raw);

  const [data, menuTree, brands, stats, rootCategories, miniCart, compareSelection, compareTray] =
    await Promise.all([
      getPlpData(plpParams, locale),
      getMenuTree(locale),
      getTopBrands(locale, 16),
      getCatalogueStats(),
      getRootCategories(locale),
      getMiniCart(locale),
      getCompareSelection(),
      getCompareTray(locale),
    ]);

  /*
   * `getPlpData` returns null only for an unknown category slug, which cannot
   * happen here. Kept because a null would otherwise be read as an empty
   * catalogue and rendered as "no products", which is a different and much
   * worse thing to publish.
   */
  if (!data) notFound();

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
          (compareSelection.scopeKey != null && scopeKey !== compareSelection.scopeKey)),
    };
  };

  return (
    <QuickViewProvider locale={locale}>
      <SiteChrome
        locale={locale}
        cart={miniCart}
        categories={menuTree}
        brands={brands}
        stats={stats}
        featured={data.products[0] ?? null}
      />

      <main id="main">
        <div className="shell-x bg-k-ink-deep">
          <nav aria-label="Breadcrumb" className="t-util flex h-11 items-center gap-2.5 text-white/45">
            <Link href="/" className="text-white/60 hover:text-white">
              {upGreek(t("archiki"))}
            </Link>
            <span className="text-k-red">/</span>
            <Link href="/katalogos" className="hidden text-white/60 hover:text-white sm:inline">
              {upGreek(t("katalogos"))}
            </Link>
            <span className="hidden text-k-red sm:inline">/</span>
            <span className="truncate text-white">{upGreek(t("ola_ta_proionta"))}</span>
          </nav>

          <div className="pt-2.5 pb-7">
            <h1 className="font-display text-[22px] leading-[1.16] t-display text-white lg:text-[30px]">
              {upGreek(t("ola_ta_proionta"))}
            </h1>
            <p className="mt-3.5 max-w-[640px] text-[13px] leading-[1.68] text-white/60 lg:text-sm">
              {data.total.toLocaleString(locale)} {t("kodikoi_filtrarete_aristera")}
            </p>
          </div>
        </div>

        {/*
          The category facet, as chips, in the band the category page uses for
          its subcategories. Here it is the top level — the same control the
          catalogue page offers as a grid of tiles, kept within reach while
          somebody scrolls a list of thousands rather than making them go back.
        */}
        {data.facets.subcategories.length > 0 && (
          <div className="shell-x sticky top-[var(--header-h)] z-30 border-t border-white/10 bg-k-ink-deep/97 backdrop-blur-sm">
            <div className="flex flex-wrap gap-1.5 py-3.5">
              {data.facets.subcategories.map((sub) => (
                <Link
                  key={sub.slug}
                  href={`/proionta?sub=${sub.slug}`}
                  scroll={false}
                  className={`group/chip flex items-center gap-1.5 border px-2.5 py-1.5 text-[10px] font-semibold tracking-[0.02em] transition-colors duration-200 ${
                    sub.active
                      ? "border-k-red bg-k-red text-white"
                      : "border-white/15 text-white/60 hover:border-k-red hover:bg-k-red hover:text-white"
                  }`}
                >
                  {upGreek(sub.label)}
                  <span
                    className={`t-brand-count transition-colors duration-200 ${
                      sub.active ? "text-white/70" : "text-white/35 group-hover/chip:text-white/80"
                    }`}
                  >
                    {sub.count}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <PlpToolbar
          total={data.total}
          facets={data.facets}
          perRow={perRow}
          basePath="/proionta"
          params={raw}
        />

        <div className="shell-w bg-white lg:grid lg:grid-cols-[326px_1fr] lg:items-start">
          <FilterSidebar
            locale={locale}
            facets={data.facets}
            basePath="/proionta"
            params={raw}
            className="hidden max-h-[calc(100vh-var(--header-h))] flex-col overflow-hidden lg:sticky lg:top-[var(--header-h)] lg:flex"
          />

          <div className="min-w-0 border-k-line px-4 py-6 lg:border-l lg:px-10 lg:pt-6 lg:pb-10">
            {data.products.length === 0 ? (
              <div className="flex flex-col items-center justify-center border border-k-line bg-k-surface-2 px-6 py-20 text-center">
                <p className="font-display t-display text-lg text-k-ink">
                  {upGreek(t("kanena_proion_me_ayta_ta"))}
                </p>
                <p className="mt-2 max-w-md text-[13px] text-k-text-3">
                  {t("dokimaste_na_afairesete_ena_filtro")}
                </p>
                <Link
                  href="/proionta"
                  className="t-btn-sm mt-6 border-[1.5px] border-k-ink px-7 py-3 text-k-ink transition-colors hover:bg-k-ink hover:text-white"
                >
                  {upGreek(t("katharismos_filtron"))}
                </Link>
              </div>
            ) : (
              <>
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
                  basePath="/proionta"
                  params={raw}
                />
              </>
            )}
          </div>
        </div>
      </main>

      <SiteFooter categories={rootCategories} />
      <CompareTray tray={compareTray} />
    </QuickViewProvider>
  );
}
