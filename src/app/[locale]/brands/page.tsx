import { getTranslations } from "next-intl/server";
import { alternatesFor } from "@/lib/seo/urls";
import type { Metadata } from "next";
import Image from "next/image";
import { setRequestLocale } from "next-intl/server";
import { BrandSearchGrid } from "@/components/brands/BrandSearchGrid";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getMiniCart } from "@/lib/cart/cart";
import { getBrandSpecialties, getBrandsIndex, getBrandsStats } from "@/lib/catalog/brands";
import {
  getCatalogueStats,
  getMenuTree,
  getRootCategories,
  getTopBrands,
} from "@/lib/catalog/queries";
import { upGreek } from "@/lib/greek";
import { Zone } from "@/components/zones/Zone";

/* Dynamic: the header renders the visitor's own cart from the session cookie. */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "brands.page" });
  const { brandCount, productCount } = await getBrandsStats();
  return {
    // Each language is a page in its own right: its own canonical, and the
    // other two declared as alternates so they are read as translations
    // rather than as duplicates competing with each other.
    alternates: alternatesFor("/brands", locale),
    title: "Brands",
    description: t("brands_me_kodikoys_se_apothema", { brandCount: brandCount, n: productCount.toLocaleString(locale) }),
  };
}

export default async function BrandsPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const t = await getTranslations("brands.page");
  const { locale } = await params;
  setRequestLocale(locale);

  const [
    brands,
    specialties,
    brandStats,
    menuTree,
    topBrands,
    stats,
    rootCategories,
    miniCart,
  ] = await Promise.all([
    getBrandsIndex(locale),
    getBrandSpecialties(locale),
    getBrandsStats(),
    getMenuTree(locale),
    getTopBrands(locale, 16),
    getCatalogueStats(),
    getRootCategories(locale),
    getMiniCart(locale),
  ]);

  const featured = brands.slice(0, 8);

  const kpis = [
    { v: String(brandStats.brandCount), k: t("brands_me_energa_proionta") },
    { v: String(brandStats.inStockBrandCount), k: t("brands_me_apothema_tora") },
    {
      v: brandStats.productCount.toLocaleString(locale),
      k: t("kodikoi_ston_katalogo"),
    },
    { v: "1978", k: t("apo_to_proto_mas_symvolaio") },
  ];

  return (
    <>
      <SiteChrome
        locale={locale}
        cart={miniCart}
        categories={menuTree}
        brands={topBrands}
        stats={stats}
      />

      <main id="main">
        <Zone id="brands.top" locale={locale} />
        {/* Hero */}
        <div className="relative overflow-hidden bg-k-ink-deep">
          <span
            aria-hidden
            className="font-display pointer-events-none absolute -top-10 right-8 hidden text-[210px] leading-none font-extralight tracking-[-0.03em] text-white/[0.04] lg:block"
          >
            {brandStats.brandCount}
          </span>

          <div className="shell-x relative">
            <nav
              aria-label="Breadcrumb"
              className="t-util flex h-11 items-center gap-2.5 text-white/45"
            >
              <Link href="/" className="text-white/60 hover:text-white">
                {upGreek(t("archiki"))}
              </Link>
              <span className="text-k-red">/</span>
              <span className="text-white">BRANDS</span>
            </nav>

            <div className="grid items-end gap-8 pt-3.5 pb-10 lg:grid-cols-[1fr_440px] lg:gap-14">
              <div>
                <p className="t-eyebrow mb-4 flex items-center gap-[11px] text-k-red">
                  <span className="hidden h-[1.5px] w-[26px] bg-k-red lg:block" />
                  EXCLUSIVE PARTNERSHIPS
                </p>
                <h1 className="font-display text-[26px] leading-[1.14] t-display text-white lg:text-[36px]">
                  {upGreek(t("ta_brands_poy"))}
                  <br />
                  {upGreek(t("antiprosopeyoyme"))}
                </h1>
                <p className="t-body mt-4 max-w-[620px] text-white/60">
                  {t("apo_to_1978_synergazomaste_apeytheias")}
                </p>
              </div>

              <dl className="grid grid-cols-2 gap-px border border-white/12 bg-white/12">
                {kpis.map((kpi) => (
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
          </div>
        </div>

        {/* Featured */}
        <section className="shell-x border-b border-k-line bg-white py-8 lg:pt-14 lg:pb-15">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
            <div>
              <p className="t-eyebrow mb-3 text-k-red">{upGreek(t("episimes_antiprosopeyseis"))}</p>
              <h2 className="t-h2 text-k-ink">
                {upGreek(t("ta_brands_poy_mas_zitate", { length: featured.length }))}
              </h2>
            </div>
            <p className="t-body-sm max-w-[360px] text-k-text-3 lg:text-right">
              {t("gia_ayta_kratame_to_megalytero")}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-px border border-k-line bg-k-line lg:grid-cols-4">
            {featured.map((brand, index) => {
              const dark = index % 2 === 1;
              return (
                <Link
                  key={brand.id}
                  href={`/brands/${brand.slug}`}
                  className={`group flex min-h-[210px] flex-col p-5 transition-colors ${
                    dark ? "bg-k-ink hover:bg-k-ink-deep" : "bg-white hover:bg-k-surface-2"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={`t-badge px-1.5 py-1 ${
                        dark ? "bg-k-red text-white" : "bg-k-surface-3 text-k-text-3"
                      }`}
                    >
                      {upGreek(t("antiprosopeia"))}
                    </span>
                    <span
                      className={`t-cat-num ${dark ? "text-white/35" : "text-k-text-5"}`}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>

                  <div className="flex flex-1 items-center justify-center py-6">
                    {brand.logo ? (
                      <Image
                        src={brand.logo}
                        alt={brand.name}
                        width={200}
                        height={200}
                        className={`block h-20 w-20 object-contain ${
                          dark ? "brightness-0 invert" : ""
                        }`}
                      />
                    ) : (
                      <span
                        className={`font-display text-lg ${dark ? "text-white" : "text-k-ink"}`}
                      >
                        {brand.name}
                      </span>
                    )}
                  </div>

                  <div
                    className={`flex items-baseline justify-between gap-3 border-t pt-3.5 ${
                      dark ? "border-white/12" : "border-k-line"
                    }`}
                  >
                    <div>
                      <p
                        className={`font-mono text-[17px] leading-none font-semibold ${
                          dark ? "text-white" : "text-k-ink"
                        }`}
                      >
                        {brand.productCount.toLocaleString(locale)}
                      </p>
                      <p
                        className={`t-brand-count mt-1.5 ${
                          dark ? "text-white/45" : "text-k-text-4"
                        }`}
                      >
                        {upGreek(t("kodikoi_se_apothema"))}
                      </p>
                    </div>
                    <span
                      className={`text-lg transition-transform group-hover:translate-x-1 ${
                        dark ? "text-k-red" : "text-k-ink"
                      }`}
                    >
                      →
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* All in-stock brands + search */}
        <section className="shell-x bg-white pb-10 lg:pb-14">
          <div className="-mx-4 lg:-mx-10">
            <BrandSearchGrid brands={brands} />
          </div>
        </section>

        {/* By specialty */}
        {specialties.length > 0 && (
          <section className="shell-x border-y border-k-line bg-k-surface-3 py-10 lg:py-13">
            <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="t-eyebrow mb-3 text-k-red">{upGreek(t("ana_eidikotita"))}</p>
                <h2 className="t-h2 text-k-ink">{upGreek(t("poio_brand_gia_poia_doyleia"))}</h2>
              </div>
              <Link
                href="/katalogos"
                className="t-link-mono self-start border-b-[1.5px] border-k-red pb-[3px] text-k-ink hover:text-k-red"
              >
                {upGreek(t("olos_o_katalogos"))} →
              </Link>
            </div>

            <div className="grid gap-px border border-k-line bg-k-line sm:grid-cols-2 lg:grid-cols-4">
              {specialties.map((group) => (
                <div key={group.categorySlug} className="bg-white p-5 lg:p-6">
                  {group.categoryImage ? (
                    <Image
                      src={group.categoryImage}
                      alt=""
                      width={52}
                      height={52}
                      className="block h-[26px] w-[26px] object-contain"
                    />
                  ) : (
                    <span className="block h-[26px] w-[26px] bg-k-surface-3" />
                  )}

                  <Link
                    href={`/katalogos/${group.categorySlug}`}
                    className="mt-4 block text-[12.5px] font-bold tracking-[0.04em] text-k-ink hover:text-k-red"
                  >
                    {upGreek(group.categoryName)}
                  </Link>
                  <p className="mt-1.5 text-[12px] leading-[1.6] text-k-text-3">
                    {group.productCount.toLocaleString(locale)} {t("kodikoi_apo")}{" "}
                    {group.brands.length} brands.
                  </p>

                  <div className="mt-3.5 flex flex-wrap gap-1.5">
                    {group.brands.map((brand) => (
                      <Link
                        key={brand.slug}
                        href={`/brands/${brand.slug}`}
                        className="bg-k-surface-3 px-2 py-1.5 text-[10px] font-semibold tracking-[0.05em] text-k-text-2 transition-colors hover:bg-k-ink hover:text-white"
                      >
                        {brand.name}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <SiteFooter categories={rootCategories} />
    </>
  );
}
