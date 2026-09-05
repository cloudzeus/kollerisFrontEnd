import { getTranslations } from "next-intl/server";
import { pageMeta } from "@/lib/seo/urls";
import type { Metadata } from "next";
import Image from "next/image";
import { setRequestLocale } from "next-intl/server";
import { SectionHead } from "@/components/chrome/SectionHead";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { infoPageJsonLd, yearsInBusiness } from "@/lib/seo/structured-data";
import { getMiniCart } from "@/lib/cart/cart";
import { getCompanyProof } from "@/lib/catalog/editorial";
import {
  getCatalogueStats,
  getMenuTree,
  getRootCategories,
  getTopBrands,
} from "@/lib/catalog/queries";
import { upGreek } from "@/lib/greek";
import { Zone } from "@/components/zones/Zone";
import { logoScaleStyle } from "@/lib/catalog/brand-logo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // Explicit locale: `setRequestLocale` belongs to the render pass, and
  // metadata is generated outside it.
  const t = await getTranslations({ locale, namespace: "etaireia.page" });
  const title = t("titlos_i_etaireia");
  const description = t("perigrafi_46_chronia_sta_viomichanika", {
    years: yearsInBusiness(),
  });
  return {
    /* Canonical, γλώσσες και Open Graph μαζί: το `openGraph` κληρονομείται
       ολόκληρο από όποια σελίδα δεν ορίζει δικό της, οπότε 12 από 16 σελίδες
       μοιράζονταν με τον τίτλο της αρχικής. */
    ...pageMeta({ path: "/etaireia", locale, title, description }),
    title,
    description,
  };
}

const FOUNDED = 1978;

/**
 * The company page.
 *
 * The idea, and the reason it is not the usual about page: every company page
 * in this trade says "decades of experience" and "wide range", and every buyer
 * has read a hundred of them. So this one makes no claim it cannot back with a
 * number read out of the warehouse at request time.
 *
 * "Μεγάλη γκάμα" becomes 5.305 codes. "Άμεση διαθεσιμότητα" becomes 4.644 of
 * them on the shelf, 891 tonnes of steel. "Τεχνική υποστήριξη" becomes 400.499
 * catalogued specifications. An engineer skims the adjectives and reads the
 * figures — so the figures are the page.
 */
export default async function CompanyPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const t = await getTranslations("etaireia.page");
  const { locale } = await params;
  setRequestLocale(locale);

  const [proof, menuTree, brands, stats, rootCategories, miniCart] =
    await Promise.all([
      getCompanyProof(locale),
      getMenuTree(locale),
      getTopBrands(locale, 16),
      getCatalogueStats(),
      getRootCategories(locale),
      getMiniCart(locale),
    ]);

  const years = new Date().getFullYear() - FOUNDED;
  const tonnes = Math.round(proof.stockKg / 1000);

  /*
   * Claim → evidence. The left column is what a company page normally asserts;
   * the right is the figure that makes it checkable. Pairing them is the whole
   * argument of the page.
   */
  const proofRows = [
    {
      claim: t("megali_gkama"),
      evidence: proof.products.toLocaleString(locale),
      unit: t("kodikoi_online"),
      note: t("se_katigories_kai_ypokatigories", {
        categories: proof.categories,
        n: proof.nodes.toLocaleString(locale),
      }),
    },
    {
      claim: t("amesi_diathesimotita"),
      evidence: proof.inStock.toLocaleString(locale),
      unit: t("kodikoi_sto_rafi"),
      note: t("temachia_tora_ston_peiraia", {
        n: proof.units.toLocaleString(locale),
      }),
    },
    {
      claim: t("pragmatiko_apothema"),
      evidence: tonnes.toLocaleString(locale),
      unit: t("tonoi_ergaleion"),
      note: t("ypologismenoi_apo_to_varos_kathe"),
    },
    {
      claim: t("techniki_tekmiriosi"),
      evidence: proof.specs.toLocaleString(locale),
      unit: t("charaktiristika"),
      note: t("kai_fotografies_proionton", {
        n: proof.images.toLocaleString(locale),
      }),
    },
    {
      claim: t("episimi_antiprosopeysi"),
      evidence: String(proof.brands),
      unit: "brands",
      note: t("me_eggyisi_kataskeyasti_servis_kai"),
    },
    {
      claim: t("synepeia_ston_chrono"),
      evidence: String(years),
      unit: t("chronia"),
      note: t("apo_to_stin_idia_doyleia", { FOUNDED: FOUNDED }),
    },
  ];

  const timeline = [
    {
      year: "1978",
      title: t("i_archi_ston_peiraia"),
      body: t("i_kolleris_xekina_promitheyontas_ergaleia"),
    },
    {
      year: "1990s",
      title: t("apo_ta_naypigeia_sti_viomichania"),
      body: t("ergostasia_synergeia_kai_technikes_etaireies"),
    },
    {
      year: "2000s",
      title: t("episimes_antiprosopeies"),
      body: t("synergasies_me_kataskeyastes_poy_kratoyn", {
        brands: proof.brands,
      }),
    },
    {
      year: t("simera"),
      title: t("o_katalogos_online"),
      body: t("olokliro_to_apothema_me_times", {
        n: proof.products.toLocaleString(locale),
      }),
    },
  ];

  const promises = [
    {
      title: t("sikonoyme_to_tilefono"),
      body: t("den_yparchei_chatbot_anamesa_rotate"),
    },
    {
      title: t("o_ti_leei_diathesimo_einai"),
      body: t("i_diathesimotita_sto_site_einai"),
    },
    {
      title: t("gnisio_me_eggyisi"),
      body: t("episimi_antiprosopeysi_simainei_eggyisi_kataskeyasti"),
    },
    {
      title: t("feygei_simera"),
      body: t("paraggelia_prin_tis_15_00"),
    },
  ];

  /* «Εδώ είναι η ταυτότητα της επιχείρησης». Το `mainEntity` δείχνει πίσω στο
     ίδιο `#shop` αντί να ξαναγράφει τα στοιχεία — δύο αντίγραφα της
     διεύθυνσης αποκλίνουν την πρώτη φορά που αλλάζει το ένα. */
  const aboutLd = infoPageJsonLd(
    "AboutPage",
    { name: t("titlos_i_etaireia"), path: "/etaireia" },
    locale,
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutLd) }}
      />
      <SiteChrome
        locale={locale}
        cart={miniCart}
        categories={menuTree}
        brands={brands}
        stats={stats}
      />

      <main id="main">
        <Zone id="about.top" locale={locale} />
        {/* Hero */}
        <div className="shell-x bg-k-ink-deep">
          <nav
            aria-label="Breadcrumb"
            className="t-util flex h-11 items-center gap-2.5 text-white/45"
          >
            <Link href="/" className="text-white/60 hover:text-white">
              {upGreek(t("archiki"))}
            </Link>
            <span className="text-k-red">/</span>
            <span className="text-white">{upGreek(t("i_etaireia"))}</span>
          </nav>

          <div className="grid gap-8 pt-2.5 pb-9 lg:grid-cols-[1fr_360px] lg:items-end lg:gap-16 lg:pb-12">
            <div className="min-w-0">
              <p className="t-eyebrow flex items-center gap-2.5 text-k-red">
                <span aria-hidden className="rule-accent block shrink-0" />
                {upGreek(t("peiraias_apo_to", { FOUNDED: FOUNDED }))}
              </p>
              <h1 className="font-display mt-3.5 text-[26px] leading-[1.12] t-display text-balance text-white lg:text-[42px]">
                {upGreek(t("den_sas_zitame_na_mas"))}
                <br />
                <span className="text-k-red">
                  {upGreek(t("deite_ta_noymera"))}
                </span>
              </h1>
              <p className="mt-5 max-w-[600px] text-[13.5px] leading-[1.7] text-white/60 lg:text-[15px]">
                {t("kathe_promitheytis_ergaleion_grafei_megali")}
              </p>
            </div>

            <div className="border-l-[3px] border-k-red pl-5 lg:pl-6">
              <p className="font-mono text-[46px] leading-none font-semibold text-white lg:text-[64px]">
                {years}
              </p>
              <p className="t-account-label mt-2 text-white/50">
                {upGreek(t("chronia_sta_ergaleia"))}
              </p>
              <p className="mt-3 text-[12.5px] leading-[1.6] text-white/45">
                {t("naypigeia_ergostasia_synergeia_oi_idioi")}
              </p>
            </div>
          </div>
        </div>

        {/* Claim → evidence */}
        <section className="band-base">
          <div className="shell-x py-9 lg:py-14">
            <SectionHead
              eyebrow={t("zontana_apo_tin_apothiki")}
              title={t("kathe_ischyrismos_me_to_noymero")}
              lead={t("oi_times_dexia_den_einai")}
            />

            <dl className="mt-8 grid gap-px border border-k-line bg-k-line lg:mt-10 lg:grid-cols-2">
              {proofRows.map((row) => (
                <div
                  key={row.claim}
                  className="flex items-start justify-between gap-6 bg-white p-5 transition-colors hover:bg-k-surface-2 lg:p-7"
                >
                  <div className="min-w-0">
                    <dt className="text-[14px] leading-[1.3] font-semibold text-k-ink lg:text-[15px]">
                      {row.claim}
                    </dt>
                    <dd className="mt-1.5 text-[12.5px] leading-[1.6] text-k-text-3">
                      {row.note}
                    </dd>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="block font-mono text-[24px] leading-none font-semibold text-k-ink lg:text-[30px]">
                      {row.evidence}
                    </span>
                    <span className="t-account-label mt-1.5 block text-k-text-4">
                      {upGreek(row.unit)}
                    </span>
                  </div>
                </div>
              ))}
            </dl>

            {proof.heaviestCategory && (
              <p className="mt-5 flex flex-wrap items-center gap-2 text-[12.5px] text-k-text-3">
                <span aria-hidden className="block h-1.5 w-1.5 bg-k-red" />
                {t("i_megalyteri_katigoria_mas_einai")}{" "}
                <Link
                  href={`/katalogos/${proof.heaviestCategory.slug}`}
                  className="font-semibold text-k-ink underline underline-offset-4 hover:text-k-red"
                >
                  {proof.heaviestCategory.name}
                </Link>{" "}
                {t("me")} {proof.heaviestCategory.count.toLocaleString(locale)}{" "}
                {t("kodikoys")}
              </p>
            )}
          </div>
        </section>

        <Zone id="about.middle" locale={locale} />

        {/* Timeline */}
        <section className="band-alt border-t border-k-line">
          <div className="shell-x py-9 lg:py-14">
            <SectionHead
              eyebrow={t("i_diadromi")}
              title={t("apo_to_mechri_simera", { FOUNDED: FOUNDED })}
            />

            <ol className="mt-8 grid gap-px border border-k-line bg-k-line lg:mt-10 lg:grid-cols-4">
              {timeline.map((step, index) => (
                <li
                  key={step.year}
                  className="flex flex-col gap-2.5 bg-white p-5 lg:p-7"
                >
                  <span
                    className={`t-cat-num ${index === timeline.length - 1 ? "text-k-red" : "text-k-text-5"}`}
                  >
                    {step.year}
                  </span>
                  <span className="text-[14px] leading-[1.3] font-semibold text-k-ink">
                    {step.title}
                  </span>
                  <span className="text-[12.5px] leading-[1.65] text-k-text-3">
                    {step.body}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Promises */}
        <section className="band-base border-t border-k-line">
          <div className="shell-x py-9 lg:py-14">
            <SectionHead
              eyebrow={t("ti_simainei_na_agorazete_apo")}
              title={t("tessera_pragmata_poy_den_allazoyn")}
            />
            <div className="mt-8 grid gap-px border border-k-line bg-k-line sm:grid-cols-2 lg:mt-10 lg:grid-cols-4">
              {promises.map((item) => (
                <div
                  key={item.title}
                  className="border-l-[3px] border-k-red bg-white p-5 lg:p-6"
                >
                  <p className="text-[13.5px] leading-[1.3] font-semibold text-k-ink">
                    {item.title}
                  </p>
                  <p className="mt-2 text-[12.5px] leading-[1.65] text-k-text-3">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Brands */}
        {brands.length > 0 && (
          <section className="band-alt border-t border-k-line">
            <div className="shell-x py-9 lg:py-14">
              <SectionHead
                eyebrow={t("episimi_antiprosopeysi")}
                title={t("ta_brands_poy_ekprosopoyme")}
                lead={t("gnisio_proion_eggyisi_kataskeyasti_servis")}
                meta={
                  <Link
                    href="/brands"
                    className="t-btn-sm inline-block border-[1.5px] border-k-ink px-6 py-3.5 text-k-ink transition-colors hover:bg-k-ink hover:text-white"
                  >
                    {upGreek(t("ola_ta_brands"))} →
                  </Link>
                }
              />
              <div className="mt-8 grid grid-cols-3 gap-px border border-k-line bg-k-line sm:grid-cols-4 lg:mt-10 lg:grid-cols-8">
                {brands.map((brand) => (
                  <Link
                    key={brand.slug}
                    href={`/brands/${brand.slug}`}
                    className="flex min-h-[132px] flex-col items-center justify-center gap-1.5 bg-white p-5 transition-colors hover:bg-k-surface-2 lg:min-h-[150px]"
                  >
                    {brand.logo ? (
                      /* Ίδια γεωμετρία με τον τοίχο μαρκών της αρχικής: 20px
                         περιθώριο γύρω από κάθε λογότυπο, `max-w-full` ώστε να
                         μη βγαίνει ποτέ από το κουτί. Ήταν 44px — υποδιπλάσιο
                         από τα 90 της αρχικής, στο ίδιο κατάστημα. */
                      <Image
                        src={brand.logo}
                        alt={brand.name}
                        width={200}
                        height={200}
                        style={logoScaleStyle(brand.slug)}
                        className="block h-[76px] w-[76px] max-w-full object-contain lg:h-[90px] lg:w-[90px]"
                      />
                    ) : (
                      <span className="t-brand-name text-center text-k-ink">
                        {brand.name}
                      </span>
                    )}
                    <span className="t-brand-count text-center text-k-text-4">
                      {brand.name}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Contact */}
        <section className="band-ink band-grid">
          <div className="rule-hazard" />
          <div className="shell-x py-9 lg:py-14">
            <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-16">
              <div className="min-w-0">
                <SectionHead
                  tone="dark"
                  eyebrow={t("miliste_mas")}
                  title={t("peite_mas_ti_doyleia_ochi")}
                  lead={t("den_xerete_poio_ergaleio_kanei", {
                    years: yearsInBusiness(),
                  })}
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <a
                  href="tel:+302104111355"
                  className="t-btn bg-k-red px-8 py-4 text-white transition-colors hover:bg-k-red-hover"
                >
                  210 411 1355
                </a>
                <Link
                  href="/epikoinonia"
                  className="t-btn-outline border-[1.5px] border-white/34 px-7 py-4 text-white transition-colors hover:border-white hover:bg-white hover:text-k-ink"
                >
                  {upGreek(t("epikoinonia"))}
                </Link>
              </div>
            </div>
          </div>
        </section>
        <Zone id="about.below" locale={locale} />
      </main>

      <SiteFooter categories={rootCategories} />
    </>
  );
}
