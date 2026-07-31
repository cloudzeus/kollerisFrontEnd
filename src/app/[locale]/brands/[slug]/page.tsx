import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
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
import {
  COMPARE_MAX,
  getCompareSelection,
  getCompareTray,
} from "@/lib/compare/compare";
import { getBrandBySlug } from "@/lib/catalog/brands";
import { getPlpData, parsePlpParams } from "@/lib/catalog/plp";
import {
  getCatalogueStats,
  getMenuTree,
  getRootCategories,
  getTopBrands,
} from "@/lib/catalog/queries";
import { upGreek } from "@/lib/greek";

type PageProps = {
  params: Promise<{ locale: Locale; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const brand = await getBrandBySlug(slug, locale);
  if (!brand) return {};
  return {
    title: brand.name,
    description: `${brand.productCount.toLocaleString("el-GR")} κωδικοί ${brand.name} σε απόθεμα. Επίσημη αντιπροσώπευση, γνήσια ανταλλακτικά, παράδοση 24-48 ώρες.`,
  };
}

export default async function BrandPage({ params, searchParams }: PageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const raw = await searchParams;
  const plpParams = parsePlpParams(raw, { brandScopeSlug: slug });

  const [
    brand,
    data,
    menuTree,
    topBrands,
    stats,
    rootCategories,
    miniCart,
    compareSelection,
    compareTray,
  ] = await Promise.all([
    getBrandBySlug(slug, locale),
    getPlpData(plpParams, locale),
    getMenuTree(locale),
    getTopBrands(locale, 16),
    getCatalogueStats(),
    getRootCategories(locale),
    getMiniCart(locale),
    getCompareSelection(),
    getCompareTray(locale),
  ]);

  if (!brand || !data) notFound();

  const perRow = Number(raw.perRow) || 4;
  const gridCols =
    perRow === 2
      ? "sm:grid-cols-2"
      : perRow === 3
        ? "sm:grid-cols-2 lg:grid-cols-3"
        : perRow === 5
          ? "sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5"
          : "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

  /*
   * Whether each card's compare box is ticked, and whether it may be ticked at
   * all. Computed here on the server from the selection cookie so the grid
   * greys out picks the action would refuse — a different classification, or a
   * fifth product — instead of letting the customer find out by clicking.
   */
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

  return (
    <QuickViewProvider locale={locale}>
      <SiteChrome
        locale={locale}
        cart={miniCart}
        categories={menuTree}
        brands={topBrands}
        stats={stats}
        featured={data.products[0] ?? null}
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
            <Link href="/brands" className="text-white/60 hover:text-white">
              BRANDS
            </Link>
            <span className="text-k-red">/</span>
            <span className="truncate text-white">{upGreek(brand.name)}</span>
          </nav>

          <div className="flex flex-col gap-6 pt-2.5 pb-8 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
            <div className="flex items-center gap-5">
              {brand.logo && (
                <span className="flex h-20 w-20 shrink-0 items-center justify-center bg-white p-2.5 lg:h-24 lg:w-24">
                  <Image
                    src={brand.logo}
                    alt={brand.name}
                    width={200}
                    height={200}
                    className="h-full w-full object-contain"
                  />
                </span>
              )}
              <div className="min-w-0">
                <p className="t-eyebrow mb-2 text-k-red">
                  {upGreek("Επίσημη αντιπροσώπευση")}
                </p>
                <h1 className="font-artegra text-[24px] leading-[1.14] font-medium text-white lg:text-[32px]">
                  {upGreek(brand.name)}
                </h1>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-px border border-white/12 bg-white/12 lg:shrink-0">
              {[
                {
                  v: brand.productCount.toLocaleString("el-GR"),
                  k: "ΚΩΔΙΚΟΙ ΣΤΟΝ ΚΑΤΑΛΟΓΟ",
                },
                {
                  v: brand.inStockCount.toLocaleString("el-GR"),
                  k: "ΣΕ ΑΜΕΣΗ ΔΙΑΘΕΣΙΜΟΤΗΤΑ",
                },
              ].map((kpi) => (
                <div key={kpi.k} className="bg-k-ink-deep px-5 py-4">
                  <dd className="font-mono text-[22px] leading-none font-semibold text-white">
                    {kpi.v}
                  </dd>
                  <dt className="t-brand-count mt-2 leading-[1.4] text-white/45">
                    {kpi.k}
                  </dt>
                </div>
              ))}
            </dl>
          </div>

          {/* Category coverage for this brand — the subcategory facet, but full
              width and up top, since a brand page is browsed by category. */}
          {data.facets.subcategories.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-white/10 py-5">
              {data.facets.subcategories.map((sub) => (
                <Link
                  key={sub.slug}
                  href={`/brands/${slug}?sub=${sub.slug}`}
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
                      sub.active
                        ? "text-white/70"
                        : "text-white/35 group-hover/chip:text-white/80"
                    }`}
                  >
                    {sub.count}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <PlpToolbar
          total={data.total}
          facets={data.facets}
          perRow={perRow}
          basePath={`/brands/${slug}`}
          params={raw}
        />

        <div className="shell-w bg-white lg:grid lg:grid-cols-[326px_1fr] lg:items-start">
          <FilterSidebar
            facets={data.facets}
            basePath={`/brands/${slug}`}
            params={raw}
            className="hidden max-h-[calc(100vh-var(--header-h))] flex-col overflow-hidden lg:sticky lg:top-[var(--header-h)] lg:flex"
          />

          <div className="min-w-0 border-k-line px-4 py-6 lg:border-l lg:px-10 lg:pt-6 lg:pb-10">
            {data.products.length === 0 ? (
              <div className="flex flex-col items-center justify-center border border-k-line bg-k-surface-2 px-6 py-20 text-center">
                <p className="font-artegra text-lg text-k-ink">
                  {upGreek("Κανένα προϊόν με αυτά τα φίλτρα")}
                </p>
                <Link
                  href={`/brands/${slug}`}
                  className="t-btn-sm mt-6 border-[1.5px] border-k-ink px-7 py-3 text-k-ink transition-colors hover:bg-k-ink hover:text-white"
                >
                  {upGreek("Καθαρισμός φίλτρων")}
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
                  basePath={`/brands/${slug}`}
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
