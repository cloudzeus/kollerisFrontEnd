import { getTranslations } from "next-intl/server";
import { yearsInBusiness } from "@/lib/seo/structured-data";
import { setRequestLocale } from "next-intl/server";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { QuickViewProvider } from "@/components/product/QuickViewProvider";
import { AboutSplit } from "@/components/home/AboutSplit";
import { BrandWall } from "@/components/home/BrandWall";
import { CategoryGrid } from "@/components/home/CategoryGrid";
import { FeaturedProducts } from "@/components/home/FeaturedProducts";
import { HeroBanner } from "@/components/home/HeroBanner";
import { NewsletterBand } from "@/components/home/NewsletterBand";
import { QuickOrder } from "@/components/home/QuickOrder";
import { ReviewsBand } from "@/components/home/ReviewsBand";
import { StatStrip } from "@/components/home/StatStrip";
import type { Locale } from "@/i18n/routing";
import { getMiniCart } from "@/lib/cart/cart";
import { getSection } from "@/lib/content/content";
import { Zone, zoneHasContent } from "@/components/zones/Zone";
import { FREE_SHIPPING_THRESHOLD_NET } from "@/lib/cart/options";
import {
  getCatalogueStats,
  getFeaturedProducts,
  getMenuTree,
  getRootCategories,
  getTopBrands,
} from "@/lib/catalog/queries";

/**
 * Homepage.
 *
 * Every product, category and brand figure on this page is read from the local
 * catalogue projection — names, images, prices, stock, SKU counts, subcategory
 * counts, brand counts. Nothing numeric is hardcoded.
 *
 * Still static, pending the CMS (Phase 3, admin screens 1–4): hero copy and
 * video, the two promo tiles, the Google review quotes and the About copy.
 * Each is marked at its call site.
 */
/*
 * Dynamic, not ISR: the header renders the visitor's own cart from the session
 * cookie, which is per-request by definition. Catalogue data still comes from
 * the local projection, so the cost is one extra query, not a round trip to
 * HDCtool.
 */
export const dynamic = "force-dynamic";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const t = await getTranslations("page");
  const { locale } = await params;
  setRequestLocale(locale);

  const [categories, menuTree, brands, products, stats, miniCart, heroCopy, aboutCopy, reviewsCopy] =
    await Promise.all([
      getRootCategories(locale),
      getMenuTree(locale),
      getTopBrands(locale, 16),
      getFeaturedProducts(locale, 8),
      getCatalogueStats(),
      getMiniCart(locale),
      // Editable copy. In the same batch as everything else — a separate await
      // would put the homepage on an extra round-trip for four short strings.
      getSection("hero", locale),
      getSection("about", locale),
      getSection("reviews", locale),
    ]);

  /*
   * Whether the hero's right-hand column has anything to show.
   *
   * Asked separately from rendering because `<Zone/>` cannot answer it: it is a
   * React element, truthy whether it renders a banner or nothing at all. Both
   * reads it performs are already cached for this request, so asking costs
   * nothing beyond the call.
   */
  const asideFilled = await zoneHasContent("home.aside");

  // Live figures for {tokens} in widget copy. Passed in rather than looked up
  // per widget: the numbers are already here, and a widget should not be able
  // to put a query on the page.
  const zoneContext = {
    products: stats.products.toLocaleString(locale),
    brands: String(stats.brands),
    categories: String(stats.categories),
    freeShipping: `${FREE_SHIPPING_THRESHOLD_NET}\u00A0€`,
  };

  // Promo tiles: CMS-bound in Phase 3. The images are real catalogue products
  // so the tiles are not placeholder art.
  const promoTiles = [
    {
      eyebrow: t("nea_afixi"),
      title: t("milwaukee_ergaleia_mpatarias"),
      body: t("seires_m12_m18_se_amesi"),
      href: "/katalogos",
      image:
        "https://kolleris.b-cdn.net/papatheo/4932359490/primary-0-1751206821802.webp",
    },
    {
      eyebrow: t("eos_25"),
      title: t("knipex_pensika_tsimpidika"),
      body: t("germaniki_poiotita_eggyisi_ef_oroy"),
      href: "/prosfores",
      image: "https://kolleris.b-cdn.net/mtrl-files/images/81%2011%20250_1.webp",
      dark: true,
    },
  ];

  const statCards = [
    {
      value: `${(stats.products / 1000).toFixed(1).replace(".", ",")}K`,
      count: stats.products / 1000,
      decimals: 1,
      suffix: "K",
      line1: t("kodikoi_se"),
      line2: t("diathesimo_katalogo"),
    },
    {
      value: String(stats.brands),
      count: stats.brands,
      line1: t("brands_me"),
      line2: t("energa_proionta"),
    },
    {
      value: stats.inStock.toLocaleString(locale),
      count: stats.inStock,
      line1: t("kodikoi_se"),
      line2: t("amesi_diathesimotita"),
    },
    /* Εύρος, όχι μέγεθος — δεν μετριέται. */
    { value: t("24_48o"), line1: t("paradosi_se"), line2: t("oli_tin_ellada") },
  ];

  // Reviews: static until the CMS `SiteReview` model exists (admin screen 15).
  const reviews = [
    {
      text: t("paraggelnoyme_gia_tria_ploia_o"),
      name: t("d_papadopoylos"),
      role: t("technikos_dieythyntis_naytiliaki"),
    },
    {
      text: t("oi_times_synergati_einai_pragmatikes"),
      name: t("k_vasileioy"),
      role: t("ypeythynos_promitheion_ergostasio"),
    },
    {
      text: t("46_chronia_stin_agora_fainontai", { years: yearsInBusiness() }),
      name: t("g_antonioy"),
      role: t("idioktitis_synergeio"),
    },
  ];

  const usps = [
    {
      n: "01",
      title: t("pragmatiko_apothema_ochi_yposcheseis"),
      body: t("kodikoi_se_amesi_diathesimotita_ayti", { n: stats.inStock.toLocaleString(locale) }),
    },
    {
      n: "02",
      title: t("episimi_antiprosopeysi"),
      body: t("brands_me_energa_proionta_eggyisi", { brands: stats.brands }),
    },
    {
      n: "03",
      title: t("times_synergati_b2b"),
      body: t("statheri_timologisi_ana_logariasmo_choris"),
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
        featured={products[0] ?? null}
      />

      <main id="main">
        <Zone id="home.top" locale={locale} context={zoneContext} />
        <HeroBanner
          productCount={stats.products}
          brandCount={stats.brands}
          featuredTiles={promoTiles}
          copy={heroCopy}
          /*
             Only when the zone has something in it. `<Zone/>` is truthy even
             when it renders nothing, so passing it unconditionally left the
             hero's 400px column empty and made its own fallback unreachable.
          */
          aside={
            asideFilled ? <Zone id="home.aside" locale={locale} context={zoneContext} /> : null
          }
        />
        <StatStrip stats={statCards} locale={locale} />
        <CategoryGrid
          categories={categories.slice(0, 8)}
          totalCategories={stats.categories}
        />
        <Zone id="home.belowCategories" locale={locale} context={zoneContext} />
        <FeaturedProducts products={products} />
        <QuickOrder />
        <BrandWall brands={brands} totalBrands={stats.brands} />
        <Zone id="home.band" locale={locale} context={zoneContext} />
        <ReviewsBand rating="4,9" reviewCount={214} reviews={reviews} copy={reviewsCopy} />
        <AboutSplit usps={usps} copy={aboutCopy} />
        <NewsletterBand />
        <Zone id="home.beforeFooter" locale={locale} context={zoneContext} />
      </main>

      <SiteFooter categories={categories} />
    </QuickViewProvider>
  );
}
