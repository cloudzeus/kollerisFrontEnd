import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getCart, getMiniCart } from "@/lib/cart/cart";
import {
  getCatalogueStats,
  getMenuTree,
  getRootCategories,
  getTopBrands,
} from "@/lib/catalog/queries";
import { formatMoney } from "@/lib/format";
import { upGreek } from "@/lib/greek";
import { isVivaConfigured } from "@/lib/payment/viva";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // Explicit locale: `setRequestLocale` belongs to the render pass, and
  // metadata is generated outside it.
  const t = await getTranslations({ locale, namespace: "checkout.page" });
  return {
    title: t("titlos_oloklirosi_paraggelias"),
    robots: { index: false, follow: false },
  };
}

/**
 * Checkout.
 *
 * Carries the full site chrome. The original spec called for a stripped header
 * to limit exits mid-funnel; the client asked for the normal header and footer
 * instead, so navigation stays available throughout. The step indicator sits in
 * its own band under the nav.
 */
export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const t = await getTranslations("checkout.page");
  const { locale } = await params;
  setRequestLocale(locale);

  const [cart, miniCart, menuTree, brands, stats, rootCategories] = await Promise.all([
    getCart(locale),
    getMiniCart(locale),
    getMenuTree(locale),
    getTopBrands(locale, 16),
    getCatalogueStats(),
    getRootCategories(locale),
  ]);

  // An empty cart has nothing to check out; bouncing back is kinder than an
  // empty form that fails on submit.
  if (!cart || cart.lines.length === 0) redirect("/kalathi");

  const totals = cart.totals;

  return (
    <>
      <SiteChrome
        locale={locale}
        cart={miniCart}
        categories={menuTree}
        brands={brands}
        stats={stats}
      />

      {/* Step indicator */}
      <div className="border-b border-k-line bg-k-surface-2">
        <div className="shell-x flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <ol className="flex">
            {[
              { n: "01", label: t("kalathi"), done: true },
              { n: "02", label: t("stoicheia"), active: true },
              { n: "03", label: t("pliromi") },
            ].map((step) => (
              <li
                key={step.n}
                className={`flex items-center gap-2 border px-3.5 py-2.5 text-[10.5px] font-semibold tracking-[0.07em] ${
                  step.active
                    ? "border-k-red bg-k-red text-white"
                    : step.done
                      ? "border-k-line-2 bg-white text-k-ink"
                      : "border-k-line-2 bg-white text-k-text-5"
                }`}
              >
                <span className="t-brand-count opacity-70">{step.done ? "✓" : step.n}</span>
                {step.label}
              </li>
            ))}
          </ol>

          <Link href="/kalathi" className="t-link-mono text-k-text-3 hover:text-k-red">
            ‹ {upGreek(t("piso_sto_kalathi"))}
          </Link>
        </div>
      </div>

      <main id="main" className="shell-w bg-white lg:grid lg:grid-cols-[1fr_460px] lg:items-start">
        <div className="min-w-0 border-k-line px-4 py-8 lg:border-r lg:px-10 lg:py-10">
          {!isVivaConfigured() && (
            <p className="mb-6 border-l-[3px] border-k-amber bg-k-surface-2 px-4 py-3 text-[12.5px] leading-[1.55] text-k-text-2">
              {t("i_pliromi_me_karta_den")}
            </p>
          )}

          <CheckoutForm
            locale={locale}
            postcode=""
            shippingMethod={cart.shippingMethod}
            paymentMethod={cart.paymentMethod}
          />
        </div>

        {/* Summary */}
        <aside className="lg:sticky lg:top-0">
          <div className="border-b border-k-line px-4 py-6 lg:px-8">
            <p className="t-footer-col mb-4 text-k-text-4">
              {upGreek(t("i_paraggelia_sas_proionta", { itemCount: totals.itemCount }))}
            </p>

            <div className="max-h-[280px] overflow-y-auto">
              {cart.lines.map((line) => (
                <div
                  key={line.id}
                  className="flex items-center gap-3 border-b border-k-line-3 py-3 last:border-0"
                >
                  <span className="relative flex h-[52px] w-[52px] shrink-0 items-center justify-center border border-k-line bg-k-surface-2 p-1">
                    {line.image && (
                      <Image
                        src={line.image}
                        alt=""
                        width={52}
                        height={52}
                        className="max-h-full max-w-full object-contain"
                      />
                    )}
                    <span className="rounded-pill absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center bg-k-ink px-1 font-mono text-[9.5px] font-semibold text-white">
                      {line.quantity}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="t-card-brand block text-k-red">
                      {line.brandName ?? "—"}
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px] font-semibold text-k-ink">
                      {line.name}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[13px] font-semibold text-k-ink">
                    {formatMoney(line.lineGross, locale)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="h-[7px] bg-[repeating-linear-gradient(135deg,#FF3333_0_9px,#1A1A1C_9px_18px)]" />
          <div className="bg-k-ink px-4 py-6 lg:px-8">
            <dl className="flex flex-col gap-2.5">
              {[
                { k: t("kathari_axia"), v: formatMoney(totals.subtotalNet, locale) },
                {
                  k: t("metaforika"),
                  v:
                    totals.shippingGross === 0
                      ? upGreek(t("dorean"))
                      : formatMoney(totals.shippingGross, locale),
                },
                { k: t("fpa"), v: formatMoney(totals.vatAmount, locale) },
              ].map((row) => (
                <div key={row.k} className="flex items-baseline justify-between gap-4">
                  <dt className="text-[12.5px] text-white/55">{row.k}</dt>
                  <dd className="font-mono text-[13px] font-medium text-white">{row.v}</dd>
                </div>
              ))}
            </dl>

            {totals.postage && (
              <p className="mt-2.5 text-[11px] leading-[1.5] text-white/45">
                {totals.postage.carrier} · {totals.postage.zoneLabel} ·{" "}
                {totals.postage.chargeableKg} kg
                {totals.postage.estimated && t("ektimisi")}
                {" — "}{t("oristikopoieitai_me_to_t_k")}
              </p>
            )}

            <div className="mt-4 flex items-end justify-between gap-4 border-t border-white/16 pt-4">
              <div>
                <p className="t-footer-col text-white/50">{upGreek(t("synolo"))}</p>
                <p className="t-account-label mt-1.5 text-white/40">{upGreek(t("me_fpa"))}</p>
              </div>
              <p className="font-mono text-[30px] leading-none font-semibold tracking-[-0.03em] text-white lg:text-[36px]">
                {formatMoney(totals.totalGross, locale)}
              </p>
            </div>
          </div>
        </aside>
      </main>

      <SiteFooter categories={rootCategories} />
    </>
  );
}
