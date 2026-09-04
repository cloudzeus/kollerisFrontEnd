import { getTranslations } from "next-intl/server";
import { alternatesFor } from "@/lib/seo/urls";
import { categoryBreadcrumb, categoryItemList } from "@/lib/seo/product-schema";
import { categoryFaq, categoryIntro } from "@/lib/seo/category-copy";
import { faqJsonLd } from "@/lib/seo/product-faq";
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
import { Zone } from "@/components/zones/Zone";

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
    // Each language is a page in its own right: its own canonical, and the
    // other two declared as alternates so they are read as translations
    // rather than as duplicates competing with each other.
    alternates: alternatesFor(`/katalogos/${kathgoria}`, locale),
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

  /*
   * Δομημένα δεδομένα για την κατηγορία.
   *
   * Χωρίς αυτά η σελίδα είναι, για μια μηχανή, κείμενο με συνδέσμους. Με αυτά
   * γίνεται δηλωμένη συλλογή — και η διαφορά φαίνεται όχι στο αν θα βρεθεί η
   * σελίδα, αλλά στο αν θα παρατεθεί ως απάντηση στο «τι κατσαβίδια πουλάει το
   * κατάστημα».
   *
   * Η θέση στη λίστα μετράει από την πραγματική σελίδα, όχι από το 1: στη
   * σελίδα 3 το πρώτο προϊόν ΔΕΝ είναι το πρώτο της κατηγορίας.
   */
  const itemListLd = categoryItemList(
    locale,
    data.products,
    (data.page - 1) * data.products.length,
  );
  const breadcrumbLd = categoryBreadcrumb(locale, { name, slug: kathgoria });

  /*
   * Τι λέει η σελίδα για τον εαυτό της.
   *
   * Μόνο στα ελληνικά και μόνο στην πρώτη σελίδα. Η δεύτερη σελίδα μιας
   * κατηγορίας δεν είναι άλλη κατηγορία — ίδιο κείμενο σε πέντε URL είναι
   * ακριβώς το διπλότυπο περιεχόμενο που το canonical προσπαθεί να αποφύγει.
   */
  const copyInput = { name, total: data.total, facets: data.facets };
  const intro = locale === "el" && data.page === 1 ? categoryIntro(copyInput) : null;
  const faq = locale === "el" && data.page === 1 ? categoryFaq(copyInput) : [];
  const faqLd = faqJsonLd(faq);

  return (
    <QuickViewProvider locale={locale}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      {itemListLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }}
        />
      )}
      {faqLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
        />
      )}
      <SiteChrome
        locale={locale}
        cart={miniCart}
        categories={menuTree}
        brands={brands}
        stats={stats}
        featured={data.products[0] ?? null}
      />

      <main id="main">
        <Zone id="category.top" locale={locale} />
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
            <h1 className="font-display text-[22px] leading-[1.16] font-medium text-white lg:text-[30px]">
              {upGreek(name)}
            </h1>
            {/*
              Η λεπτή γραμμή μένει· η παράγραφος πάει κάτω.
              ───────────────────────────────────────────────────────────────
              Δοκιμάστηκε εδώ πρώτα και ήταν λάθος: πέντε σειρές κειμένου στο
              σκούρο band σπρώχνουν 5.850 προϊόντα κάτω από το fold. Κανείς δεν
              έρχεται σε σελίδα κατηγορίας για να διαβάσει — έρχεται για να δει
              πλακίδια. Το κείμενο δεν χάνει τίποτα στο κάτω μέρος της σελίδας:
              ο crawler διαβάζει ολόκληρη τη σελίδα, και ο άνθρωπος που θέλει
              απάντηση έχει ήδη κάνει scroll για να τη ζητήσει.
            */}
            <p className="mt-3.5 max-w-[640px] text-[13px] leading-[1.68] text-white/60 lg:text-sm">
              {category.productCount.toLocaleString(locale)} {t("kodikoi_se")}{" "}
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
              locale={locale}
            facets={data.facets}
            basePath={`/katalogos/${kathgoria}`}
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

        {/*
          Οι ερωτήσεις της κατηγορίας — ορατές, όπως και στο προϊόν.
          ────────────────────────────────────────────────────────────────────
          Κάτω από τη σελιδοποίηση: αυτό είναι το σημείο όπου κάποιος που δεν
          βρήκε ό,τι έψαχνε στα πλακίδια φτάνει με ερώτηση, όχι με κλικ.
        */}
        {(intro || faq.length > 0) && (
          <div className="shell-x border-t border-k-line py-9 lg:py-12">
            {intro && (
              <p className="mb-8 max-w-[860px] text-[13.5px] leading-[1.75] text-k-text-2">
                {intro}
              </p>
            )}
            {faq.length > 0 && (
            <>
            <h2 className="t-eyebrow mb-5 text-k-text-4">
              {upGreek("Συχνές ερωτήσεις")}
            </h2>
            <div className="max-w-[860px] border-t border-k-line">
              {faq.map((item) => (
                <details key={item.q} className="group border-b border-k-line">
                  <summary className="flex cursor-pointer items-center justify-between gap-4 py-3.5 text-[14px] font-medium text-k-ink marker:content-none [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span
                      aria-hidden
                      className="shrink-0 text-k-text-4 transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="max-w-[70ch] pb-4 text-[13.5px] leading-[1.7] text-k-text-2">
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
            </>
            )}
          </div>
        )}
        <Zone id="category.bottom" locale={locale} />
      </main>

      <SiteFooter categories={rootCategories} />
      <CompareTray tray={compareTray} />
    </QuickViewProvider>
  );
}
