import { getTranslations } from "next-intl/server";
import { absoluteUrl, alternatesFor } from "@/lib/seo/urls";
import { faqJsonLd, productFaq } from "@/lib/seo/product-faq";
import {
  priceValidUntil,
  productBreadcrumb,
  returnPolicy,
  shippingDetails,
  specsAsProperties,
} from "@/lib/seo/product-schema";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { PriceBox } from "@/components/pdp/PriceBox";
import { ProductGallery } from "@/components/pdp/ProductGallery";
import { ProductTabs } from "@/components/pdp/ProductTabs";
import { Expandable } from "@/components/ui/Expandable";
import { SectionHead } from "@/components/chrome/SectionHead";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductRail } from "@/components/product/ProductRail";
import { QuickViewProvider } from "@/components/product/QuickViewProvider";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getMiniCart } from "@/lib/cart/cart";
import { getProductBySlug, getRelatedProducts } from "@/lib/catalog/pdp";
import {
  getCatalogueStats,
  getMenuTree,
  getRootCategories,
  getTopBrands,
} from "@/lib/catalog/queries";
import { formatPercent, grossAmount, savingsOf } from "@/lib/format";
import { upGreek } from "@/lib/greek";

type PageProps = {
  params: Promise<{ locale: Locale; slug: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  // Explicit locale: `setRequestLocale` belongs to the render pass, and metadata
  // is generated outside it.
  const t = await getTranslations({ locale, namespace: "proion.page" });
  const product = await getProductBySlug(slug, locale);
  if (!product) return {};

  return {

    // Each language is a page in its own right: its own canonical, and the

    // other two declared as alternates so they are read as translations

    // rather than as duplicates competing with each other.

    alternates: alternatesFor(`/proion/${slug}`, locale),
    title: product.name,
    description:
      product.shortDescription ??
      t("kodikos_amesi_diathesimotita_paradosi_24", { name: product.name, n: product.brand ? ` — ${product.brand.name}` : "", sku: product.sku }),
    openGraph: {
      title: product.name,
      images: product.images[0] ? [product.images[0].url] : undefined,
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const t = await getTranslations("proion.page");
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const product = await getProductBySlug(slug, locale);
  if (!product) notFound();

  const [related, menuTree, brands, stats, rootCategories, miniCart] =
    await Promise.all([
      // Twelve, not five: the rail reaches the rest with its arrows.
      getRelatedProducts(product.mtrl, locale, 12),
      getMenuTree(locale),
      getTopBrands(locale, 16),
      getCatalogueStats(),
      getRootCategories(locale),
      getMiniCart(locale),
    ]);

  const ctx = { vatRate: product.vatRate };
  const saving =
    product.priceListNet != null && product.priceNet != null
      ? savingsOf(product.priceListNet, product.priceNet, locale, ctx)
      : null;

  /*
   * At-a-glance strip. Candidates in priority order, sliced to exactly four —
   * a 4-column grid fed 3 items leaves a dead grey square, which is what it
   * was doing on most products.
   */
  const dimensions =
    product.width != null && product.length != null && product.height != null
      ? `${product.width}×${product.length}×${product.height}`
      : null;

  const glance = (
    [
      {
        k: t("diathesimotita"),
        v: product.inStock ? t("tem", { qty: product.qty }) : t("katopin"),
      },
      /*
       * Colour and size sit above weight and dimensions on purpose. They are
       * absent from all but a few hundred products, and where they exist they
       * are what the product IS — a glove is chosen by size long before anyone
       * asks what it weighs. Ranking them below would let the four-item slice
       * drop them in favour of trivia.
       */
      product.sizes.length > 0
        ? { k: t("megethos"), v: product.sizes.map((s) => s.label).join(", ") }
        : null,
      product.colors.length > 0
        ? { k: t("chroma"), v: product.colors.join(", ") }
        : null,
      product.weight != null ? { k: t("varos"), v: `${product.weight} kg` } : null,
      product.guaranteeMonths
        ? { k: t("eggyisi"), v: t("mines", { guaranteeMonths: product.guaranteeMonths }) }
        : null,
      dimensions ? { k: t("diastaseis_cm"), v: dimensions } : null,
      product.length != null ? { k: t("mikos"), v: `${product.length} cm` } : null,
      product.brand ? { k: t("kataskeyastis"), v: product.brand.name } : null,
      { k: t("kodikos"), v: product.sku },
    ].filter(Boolean) as Array<{ k: string; v: string }>
  ).slice(0, 4);

  /** Product JSON-LD — real values only; no invented ratings. */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    mpn: product.mpn !== "—" ? product.mpn : undefined,
    gtin13: product.ean !== "—" ? product.ean : undefined,
    image: product.images.map((i) => i.url),
    description: product.shortDescription ?? undefined,
    brand: product.brand
      ? { "@type": "Brand", name: product.brand.name }
      : undefined,
    /*
     * Colour and size, matching what the Merchant feed emits for this product.
     *
     * Google reads this page to keep the feed item current, so the two must
     * agree — the feed takes the first assigned value of each and so does this.
     * Omitted rather than empty when absent; an empty string is a claim that
     * the product has no colour.
     */
    color: product.colors[0] ?? undefined,
    size: product.sizes[0]?.label ?? undefined,
    /*
     * The offer, and it has to agree with the Merchant Center feed.
     *
     * Google reads this page to keep a feed item current between fetches, so a
     * page and a feed that disagree is not a cosmetic inconsistency: it
     * suspends the item. This said `BackOrder` where the feed said
     * `out_of_stock` for every product without stock, which is two different
     * claims about the same tool. Out of stock is also the truthful one - a
     * back order is a promise to supply, and nothing here makes that promise.
     *
     * `itemCondition` and the offer `url` are what the automatic updates want
     * in order to match this page to its feed row at all.
     */
    offers:
      product.priceNet != null
        ? {
            "@type": "Offer",
            url: absoluteUrl(`/proion/${product.slug}`, locale),
            price: grossAmount(product.priceNet, ctx).toFixed(2),
            priceCurrency: "EUR",
            itemCondition: "https://schema.org/NewCondition",
            availability: product.inStock
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
            /*
             * Χωρίς ημερομηνία λήξης, το Google θεωρεί την τιμή δυνητικά
             * μπαγιάτικη και μπορεί να πάψει να τη δείχνει στο αποτέλεσμα.
             */
            priceValidUntil: priceValidUntil(),
            /*
             * Μεταφορικά και επιστροφές μέσα στην προσφορά.
             *
             * Είναι αυτά που επιτρέπουν στο αποτέλεσμα αναζήτησης να δείξει
             * «δωρεάν μεταφορικά» και «14 ημέρες επιστροφή» δίπλα στην τιμή.
             * Χωρίς αυτά το αποτέλεσμα δείχνει μόνο ποσό — και ένα μοντέλο που
             * συγκρίνει καταστήματα διαβάζει την απουσία ως άγνωστη πολιτική,
             * όχι ως την προβλεπόμενη.
             */
            shippingDetails: shippingDetails(locale),
            hasMerchantReturnPolicy: returnPolicy(),
          }
        : undefined,
    /*
     * Τα χαρακτηριστικά ως δεδομένα, όχι ως πρόζα.
     *
     * Υπάρχουν ήδη στη βάση ανά γλώσσα και με μονάδα, και ως τώρα έβγαιναν μόνο
     * ως κείμενο στη σελίδα. Ένα μοντέλο που ρωτιέται «μύτες 25mm σε σετ των 3»
     * δεν μπορεί να προτείνει σελίδα που δεν ΔΗΛΩΝΕΙ μήκος και τεμάχια — ακόμα
     * κι αν η περιγραφή τα λέει, γιατί εκείνη είναι πρόζα και αυτά μετρήσιμα.
     */
    additionalProperty: specsAsProperties(product.specs, {
      brand: product.brand?.name,
      category: product.category?.name,
    }),
    /*
     * Βάρος μόνο όταν υπάρχει πραγματικά.
     *
     * Το `!= null` περνούσε το μηδέν, και `value: 0` δεν σημαίνει «άγνωστο» —
     * σημαίνει «δεν ζυγίζει τίποτα». Ο κατάλογος έχει πολλά είδη με GWEIGHT 0
     * γιατί κανείς δεν το συμπλήρωσε ποτέ στο ERP· η παράλειψη είναι η αλήθεια.
     */
    weight:
      product.weight != null && product.weight > 0
        ? { "@type": "QuantitativeValue", value: product.weight, unitCode: "KGM" }
        : undefined,
    category: product.category?.name ?? undefined,
  };

  /*
   * Η διαδρομή στον κατάλογο.
   *
   * Ο helper `breadcrumbJsonLd` υπήρχε από την αρχή και δεν τον καλούσε καμία
   * σελίδα. Η ταξινομία είναι αυτό που ρωτάει μια μηχανή — και ένα AI — όταν
   * του ζητούν «τι κατσαβίδια έχει το κατάστημα».
   */
  const breadcrumbLd = productBreadcrumb(locale, product);

  /*
   * Οι ερωτήσεις που ρωτάει κάποιος πριν αγοράσει — απαντημένες από τα δεδομένα
   * ΑΥΤΟΥ του προϊόντος.
   *
   * Παράγονται μόνο για την ελληνική έκδοση. Οι απαντήσεις είναι γραμμένες στα
   * ελληνικά μέσα στον helper, και μια αγγλική σελίδα με ελληνικές ερωτήσεις
   * είναι χειρότερη από καμία ερώτηση: λέει στη μηχανή ότι η σελίδα είναι
   * ελληνική ενώ το `lang` της λέει το αντίθετο.
   */
  const faq = locale === "el" ? productFaq({
    name: product.name,
    sku: product.sku,
    brandName: product.brand?.name ?? null,
    inStock: product.inStock,
    qty: product.qty,
    guaranteeMonths: product.guaranteeMonths,
    priceGross: product.priceNet != null ? grossAmount(product.priceNet, ctx) : null,
    specs: product.specs,
  }) : [];
  const faqLd = faqJsonLd(faq);

  return (
    <QuickViewProvider locale={locale}>
      <SiteChrome
        locale={locale}
        cart={miniCart}
        categories={menuTree}
        brands={brands}
        stats={stats}
        featured={related[0] ?? null}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Ξεχωριστό block, όχι μέσα στο Product: το BreadcrumbList είναι δική
          του οντότητα και το Google το διαβάζει ως τέτοια. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      {faqLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
        />
      )}

      <main id="main">
        <div className="shell-x bg-k-ink-deep">
          <nav
            aria-label="Breadcrumb"
            className="t-util flex min-h-11 flex-wrap items-center gap-x-2.5 gap-y-1 py-2 text-white/45"
          >
            <Link href="/" className="shrink-0 text-white/60 hover:text-white">
              {upGreek(t("archiki"))}
            </Link>
            <span className="text-k-red">/</span>
            {product.category && (
              <>
                <Link
                  href={`/katalogos/${product.category.slug}`}
                  className="shrink-0 text-white/60 hover:text-white"
                >
                  {upGreek(product.category.name)}
                </Link>
                <span className="text-k-red">/</span>
              </>
            )}
            <span className="truncate text-white">{product.sku}</span>
          </nav>
        </div>

        {/*
          Product block.
          ─────────────────────────────────────────────────────────────────────
          It used to be `shell-w grid [1fr_480px]`, which at a 1585px shell gave
          the photo 1105px and the buy column 480 — 70/30 in favour of a picture
          of a tool. That is why the h1 wrapped to four lines, the three code
          cells were 133px wide, and the gallery column ran out of content 300px
          before the buy column did.

          Now the block caps at 1440 regardless of how wide the shell gets —
          neither a product shot nor a buy box reads better at 1100px — and the
          buy column takes a third of it. The specs strip and the two support
          cards sit under the photo, filling the height difference between the
          two columns so neither ends in dead white.
        */}
        <div className="pdp-band border-b border-k-line bg-white">
          <div className="pdp-inner grid gap-8 py-6 lg:grid-cols-[minmax(0,1fr)_clamp(400px,34%,520px)] lg:gap-14 lg:py-9">
            {/*
              Gallery column. Everything under the photo lives HERE rather than
              in its own full-width band: the buy column is ~200px taller than a
              540px image, and that gap was the dead white the client kept
              pointing at. Filling it with the specs strip and the two support
              cards makes the two columns finish level and takes two bands —
              and their vertical padding — off the page.
            */}
            <div className="flex min-w-0 flex-col">
              <ProductGallery
                images={product.images}
                alt={product.name}
                discountLabel={saving ? formatPercent(saving.percent) : null}
              />

              {glance.length > 0 && (
                <dl className="mt-5 grid grid-cols-2 gap-px border border-k-line bg-k-line sm:grid-cols-4 lg:mt-6">
                  {glance.map((item) => (
                    <div
                      key={item.k}
                      className="bg-white px-5 py-4 lg:px-8 lg:py-5"
                    >
                      <dt className="t-account-label text-k-text-4">
                        {upGreek(item.k)}
                      </dt>
                      <dd className="mt-1.5 font-mono text-[17px] leading-[1.2] font-semibold text-k-ink">
                        {item.v}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              {/* Dealer band + expert help, side by side. */}
              <div className="mt-px grid border border-k-line bg-white md:grid-cols-2">
                {product.brand && (
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-k-line px-4 py-5 md:border-r md:border-b-0 md:px-5">
                    <div className="flex min-w-0 items-center gap-4">
                      {product.brand.logo && (
                        <Image
                          src={product.brand.logo}
                          alt={product.brand.name}
                          width={96}
                          height={96}
                          className="block h-12 w-12 shrink-0 object-contain"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-k-ink">
                          {t("episimi_antiprosopeysi")} {product.brand.name} {t("stin_ellada")}
                        </p>
                        <p className="mt-1 text-[12.5px] leading-[1.55] text-k-text-3">
                          {t("gnisio_proion_eggyisi_kataskeyasti_servis")}
                        </p>
                      </div>
                    </div>
                    <Link
                      href={`/brands/${product.brand.slug}`}
                      className="t-link-mono shrink-0 border-b-[1.5px] border-k-red pb-[3px] text-k-ink transition-colors hover:text-k-red"
                    >
                      {upGreek(t("ola_ta", { name: product.brand.name }))} →
                    </Link>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-4 border-l-[3px] border-k-red bg-k-surface-3 px-4 py-5 md:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="t-account-label text-k-text-4">
                      {upGreek(
                        product.category
                          ? t("ypeythynos_katigorias", { name: product.category.name })
                          : t("ypeythynos_katigorias"),
                      )}
                    </p>
                    <p className="mt-1.5 text-[14px] font-semibold text-k-ink">
                      {t("den_xerete_an_kanei_gia")}
                    </p>
                    <p className="mt-1 text-[12px] leading-[1.55] text-k-text-3">
                      {t("kaleste_mas_46_chronia_sta")}
                    </p>
                  </div>
                  <a
                    href="tel:+302104111355"
                    className="t-card-cta flex items-center justify-center bg-k-ink px-4 py-3 text-white transition-colors hover:bg-k-red"
                  >
                    210 411 1355
                  </a>
                </div>
              </div>
            </div>

            {/* Buy column */}
            <div className="flex min-w-0 flex-col">
              {product.brand && (
                <div className="flex items-center gap-3">
                  {product.brand.logo && (
                    <Image
                      src={product.brand.logo}
                      alt=""
                      width={96}
                      height={96}
                      className="block h-8 w-8 shrink-0 object-contain"
                    />
                  )}
                  <Link
                    href={`/brands/${product.brand.slug}`}
                    className="text-[11px] font-bold tracking-[0.14em] text-k-red transition-colors hover:text-k-red-hover"
                  >
                    {upGreek(product.brand.name)}
                  </Link>
                  <span className="t-brand-count ml-auto flex items-center gap-1.5 border border-k-line-2 px-2 py-1 text-k-text-3">
                    <span
                      aria-hidden
                      className="block h-1.5 w-1.5 bg-k-green"
                    />
                    {upGreek(t("episimi_antiprosopeysi"))}
                  </span>
                </div>
              )}

              <h1 className="font-display mt-3.5 text-[21px] leading-[1.24] font-medium text-balance text-k-ink lg:text-[26px]">
                {product.name}
              </h1>

              {/*
                Codes as one inline row, not three boxed cells. At 133px each
                the labels truncated to "ΚΩΔ. ΚΑΤΑΣΚΕΥΑ…", which is worse than
                no label.
              */}
              <dl className="mt-3.5 flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
                {[
                  { label: t("kodikos"), value: product.sku },
                  { label: t("kod_kataskeyasti"), value: product.mpn },
                  { label: "EAN", value: product.ean },
                ]
                  .filter((item) => item.value && item.value !== "—")
                  .map((item) => (
                    <div key={item.label} className="flex items-baseline gap-2">
                      <dt className="t-account-label text-k-text-4">
                        {upGreek(item.label)}
                      </dt>
                      <dd className="font-mono text-[12.5px] font-semibold text-k-ink">
                        {item.value}
                      </dd>
                    </div>
                  ))}
              </dl>

              {/*
                The short description belongs HERE, above the price — it is the
                sentence that answers "is this the right thing" and it was
                buried two sections down behind a tab.
              */}
              {product.shortDescription && (
                <Expandable
                  lines={3}
                  collapsible={product.shortDescription.length > 190}
                  className="mt-4 text-[13.5px] leading-[1.65] text-k-text-2"
                >
                  {product.shortDescription}
                </Expandable>
              )}

              <PriceBox
                productId={product.id}
                priceNet={product.priceNet}
                priceListNet={product.priceListNet}
                vatRate={product.vatRate}
                qty={product.qty}
                inStock={product.inStock}
              />

              {/*
                Trust grid. `flex-1` with stretched rows: the buy column is the
                taller of the two only until the gallery column gained the
                specs strip and the support cards under the photo — after that
                this block was left floating with ~180px of white beneath it.
                Growing into that space lands its bottom edge exactly on the
                left cards' bottom edge.

                Each tile carries its own icon and accent colour. Four
                identical grey paragraphs is what "flat and lifeless" looked
                like here, and colour is doing real work: green for what is
                guaranteed, red for what costs nothing, ink for logistics.
              */}
              <div className="grid flex-1 auto-rows-fr grid-cols-2 gap-px border border-t-0 border-k-line bg-k-line">
                {[
                  {
                    t: t("paradosi_24_48o"),
                    d: t("panelladika_me_courier"),
                    tone: "ink" as const,
                    icon: (
                      <>
                        <rect x="1" y="6" width="13" height="10" rx="1" />
                        <path d="M14 9h4l3 3v4h-7z" />
                        <circle cx="6" cy="18" r="2" />
                        <circle cx="17" cy="18" r="2" />
                      </>
                    ),
                  },
                  {
                    t: t("dorean_ano_150"),
                    d: t("kathari_axia_paraggelias"),
                    tone: "red" as const,
                    icon: (
                      <>
                        <path d="M20 12V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h9" />
                        <path d="M17 15h6M20 12v6" />
                      </>
                    ),
                  },
                  {
                    t: t("epistrofi_14_imeron"),
                    d: t("ametacheiristo_me_parastatiko"),
                    tone: "ink" as const,
                    icon: (
                      <>
                        <path d="M3 12a9 9 0 1 0 3-6.7" />
                        <path d="M3 4v5h5" />
                      </>
                    ),
                  },
                  {
                    t: product.guaranteeMonths
                      ? t("eggyisi_minon", { guaranteeMonths: product.guaranteeMonths })
                      : t("episimi_eggyisi"),
                    d: t("servis_antallaktika"),
                    tone: "green" as const,
                    icon: (
                      <>
                        <path d="M12 3l8 3v6c0 5-3.4 8.4-8 9.5C7.4 20.4 4 17 4 12V6z" />
                        <path d="M9 12l2 2 4-4" />
                      </>
                    ),
                  },
                ].map((item) => (
                  <div
                    key={item.t}
                    className="flex items-start gap-3 bg-white px-4 py-4 transition-colors hover:bg-k-surface-2"
                  >
                    <span
                      aria-hidden
                      className={`mt-px flex h-7 w-7 shrink-0 items-center justify-center ${
                        item.tone === "red"
                          ? "bg-k-red/10 text-k-red"
                          : item.tone === "green"
                            ? "bg-k-green/10 text-k-green"
                            : "bg-k-ink/6 text-k-ink"
                      }`}
                    >
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        {item.icon}
                      </svg>
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[11.5px] leading-[1.3] font-semibold text-k-ink">
                        {item.t}
                      </span>
                      <span className="mt-1 block text-[11.5px] leading-[1.5] text-k-text-3">
                        {item.d}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <ProductTabs product={product} />

        {/*
          White, NOT dark. The footer is already #101012, so a dark band here
          ran straight into it and the two read as one black mass with the
          product cards floating in the middle. On this site the dark surface
          means CHROME — hero, breadcrumb, footer — and borrowing it for a
          content section breaks that meaning.

          The rhythm through the page is therefore tinted (tabs) → white
          (related) → dark (footer), with the hazard rule marking the change of
          register from "this product" to "the alternatives".
        */}
        {/*
          Οι ερωτήσεις, ΟΡΑΤΕΣ.
          ────────────────────────────────────────────────────────────────────
          Δεν είναι διακόσμηση για το schema: οι οδηγίες του Google απαιτούν το
          περιεχόμενο του FAQPage να φαίνεται στη σελίδα, και schema που δηλώνει
          κάτι που ο επισκέπτης δεν βλέπει είναι παράβαση — όχι έξυπνη κίνηση.

          `<details>` και όχι accordion με JavaScript: ανοίγει χωρίς script,
          είναι προσβάσιμο από πληκτρολόγιο εξ ορισμού, και το περιεχόμενο
          υπάρχει στο HTML ακόμα και κλειστό — που είναι αυτό που διαβάζει ένας
          crawler.
        */}
        {faq.length > 0 && (
          <section className="band-base">
            <div className="pdp-band py-9 lg:py-12">
              <div className="pdp-inner">
                <h2 className="t-eyebrow mb-5 text-k-text-4">
                  {upGreek("Συχνές ερωτήσεις")}
                </h2>
                <div className="border-t border-k-line">
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
              </div>
            </div>
          </section>
        )}

        {related.length > 0 && (
          <section className="band-base">
            <div className="rule-hazard" />
            <div className="pdp-band py-9 lg:py-14">
              <div className="pdp-inner">
                <SectionHead
                  eyebrow={
                    product.category
                      ? t("stin_idia_katigoria", { name: product.category.name })
                      : t("stin_idia_katigoria")
                  }
                  title={t("schetika_proionta")}
                  lead={t("idia_chrisi_diaforetiko_megethos_i")}
                  meta={
                    product.category && (
                      <Link
                        href={`/katalogos/${product.category.slug}`}
                        className="t-btn-sm inline-block border-[1.5px] border-k-ink px-6 py-3.5 text-k-ink transition-colors hover:bg-k-ink hover:text-white"
                      >
                        {upGreek(t("oli_i_katigoria"))} →
                      </Link>
                    )
                  }
                />

                {/*
                  A rail, not a grid. How many fit is CSS: each card claims a
                  fifth of the row but never goes under 232px, so a wide band
                  shows five and a narrow one three — and the arrows reach the
                  rest instead of the row wrapping into a second line of
                  suggestions nobody scrolled for.
                */}
                <div className="mt-7 lg:mt-9">
                  <ProductRail>
                    {related.map((item) => (
                      <div
                        key={item.id}
                        className="w-[calc(50%-0.375rem)] shrink-0 snap-start sm:w-[calc(33.333%-0.667rem)] lg:w-[calc(20%-0.8rem)] lg:min-w-[232px]"
                      >
                        <ProductCard product={item} />
                      </div>
                    ))}
                  </ProductRail>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      <SiteFooter categories={rootCategories} />
    </QuickViewProvider>
  );
}
