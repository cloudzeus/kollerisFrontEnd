import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
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
import { getPlpData, parsePlpParams } from "@/lib/catalog/plp";
import {
  getCatalogueStats,
  getMenuTree,
  getRootCategories,
  getTopBrands,
} from "@/lib/catalog/queries";
import { prisma } from "@/lib/prisma";
import { upGreek } from "@/lib/greek";

type PageProps = {
  params: Promise<{ locale: Locale; kathgoria: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const getCategory = async (slug: string) =>
  prisma.category.findUnique({
    where: { slug },
    select: {
      slug: true,
      nameEl: true,
      nameEn: true,
      nameIt: true,
      productCount: true,
      childCount: true,
    },
  });

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { kathgoria, locale } = await params;
  // Explicit locale: `setRequestLocale` belongs to the render pass, and metadata
  // is generated outside it.
  const t = await getTranslations({ locale, namespace: "katalogos.page" });
  const category = await getCategory(kathgoria);
  if (!category) return {};
  const name =
    locale === "en"
      ? category.nameEn
      : locale === "it"
        ? category.nameIt
        : category.nameEl;
  return {
    title: name,
    description: t("kodikoi_se_ypokatigories_amesi_diathesimotita", { productCount: category.productCount, childCount: category.childCount }),
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: PageProps) {
  const t = await getTranslations("katalogos.page");
  const { locale, kathgoria } = await params;
  setRequestLocale(locale);

  const raw = await searchParams;
  const plpParams = parsePlpParams(raw, { categorySlug: kathgoria });

  const [
    category,
    data,
    menuTree,
    brands,
    stats,
    rootCategories,
    miniCart,
    compareSelection,
    compareTray,
  ] = await Promise.all([
    getCategory(kathgoria),
    getPlpData(plpParams, locale),
    getMenuTree(locale),
    getTopBrands(locale, 16),
    getCatalogueStats(),
    getRootCategories(locale),
    getMiniCart(locale),
    getCompareSelection(),
    getCompareTray(locale),
  ]);

  // An unknown slug is a 404, not an empty grid — otherwise every typo renders
  // as a legitimate-looking "no products" page and gets indexed.
  if (!category || !data) notFound();

  const name =
    locale === "en"
      ? category.nameEn
      : locale === "it"
        ? category.nameIt
        : category.nameEl;
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
        brands={brands}
        stats={stats}
        featured={data.products[0] ?? null}
      />

      <main id="main">
        {/* Hero band */}
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
            <span className="truncate text-white">{upGreek(name)}</span>
          </nav>

          <div className="pt-2.5 pb-7">
            <h1 className="font-artegra text-[22px] leading-[1.16] font-medium text-white lg:text-[30px]">
              {upGreek(name)}
            </h1>
            <p className="mt-3.5 max-w-[640px] text-[13px] leading-[1.68] text-white/60 lg:text-sm">
              {category.productCount.toLocaleString("el-GR")} {t("kodikoi_se")}{" "}
              {category.childCount} {t("ypokatigories_filtrarete_aristera_oles_oi")}
            </p>
          </div>
        </div>

        {/*
          Subcategories stay; the title does not.
          ───────────────────────────────────────────────────────────────────
          Lifted out of the hero into their own band so they can be `sticky`
          under the header. Scrolling a 281-product grid used to mean losing
          every sibling category off the top of the screen — the one control
          most likely to be wanted halfway down a listing.

          Pure CSS. `--header-h` is maintained by `HeaderShell`, so the offset
          follows the header as it condenses instead of guessing at a number.
        */}
        {data.facets.subcategories.length > 0 && (
          <div className="shell-x sticky top-[var(--header-h)] z-30 border-t border-white/10 bg-k-ink-deep/97 backdrop-blur-sm">
            <div className="flex flex-wrap gap-1.5 py-3.5">
              {data.facets.subcategories.map((sub) => (
                <Link
                  key={sub.slug}
                  href={`/katalogos/${kathgoria}?sub=${sub.slug}`}
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
          </div>
        )}

        <PlpToolbar
          total={data.total}
          facets={data.facets}
          perRow={perRow}
          basePath={`/katalogos/${kathgoria}`}
          params={raw}
        />

        <div className="shell-w bg-white lg:grid lg:grid-cols-[326px_1fr] lg:items-start">
          <FilterSidebar
            facets={data.facets}
            basePath={`/katalogos/${kathgoria}`}
            params={raw}
            className="hidden max-h-[calc(100vh-var(--header-h))] flex-col overflow-hidden lg:sticky lg:top-[var(--header-h)] lg:flex"
          />

          <div className="min-w-0 border-k-line px-4 py-6 lg:border-l lg:px-10 lg:pt-6 lg:pb-10">
            {data.products.length === 0 ? (
              <div className="flex flex-col items-center justify-center border border-k-line bg-k-surface-2 px-6 py-20 text-center">
                <p className="font-artegra text-lg text-k-ink">
                  {upGreek(t("kanena_proion_me_ayta_ta"))}
                </p>
                <p className="mt-2 max-w-md text-[13px] text-k-text-3">
                  {t("dokimaste_na_afairesete_ena_filtro")}
                </p>
                <Link
                  href={`/katalogos/${kathgoria}`}
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
                  basePath={`/katalogos/${kathgoria}`}
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
