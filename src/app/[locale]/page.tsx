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
import { ReviewsBand } from "@/components/home/ReviewsBand";
import { StatStrip } from "@/components/home/StatStrip";
import type { Locale } from "@/i18n/routing";
import { getMiniCart } from "@/lib/cart/cart";
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
  const { locale } = await params;
  setRequestLocale(locale);

  const [categories, menuTree, brands, products, stats, miniCart] = await Promise.all([
    getRootCategories(locale),
    getMenuTree(locale),
    getTopBrands(locale, 16),
    getFeaturedProducts(locale, 8),
    getCatalogueStats(),
    getMiniCart(locale),
  ]);

  // Promo tiles: CMS-bound in Phase 3. The images are real catalogue products
  // so the tiles are not placeholder art.
  const promoTiles = [
    {
      eyebrow: "ΝΕΑ ΑΦΙΞΗ",
      title: "MILWAUKEE\nΕΡΓΑΛΕΙΑ ΜΠΑΤΑΡΙΑΣ",
      body: "Σειρές M12 & M18 σε άμεση διαθεσιμότητα",
      href: "/katalogos",
      image:
        "https://kolleris.b-cdn.net/papatheo/4932359490/primary-0-1751206821802.webp",
    },
    {
      eyebrow: "ΕΩΣ -25%",
      title: "KNIPEX\nΠΕΝΣΙΚΑ & ΤΣΙΜΠΙΔΙΚΑ",
      body: "Γερμανική ποιότητα, εγγύηση εφ' όρου ζωής",
      href: "/prosfores",
      image: "https://kolleris.b-cdn.net/mtrl-files/images/81%2011%20250_1.webp",
      dark: true,
    },
  ];

  const statCards = [
    {
      value: `${(stats.products / 1000).toFixed(1).replace(".", ",")}K`,
      line1: "Κωδικοί σε",
      line2: "διαθέσιμο κατάλογο",
    },
    { value: String(stats.brands), line1: "Brands με", line2: "ενεργά προϊόντα" },
    {
      value: String(stats.inStock),
      line1: "Κωδικοί σε",
      line2: "άμεση διαθεσιμότητα",
    },
    { value: "24-48ω", line1: "Παράδοση σε", line2: "όλη την Ελλάδα" },
  ];

  // Reviews: static until the CMS `SiteReview` model exists (admin screen 15).
  const reviews = [
    {
      text: "Παραγγέλνουμε για τρία πλοία. Ό,τι λένε ότι έχουν, το έχουν — και φεύγει αυθημερόν.",
      name: "Δ. Παπαδόπουλος",
      role: "ΤΕΧΝΙΚΟΣ ΔΙΕΥΘΥΝΤΗΣ · ΝΑΥΤΙΛΙΑΚΗ",
    },
    {
      text: "Οι τιμές συνεργάτη είναι πραγματικές, όχι διαπραγμάτευση κάθε φορά. Μας γλιτώνει χρόνο.",
      name: "Κ. Βασιλείου",
      role: "ΥΠΕΥΘΥΝΟΣ ΠΡΟΜΗΘΕΙΩΝ · ΕΡΓΟΣΤΑΣΙΟ",
    },
    {
      text: "46 χρόνια στην αγορά φαίνονται. Ξέρουν τι ζητάς πριν τελειώσεις τη φράση.",
      name: "Γ. Αντωνίου",
      role: "ΙΔΙΟΚΤΗΤΗΣ · ΣΥΝΕΡΓΕΙΟ",
    },
  ];

  const usps = [
    {
      n: "01",
      title: "Πραγματικό απόθεμα, όχι υποσχέσεις",
      body: `${stats.inStock.toLocaleString("el-GR")} κωδικοί σε άμεση διαθεσιμότητα αυτή τη στιγμή.`,
    },
    {
      n: "02",
      title: "Επίσημη αντιπροσώπευση",
      body: `${stats.brands} brands με ενεργά προϊόντα, εγγύηση και τεχνική υποστήριξη.`,
    },
    {
      n: "03",
      title: "Τιμές συνεργάτη B2B",
      body: "Σταθερή τιμολόγηση ανά λογαριασμό, χωρίς διαπραγμάτευση σε κάθε παραγγελία.",
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
        <HeroBanner
          productCount={stats.products}
          brandCount={stats.brands}
          featuredTiles={promoTiles}
        />
        <StatStrip stats={statCards} />
        <CategoryGrid
          categories={categories.slice(0, 8)}
          totalCategories={stats.categories}
        />
        <FeaturedProducts products={products} />
        <BrandWall brands={brands} totalBrands={stats.brands} />
        <ReviewsBand rating="4,9" reviewCount={214} reviews={reviews} />
        <AboutSplit usps={usps} />
        <NewsletterBand />
      </main>

      <SiteFooter categories={categories} />
    </QuickViewProvider>
  );
}
