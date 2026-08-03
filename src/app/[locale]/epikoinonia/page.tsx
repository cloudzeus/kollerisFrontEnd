import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { SectionHead } from "@/components/chrome/SectionHead";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { ContactForm } from "@/components/contact/ContactForm";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getMiniCart } from "@/lib/cart/cart";
import {
  getCatalogueStats,
  getMenuTree,
  getRootCategories,
  getTopBrands,
} from "@/lib/catalog/queries";
import { HOURS, openState } from "@/lib/contact/hours";
import { upGreek } from "@/lib/greek";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // Explicit locale: `setRequestLocale` belongs to the render pass, and
  // metadata is generated outside it.
  const t = await getTranslations({ locale, namespace: "epikoinonia.page" });
  return {
    title: t("titlos_epikoinonia"),
    description: t("perigrafi_tilefono_email_kai_forma"),
  };
}

/**
 * Contact.
 *
 * The one live element is the open/closed badge, computed from the request's
 * clock in Europe/Athens. A hardcoded "ανοιχτά" is a small lie that costs a
 * phone call at nine at night and a customer who does not call twice.
 *
 * The page is dynamic for that reason — `openState` reads the current time, so
 * caching it would freeze the badge at build time.
 */
export const dynamic = "force-dynamic";

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const t = await getTranslations("epikoinonia.page");
  const { locale } = await params;
  setRequestLocale(locale);

  const [menuTree, brands, stats, rootCategories, miniCart] = await Promise.all([
    getMenuTree(locale),
    getTopBrands(locale, 16),
    getCatalogueStats(),
    getRootCategories(locale),
    getMiniCart(locale),
  ]);

  const now = openState(new Date());
  /** Under half an hour to close is worth saying out loud. */
  const closingSoon = now.open && now.minutesUntilChange <= 30;

  const channels = [
    {
      label: t("tilefono"),
      value: "210 411 1355",
      href: "tel:+302104111355",
      note: t("sikonei_anthropos_ochi_menoy"),
      primary: true,
    },
    {
      label: "Email",
      value: "info@kolleris.com",
      href: "mailto:info@kolleris.com",
      note: t("apantisi_tin_idia_ergasimi"),
    },
    {
      label: t("katastima"),
      value: t("k_mayromichali_4_peiraias"),
      href: t("https_maps_google_com_q"),
      note: t("paralavi_paraggelias_se_2_ores"),
      external: true,
    },
    {
      label: t("orario"),
      value: t("dey_par_00_16_30", { n: String(HOURS.weekday.open).padStart(2, "0") }),
      note: t("savvato_kai_kyriaki_kleista"),
    },
  ];

  const direct = [
    { area: t("techniki_ypostirixi"), body: t("poio_ergaleio_kanei_gia_ti") },
    { area: t("prosfores_posotites"), body: t("timi_gia_posotita_set_exoplismos") },
    { area: t("paraggelies_apostoles"), body: t("entopismos_timologia_epistrofes_eggyiseis") },
    { area: t("synergasies_b2b"), body: t("etairikos_logariasmos_timi_synergati_pliromi") },
  ];

  return (
    <>
      <SiteChrome
        locale={locale}
        cart={miniCart}
        categories={menuTree}
        brands={brands}
        stats={stats}
      />

      <main id="main">
        <div className="shell-x bg-k-ink-deep">
          <nav aria-label="Breadcrumb" className="t-util flex h-11 items-center gap-2.5 text-white/45">
            <Link href="/" className="text-white/60 hover:text-white">
              {upGreek(t("archiki"))}
            </Link>
            <span className="text-k-red">/</span>
            <span className="text-white">{upGreek(t("epikoinonia"))}</span>
          </nav>

          <div className="grid gap-6 pt-2.5 pb-9 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-16">
            <div className="min-w-0">
              <h1 className="font-artegra text-[22px] leading-[1.16] font-medium text-balance text-white lg:text-[30px]">
                {upGreek(t("peite_mas_ti_doyleia_ochi"))}
              </h1>
              <p className="mt-3.5 max-w-[620px] text-[13px] leading-[1.68] text-white/60 lg:text-sm">
                {t("den_chreiazetai_na_xerete_ti")}
              </p>
            </div>

            {/* Live status — the reason this page is not statically cached. */}
            <div
              className={`shrink-0 border-l-[3px] pl-5 ${now.open ? "border-k-green" : "border-k-amber"}`}
            >
              <p
                className={`t-card-stock flex items-center gap-2 ${
                  now.open ? "text-k-green-2" : "text-k-amber"
                }`}
              >
                <span aria-hidden className="rounded-pill block h-2 w-2 bg-current" />
                {upGreek(now.label)}
              </p>
              <p className="t-brand-count mt-2 font-mono text-white/45">
                {upGreek(t("ora_elladas", { now: now.now }))}
              </p>
              {closingSoon && (
                <p className="mt-2 text-[12px] leading-[1.5] text-white/70">
                  {t("kleinoyme_se")} {now.minutesUntilChange}{t("prolavainete_ena_tilefono")}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Channels */}
        <dl className="shell-w grid grid-cols-2 gap-px border-b border-k-line bg-k-line lg:grid-cols-4">
          {channels.map((channel) => {
            const body = (
              <>
                <dt className="t-account-label text-k-text-4">{upGreek(channel.label)}</dt>
                <dd
                  className={`mt-1.5 leading-[1.25] font-semibold text-k-ink ${
                    channel.primary ? "font-mono text-[19px] lg:text-[23px]" : "text-[14px]"
                  }`}
                >
                  {channel.value}
                </dd>
                <dd className="mt-1.5 text-[12px] leading-[1.5] text-k-text-3">{channel.note}</dd>
              </>
            );

            return channel.href ? (
              <a
                key={channel.label}
                href={channel.href}
                {...(channel.external ? { target: "_blank", rel: "noreferrer" } : {})}
                className="bg-white px-5 py-4 transition-colors hover:bg-k-surface-2 lg:px-8 lg:py-6"
              >
                {body}
              </a>
            ) : (
              <div key={channel.label} className="bg-white px-5 py-4 lg:px-8 lg:py-6">
                {body}
              </div>
            );
          })}
        </dl>

        {/* Form + who answers what */}
        <section className="band-base">
          <div className="shell-x py-9 lg:py-14">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_clamp(300px,30%,400px)] lg:gap-16">
              <div className="min-w-0">
                <SectionHead
                  eyebrow={t("forma")}
                  title={t("grapste_mas")}
                  lead={t("dialexte_thema_kai_ta_pedia")}
                />
                <div className="mt-8 lg:mt-10">
                  <ContactForm locale={locale} pagePath="/epikoinonia" />
                </div>
              </div>

              <aside className="self-start border border-k-line bg-white">
                <p className="flex items-center gap-2.5 border-b border-k-line px-5 py-3.5">
                  <span aria-hidden className="rule-accent block shrink-0" />
                  <span className="t-eyebrow text-k-red">{upGreek(t("poios_apanta_ti"))}</span>
                </p>
                <ul>
                  {direct.map((item) => (
                    <li key={item.area} className="border-b border-k-line px-5 py-3.5 last:border-b-0">
                      <p className="text-[13px] font-semibold text-k-ink">{item.area}</p>
                      <p className="mt-1 text-[12px] leading-[1.55] text-k-text-3">{item.body}</p>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-k-line bg-k-surface-2 px-5 py-4">
                  <p className="text-[12.5px] leading-[1.6] text-k-text-2">
                    {t("ola_pernoyn_apo_to_idio")}
                  </p>
                  <a
                    href="tel:+302104111355"
                    className="t-btn-sm mt-3.5 inline-block bg-k-ink px-6 py-3.5 text-white transition-colors hover:bg-k-red"
                  >
                    210 411 1355
                  </a>
                </div>
              </aside>
            </div>
          </div>
        </section>

        {/* Self-service, so the obvious questions never become a message */}
        <section className="band-alt border-t border-k-line">
          <div className="shell-x py-9 lg:py-12">
            <SectionHead
              eyebrow={t("prin_mas_grapsete")}
              title={t("isos_to_vreite_pio_grigora")}
              lead={t("ta_tria_pragmata_poy_mas")}
            />
            <div className="mt-7 grid gap-px border border-k-line bg-k-line sm:grid-cols-3 lg:mt-9">
              {[
                {
                  title: t("diathesimotita_kai_timi"),
                  body: t("o_ti_vlepete_sto_site"),
                  href: "/katalogos",
                  cta: t("ston_katalogo"),
                },
                {
                  title: t("psachnete_kodiko"),
                  body: t("i_anazitisi_dechetai_kodiko_kolleris"),
                  href: "/anazitisi",
                  cta: t("anazitisi"),
                },
                {
                  title: t("timi_synergati"),
                  body: t("etairikos_logariasmos_me_monimi_ekptosi"),
                  href: "/eggrafi",
                  cta: t("aitisi_b2b"),
                },
              ].map((item) => (
                <div key={item.title} className="flex flex-col gap-2.5 bg-white p-5 lg:p-6">
                  <p className="text-[13.5px] leading-[1.3] font-semibold text-k-ink">
                    {item.title}
                  </p>
                  <p className="text-[12.5px] leading-[1.65] text-k-text-3">{item.body}</p>
                  <Link
                    href={item.href}
                    className="t-card-cta mt-auto self-start border-b-[1.5px] border-k-red pt-2 pb-[3px] text-k-ink transition-colors hover:text-k-red"
                  >
                    {upGreek(item.cta)} →
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter categories={rootCategories} />
    </>
  );
}
