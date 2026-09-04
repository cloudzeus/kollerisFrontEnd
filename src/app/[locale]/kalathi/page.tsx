import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import Image from "next/image";
import { setRequestLocale } from "next-intl/server";
import { CartActionsRow } from "@/components/cart/CartActionsRow";
import { CartCrossSell } from "@/components/cart/CartCrossSell";
import { CartLineRow } from "@/components/cart/CartLineRow";
import { CartSummaryPanel } from "@/components/cart/CartSummaryPanel";
import { QuickOrderPaste } from "@/components/cart/QuickOrderPaste";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getMiniCart, getCart, getCartCrossSell } from "@/lib/cart/cart";
import {
  getCatalogueStats,
  getMenuTree,
  getRootCategories,
  getTopBrands,
} from "@/lib/catalog/queries";
import { upGreek } from "@/lib/greek";
import { Zone } from "@/components/zones/Zone";

/** Always fresh: a cached cart is a wrong cart. */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // Explicit locale: `setRequestLocale` belongs to the render pass, and
  // metadata is generated outside it.
  const t = await getTranslations({ locale, namespace: "kalathi.page" });
  return {
    title: t("titlos_to_kalathi_sas"),
    robots: { index: false, follow: false },
  };
}

export default async function CartPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const t = await getTranslations("kalathi.page");
  const { locale } = await params;
  setRequestLocale(locale);

  const cart = await getCart(locale);
  const lines = cart?.lines ?? [];
  const isEmpty = lines.length === 0;

  const [crossSell, menuTree, brands, stats, rootCategories, miniCart] = await Promise.all([
    isEmpty ? Promise.resolve([]) : getCartCrossSell(locale, lines.map((l) => l.productId)),
    getMenuTree(locale),
    getTopBrands(locale, 16),
    getCatalogueStats(),
    getRootCategories(locale),
    getMiniCart(locale),
  ]);

  const steps = [
    { n: "01", label: t("kalathi"), active: true },
    { n: "02", label: t("stoicheia"), active: false },
    { n: "03", label: t("pliromi"), active: false },
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
          <nav
            aria-label="Breadcrumb"
            className="t-util flex h-11 items-center gap-2.5 text-white/45"
          >
            <Link href="/" className="text-white/60 hover:text-white">
              {upGreek(t("archiki"))}
            </Link>
            <span className="text-k-red">/</span>
            <span className="text-white">{upGreek(t("kalathi_2"))}</span>
          </nav>

          <div className="flex flex-col gap-6 pt-3 pb-8 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
            <div>
              <p className="t-eyebrow mb-3.5 flex items-center gap-[11px] text-k-red">
                <span className="hidden h-[1.5px] w-[26px] bg-k-red lg:block" />
                {isEmpty
                  ? upGreek(t("kanena_proion"))
                  : `${cart!.totals.itemCount} ${upGreek(t("proionta"))} · ${cart!.totals.unitCount} ${upGreek(t("temachia"))}`}
              </p>
              <h1 className="font-display text-[26px] leading-[1.14] t-display text-white lg:text-[34px]">
                {upGreek(t("to_kalathi_sas"))}
              </h1>
            </div>

            <ol className="flex shrink-0">
              {steps.map((step) => (
                <li
                  key={step.n}
                  className={`flex items-center gap-2 border px-4 py-3 text-[11px] font-semibold tracking-[0.07em] ${
                    step.active
                      ? "border-k-red bg-k-red text-white"
                      : "border-white/15 text-white/40"
                  }`}
                >
                  <span className="t-brand-count opacity-70">{step.n}</span>
                  {step.label}
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/*
          The summary panel is rendered only when there is something to total.
          Showing it at €0,00 beside an empty-cart message is the flash the spec
          calls out (§5, acceptance).
        */}
        {isEmpty ? (
          <div className="shell-x bg-white py-20 text-center">
            <Image
              src="/icons/cart.png"
              alt=""
              width={46}
              height={46}
              className="mx-auto block opacity-35"
            />
            <p className="font-display t-display mt-5 text-xl leading-[1.3] text-k-ink">
              {upGreek(t("to_kalathi_einai_adeio"))}
            </p>
            <p className="mt-2.5 text-[13.5px] text-k-text-3">
              {stats.products.toLocaleString(locale)} {t("kodikoi_sas_perimenoyn_ston_katalogo")}
            </p>
            <Link
              href="/katalogos"
              className="t-btn-sm mt-5 inline-block bg-k-ink px-7 py-4 text-white transition-colors hover:bg-k-red"
            >
              {upGreek(t("ston_katalogo"))} →
            </Link>
          </div>
        ) : (
          <div className="shell-w bg-white lg:grid lg:grid-cols-[1fr_430px] lg:items-start">
            {/*
              `@container` — η λίστα στοιχίζεται από ΤΟ ΔΙΚΟ ΤΗΣ πλάτος.
              ──────────────────────────────────────────────────────────────
              Το `lg:` είναι breakpoint ΟΘΟΝΗΣ, και η λίστα δεν παίρνει την
              οθόνη: δίπλα της κάθεται η στήλη συνόψεως 430px. Σε παράθυρο
              1115px η γραμμή ήταν 669px, οι σταθερές στήλες ζητούσαν 572, και
              για το προϊόν έμεναν 17. Το όνομα, η τιμή και το σήμα έπεφταν το
              ένα πάνω στο άλλο — και το `lg:` έλεγε ότι όλα ήταν εντάξει,
              γιατί η οθόνη ΗΤΑΝ αρκετά φαρδιά· η στήλη δεν ήταν.

              Η κάρτα προϊόντος έχει ήδη την ίδια σημείωση για τον ίδιο λόγο.
            */}
            <div className="@container min-w-0 border-k-line lg:border-r">
              {/* Column headings — wide rows only; each narrow row labels itself. */}
              <div className="hidden grid-cols-[minmax(0,1fr)_110px_112px_104px_40px] gap-4 border-b border-k-ink px-5 py-3.5 @[600px]:grid @[900px]:grid-cols-[minmax(0,1fr)_150px_150px_140px_52px] @[900px]:gap-5 @[900px]:px-10 @[900px]:py-4">
                {[t("proion"), `${t("timi_monadas")} (${t("me_fpa_short")})`, t("posotita"), t("synolo"), ""].map((label, i) => (
                  <span
                    key={label || i}
                    className={`t-footer-col text-k-text-4 ${
                      i === 1 || i === 3 ? "text-right" : i === 2 ? "text-center" : ""
                    }`}
                  >
                    {upGreek(label)}
                  </span>
                ))}
              </div>

              {lines.map((line) => (
                <CartLineRow key={line.id} line={line} />
              ))}

              <QuickOrderPaste />
              <CartActionsRow />
              <CartCrossSell items={crossSell} />
            </div>

            <CartSummaryPanel
              totals={cart!.totals}
              shippingMethod={cart!.shippingMethod}
              paymentMethod={cart!.paymentMethod}
            />
          </div>
        )}
        <Zone id="cart.below" locale={locale} />
      </main>

      <SiteFooter categories={rootCategories} />
    </>
  );
}
