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
import { getNewArrivals, getOffers } from "@/lib/catalog/editorial";
import { getActiveOffers } from "@/lib/offers/offers";
import { OfferWidget } from "@/components/offers/OfferWidget";
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // Explicit locale: `setRequestLocale` belongs to the render pass, and
  // metadata is generated outside it.
  const t = await getTranslations({ locale, namespace: "prosfores.page" });
  return {
    // Each language is a page in its own right: its own canonical, and the
    // other two declared as alternates so they are read as translations
    // rather than as duplicates competing with each other.
    alternates: alternatesFor("/prosfores", locale),
    title: t("titlos_prosfores"),
    description: t("perigrafi_pragmatikes_meioseis_timis_se"),
  };
}

/**
 * Offers.
 *
 * The page is complete and wired to the real query — and it will render an
 * empty state until HDCtool grows a promotional price, because right now there
 * are no offers in the data.
 *
 * That is deliberate. The struck-through prices this site used to show were the
 * standing gap between two SoftOne price lists: 3.600 of 5.305 products (68%)
 * permanently "on sale", 2.192 of them at exactly −6%. A shop where two thirds
 * of the catalogue is always discounted has no discounts, and the Omnibus
 * directive treats an announced reduction as a claim about a previous price.
 *
 * So the empty state is not an apology. It says what is true, and routes the
 * visitor to the two things that ARE real value here: arrivals, and partner
 * pricing for trade accounts.
 */
export default async function OffersPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const t = await getTranslations("prosfores.page");
  const { locale } = await params;
  setRequestLocale(locale);

  const [
    offers,
    campaigns,
    arrivals,
    menuTree,
    brands,
    stats,
    rootCategories,
    miniCart,
    compareSelection,
    compareTray,
  ] = await Promise.all([
    getOffers(locale, 24),
    getActiveOffers(locale),
    getNewArrivals(locale, 1, 5),
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

  const hasOffers = offers.products.length > 0;
  const latest = arrivals.periods[0];

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
            <span className="text-white">{upGreek(t("prosfores"))}</span>
          </nav>

          <div className="pt-2.5 pb-8">
            <h1 className="font-display text-[22px] leading-[1.16] font-medium text-balance text-white lg:text-[30px]">
              {upGreek(t("prosfores"))}
            </h1>
            <p className="mt-3.5 max-w-[640px] text-[13px] leading-[1.68] text-white/60 lg:text-sm">
              {hasOffers ? (
                <>
                  <strong className="font-semibold text-white">
                    {offers.total}
                  </strong>{" "}
                  {t("kodikoi_se_meiomeni_timi")}
                  {offers.bestPercent != null && (
                    <>{t("me_megalyteri_meiosi")}{offers.bestPercent}%</>
                  )}
                  {t("oles_oi_times_me_fpa")}
                </>
              ) : (
                t("den_trechei_prosfora_ayti_ti")
              )}
            </p>
          </div>
        </div>

        {/*
          Campaigns, which is what the back office actually builds.

          They are promotions pointing at a set of products, not price cuts:
          nothing here touches `Product.priceNet`, so a discount is stated as the
          campaign's own claim and never rendered as a struck-through price the
          basket would then fail to honour.

          This is also why the page could look permanently empty. It only ever
          asked `Product.onSale`, which needs `priceList`, which the sync sets to
          null on purpose — so no campaign, however many were published, could
          ever reach it.
        */}
        {campaigns.length > 0 && (
          <section className="band-base border-b border-k-line">
            <div className="shell-x flex flex-col gap-5 py-8 lg:gap-6 lg:py-12">
              {/*
                Each widget gets the shape it was drawn for. The card is a 4:5
                tile meant for a column - the back office says so in its own
                hint - and given the full width of the page it became 1.826px
                tall, which is a page of black. Strips and ribbons are the ones
                that want the full measure.
              */}
              {campaigns
                .filter((c) => c.widget !== "card")
                .map((campaign) => (
                  <OfferWidget key={campaign.slug} offer={campaign} locale={locale} />
                ))}

              {campaigns.some((c) => c.widget === "card") && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
                  {campaigns
                    .filter((c) => c.widget === "card")
                    .map((campaign) => (
                      <OfferWidget key={campaign.slug} offer={campaign} locale={locale} />
                    ))}
                </div>
              )}
            </div>
          </section>
        )}

        {hasOffers ? (
          <section className="band-base">
            <div className="shell-x py-8 lg:py-12">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
                {offers.products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    compare={compareStateFor(product.slug, product.scopeKey)}
                  />
                ))}
              </div>
            </div>
          </section>
        ) : (
          <>
            {/*
              An honest empty state. It explains WHY there is nothing here —
              which is a stronger commercial message than a fake discount — and
              then hands over to the two things that are genuinely worth a
              visit.
            */}
            <section className="band-base">
              <div className="shell-x py-9 lg:py-14">
                <div className="max-w-3xl">
                  <p className="t-eyebrow flex items-center gap-2.5 text-k-red">
                    <span aria-hidden className="rule-accent block shrink-0" />
                    {upGreek(t("kamia_energi_prosfora"))}
                  </p>
                  <h2 className="font-display mt-3 text-[21px] leading-[1.2] text-balance text-k-ink lg:text-[28px]">
                    {upGreek(t("mia_ekptosi_poy_trechei_panta"))}
                  </h2>
                  <p className="mt-4 text-[13.5px] leading-[1.75] text-k-text-2">
                    {t("tha_mporoysame_na_deichnoyme_diagrammeni")}
                  </p>
                  <p className="mt-3 text-[13.5px] leading-[1.75] text-k-text-2">
                    {t("otan_kanoyme_pragmatiki_prosfora_tha")}
                  </p>
                </div>

                <div className="mt-8 grid gap-px border border-k-line bg-k-line lg:mt-10 lg:grid-cols-2">
                  <div className="flex flex-col gap-3 border-l-[3px] border-k-red bg-white p-5 lg:p-7">
                    <p className="t-eyebrow text-k-red">
                      {upGreek(t("i_pragmatiki_ekptosi"))}
                    </p>
                    <p className="font-display text-[17px] leading-[1.3] text-k-ink lg:text-xl">
                      {upGreek(t("timi_synergati_gia_epaggelmaties"))}
                    </p>
                    <p className="text-[12.5px] leading-[1.65] text-k-text-3">
                      {t("an_agorazete_gia_etaireia_i")}
                    </p>
                    <Link
                      href="/eggrafi"
                      className="t-btn-sm mt-auto self-start bg-k-ink px-6 py-3.5 text-white transition-colors hover:bg-k-red"
                    >
                      {upGreek(t("aitisi_b2b"))} →
                    </Link>
                  </div>

                  <div className="flex flex-col gap-3 bg-white p-5 lg:p-7">
                    <p className="t-eyebrow text-k-text-4">
                      {upGreek(t("o_ti_kinithike_teleytaia"))}
                    </p>
                    <p className="font-display text-[17px] leading-[1.3] text-k-ink lg:text-xl">
                      {upGreek(
                        latest
                          ? `${latest.count.toLocaleString(locale)} ${
                              latest.count === 1
                                ? t("neos_kodikos")
                                : t("neoi_kodikoi")
                            }`
                          : t("nees_afixeis"),
                      )}
                    </p>
                    <p className="text-[12.5px] leading-[1.65] text-k-text-3">
                      {latest
                        ? t("mpikan_stin_apothiki_ton_deite", { n: latest.label.toLowerCase() })
                        : t("deite_ti_mpike_teleytaia_stin")}
                    </p>
                    <Link
                      href="/nees-afixeis"
                      className="t-btn-sm mt-auto self-start border-[1.5px] border-k-ink px-6 py-3.5 text-k-ink transition-colors hover:bg-k-ink hover:text-white"
                    >
                      {upGreek(t("nees_afixeis"))} →
                    </Link>
                  </div>
                </div>
              </div>
            </section>

            {latest && latest.products.length > 0 && (
              <section className="band-alt border-t border-k-line">
                <div className="shell-x py-8 lg:py-12">
                  <SectionHead
                    eyebrow={latest.label}
                    title={t("pio_prosfata_stin_apothiki")}
                    meta={
                      <Link
                        href="/nees-afixeis"
                        className="t-btn-sm inline-block border-[1.5px] border-k-ink px-6 py-3.5 text-k-ink transition-colors hover:bg-k-ink hover:text-white"
                      >
                        {upGreek(t("oles_oi_afixeis"))} →
                      </Link>
                    }
                  />
                  <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
                    {latest.products.map((product) => (
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
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <SiteFooter categories={rootCategories} />
      <CompareTray tray={compareTray} />
    </QuickViewProvider>
  );
}
