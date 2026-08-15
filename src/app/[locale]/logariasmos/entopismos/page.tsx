import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { SectionHead } from "@/components/chrome/SectionHead";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { OrderTracker } from "@/components/orders/OrderTracker";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getMiniCart } from "@/lib/cart/cart";
import {
  getCatalogueStats,
  getMenuTree,
  getRootCategories,
  getTopBrands,
} from "@/lib/catalog/queries";
import { upGreek } from "@/lib/greek";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // Explicit locale: `setRequestLocale` belongs to the render pass, and
  // metadata is generated outside it.
  const t = await getTranslations({ locale, namespace: "entopismos.page" });
  return {
    title: t("titlos_entopismos_paraggelias"),
    description: t("perigrafi_deite_poy_vrisketai_i"),
    robots: { index: true, follow: true },
  };
}

/**
 * Order tracking.
 *
 * The one account sub-route that works WITHOUT an account, and the reason it
 * ships before the rest of the account area: it needs nothing from HDCtool.
 * The order, its lines and its status history are all in this database, written
 * by our own checkout.
 *
 * The ACS voucher appears once the parcel is handed over, linking out to the
 * courier's own tracking — the live scan events need H6, which is not wired.
 */
export default async function TrackOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("entopismos.page");
  const { locale } = await params;
  setRequestLocale(locale);

  const raw = await searchParams;
  // Deep-linkable from the confirmation email: `?order=KOL-…` prefills the field.
  const initial = (Array.isArray(raw.order) ? raw.order[0] : raw.order)?.trim();

  const [menuTree, brands, stats, rootCategories, miniCart] = await Promise.all([
    getMenuTree(locale),
    getTopBrands(locale, 16),
    getCatalogueStats(),
    getRootCategories(locale),
    getMiniCart(locale),
  ]);

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
            <span className="text-white">{upGreek(t("entopismos_paraggelias"))}</span>
          </nav>

          <div className="pt-2.5 pb-8">
            <h1 className="font-display text-[22px] leading-[1.16] font-medium text-balance text-white lg:text-[30px]">
              {upGreek(t("poy_einai_i_paraggelia_moy"))}
            </h1>
            <p className="mt-3.5 max-w-[600px] text-[13px] leading-[1.68] text-white/60 lg:text-sm">
              {t("arithmos_paraggelias_kai_to_email")}
            </p>
          </div>
        </div>

        <section className="band-base">
          <div className="shell-x py-9 lg:py-12">
            <OrderTracker initialOrderNumber={initial} />
          </div>
        </section>

        <section className="band-alt border-t border-k-line">
          <div className="shell-x py-8 lg:py-12">
            <SectionHead
              eyebrow={t("an_kati_den_vgainei")}
              title={t("den_vriskete_ton_arithmo")}
              lead={t("einai_sto_email_epivevaiosis_sti")}
              meta={
                <div className="flex flex-wrap gap-3">
                  <a
                    href="tel:+302104111355"
                    className="t-btn-sm bg-k-ink px-7 py-4 text-white transition-colors hover:bg-k-red"
                  >
                    210 411 1355
                  </a>
                  <Link
                    href="/syxnes-erotiseis#apostoli"
                    className="t-btn-sm border-[1.5px] border-k-ink px-7 py-4 text-k-ink transition-colors hover:bg-k-ink hover:text-white"
                  >
                    {upGreek(t("erotiseis_apostolis"))}
                  </Link>
                </div>
              }
            />
          </div>
        </section>
      </main>

      <SiteFooter categories={rootCategories} />
    </>
  );
}
