import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { alternatesFor } from "@/lib/seo/urls";
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
import { campaignWhere } from "@/lib/offers/coverage";
import { offerDescription, offerTitle } from "@/lib/offers/offers";
import { prisma } from "@/lib/prisma";
import { upGreek } from "@/lib/greek";

/**
 * One campaign, and the products in it.
 *
 * Clicking an offer used to go wherever its `href` had been typed, and that was
 * almost always `/katalogos` — so a customer who clicked "-30% σε δισκοπρίονα"
 * arrived at a grid of categories and had to work out for themselves which
 * products the offer meant. The campaign already knew: a list of slugs, a
 * brand, or a category, recorded when it was written.
 *
 * `campaignWhere` turns that into a clause and `getPlpData` does the rest, so
 * this listing has the same filters, sorting, paging and facet counts as every
 * other — including counts that describe the campaign rather than the whole
 * shop, which is the part a second, hand-rolled listing would have got wrong.
 *
 * ── The discount is displayed, not applied ──────────────────────────────────
 *
 * Every price here is `Product.priceNet`, the same number the basket charges.
 * The campaign's percentage is its own claim and is shown as a badge; pricing
 * policy belongs to HDCtool by an earlier decision, and two systems computing
 * one discount from different rules is how a shop charges the wrong amount.
 */

type PageProps = {
  params: Promise<{ locale: Locale; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const getOffer = async (slug: string) =>
  prisma.offer.findUnique({
    where: { slug },
    select: {
      slug: true,
      titleEl: true,
      titleEn: true,
      titleIt: true,
      descriptionEl: true,
      descriptionEn: true,
      descriptionIt: true,
      badge: true,
      scope: true,
      productSlugs: true,
      brandSlug: true,
      categorySlug: true,
      isActive: true,
      endsAt: true,
    },
  });

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const offer = await getOffer(slug);
  if (!offer) return {};
  return {
    alternates: alternatesFor(`/prosfores/${slug}`, locale),
    title: offerTitle(offer, locale),
    description: offerDescription(offer, locale) || undefined,
  };
}

export default async function OfferProductsPage({ params, searchParams }: PageProps) {
  const t = await getTranslations("katalogos.page");
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const offer = await getOffer(slug);
  if (!offer || !offer.isActive) notFound();

  const raw = await searchParams;
  const plpParams = parsePlpParams(raw);
  const where = await campaignWhere(offer);

  const [data, menuTree, brands, stats, rootCategories, miniCart, compareSelection, compareTray] =
    await Promise.all([
      /*
       * `campaignWhere` returns null for a campaign that selects nothing — an
       * empty slug list, a brand that no longer exists. That is NOT the same as
       * "no filter", so it is turned into a clause that matches nothing rather
       * than being passed through as undefined, which would silently show the
       * entire catalogue as if it were on offer.
       */
      getPlpData(plpParams, locale, where ?? { id: { in: [] } }),
      getMenuTree(locale),
      getTopBrands(locale, 16),
      getCatalogueStats(),
      getRootCategories(locale),
      getMiniCart(locale),
      getCompareSelection(),
      getCompareTray(locale),
    ]);

  if (!data) notFound();

  const title = offerTitle(offer, locale);
  const description = offerDescription(offer, locale);

  const perRow = Number(raw.perRow) || 4;
  const gridCols =
    perRow === 2
      ? "sm:grid-cols-2"
      : perRow === 3
        ? "sm:grid-cols-2 lg:grid-cols-3"
        : perRow === 5
          ? "sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5"
          : "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

  const compareStateFor = (productSlug: string, scopeKey?: string | null) => {
    const selected = compareSelection.slugs.includes(productSlug);
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
            <Link href="/prosfores" className="hidden text-white/60 hover:text-white sm:inline">
              {upGreek(t("prosfores"))}
            </Link>
            <span className="hidden text-k-red sm:inline">/</span>
            <span className="truncate text-white">{upGreek(title)}</span>
          </nav>

          <div className="pt-2.5 pb-7">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-[22px] leading-[1.16] font-medium text-white lg:text-[30px]">
                {upGreek(title)}
              </h1>
              {offer.badge && (
                <span className="border border-k-red bg-k-red px-2.5 py-1 text-[11px] font-semibold text-white">
                  {offer.badge}
                </span>
              )}
            </div>
            {description && (
              <p className="mt-3.5 max-w-[640px] text-[13px] leading-[1.68] text-white/60 lg:text-sm">
                {description}
              </p>
            )}
            <p className="mt-2 text-[13px] text-white/45">
              {data.total.toLocaleString(locale)} {t("kodikoi_filtrarete_aristera")}
            </p>
          </div>
        </div>

        <PlpToolbar
          total={data.total}
          facets={data.facets}
          perRow={perRow}
          basePath={`/prosfores/${slug}`}
          params={raw}
        />

        <div className="shell-w bg-white lg:grid lg:grid-cols-[326px_1fr] lg:items-start">
          <FilterSidebar
            locale={locale}
            facets={data.facets}
            basePath={`/prosfores/${slug}`}
            params={raw}
            className="hidden max-h-[calc(100vh-var(--header-h))] flex-col overflow-hidden lg:sticky lg:top-[var(--header-h)] lg:flex"
          />

          <div className="min-w-0 border-k-line px-4 py-6 lg:border-l lg:px-10 lg:pt-6 lg:pb-10">
            {data.products.length === 0 ? (
              <div className="flex flex-col items-center justify-center border border-k-line bg-k-surface-2 px-6 py-20 text-center">
                <p className="font-display text-lg text-k-ink">
                  {upGreek(t("kanena_proion_me_ayta_ta"))}
                </p>
                <p className="mt-2 max-w-md text-[13px] text-k-text-3">
                  {t("dokimaste_na_afairesete_ena_filtro")}
                </p>
                <Link
                  href={`/prosfores/${slug}`}
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
                  basePath={`/prosfores/${slug}`}
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
