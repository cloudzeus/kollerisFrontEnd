import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { SplitCheckoutProvider, SplitSummary } from "@/components/checkout/SplitCheckout";
import { checkoutBreakdown } from "@/lib/requests/checkout-breakdown";
import { getViewer } from "@/lib/account/session";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/i18n/routing";
import { computeTotals, getCart, getMiniCart, type VatMode } from "@/lib/cart/cart";
import {
  getCatalogueStats,
  getMenuTree,
  getRootCategories,
  getTopBrands,
} from "@/lib/catalog/queries";
import { formatMoney } from "@/lib/format";
import { countryName } from "@/lib/shipping/countries";
import { upGreek } from "@/lib/greek";
import { isVivaConfigured } from "@/lib/payment/viva";
import { splitCart } from "@/lib/requests/model";
import { readDestination } from "@/lib/shipping/destination-cookie";
import { allowedCountries, isDhlDestination, isEuSalesEnabled } from "@/lib/eu-sales/countries";
import { readEuBuyer } from "@/lib/eu-sales/buyer-cookie";
import { euSalesCopy } from "@/lib/eu-sales/copy";
import { resolveVatMode, summaryLineAmount } from "@/lib/eu-sales/vat-mode";
import type { DeliveryQuoteAnswer } from "@/lib/shipping/actions";

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

  /*
   * Delivery abroad (INTERNATIONAL_SHIPPING_ENABLED or EU_SALES_ENABLED): the
   * destination the form last priced, so the summary is priced for the same
   * place. Null with both flags off or for Greece — the page is then exactly
   * what it was.
   */
  const euSales = isEuSalesEnabled();
  const countries = allowedCountries();
  const international = countries.length > 1;
  const destination = international ? await readDestination() : null;
  /* EU sales: consumer or company, and the last VIES answer — display only. */
  const euBuyer = euSales ? await readEuBuyer() : null;

  const [cart, miniCart, menuTree, brands, stats, rootCategories, viewer] =
    await Promise.all([
      destination
        ? getCart(locale, destination.postcode, {
            country: destination.country,
            city: destination.city,
          })
        : getCart(locale),
      getMiniCart(locale),
      getMenuTree(locale),
      getTopBrands(locale),
      getCatalogueStats(),
      getRootCategories(locale),
      // Somebody with an account is not offered another one.
      getViewer(),
    ]);

  /*
   * What we already know about them.
   *
   * The account holds the name, the email and the phone; the default address
   * holds the rest. Read here rather than in the form so the fields render
   * filled on the first paint — a form that populates a beat later reads as a
   * glitch, and on a checkout it reads as one that lost your details.
   *
   * Null for a guest, which is most people, and the form is unchanged for them.
   */
  const defaultAddress = viewer.user
    ? await prisma.customerAddress.findFirst({
        where: { customerId: viewer.user.id },
        orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
      })
    : null;

  const prefill = viewer.user
    ? {
        // The recipient may differ from the account holder — a foreman, a
        // spouse — so the address's own name wins where it has one.
        firstName: defaultAddress?.firstName || viewer.user.firstName,
        lastName: defaultAddress?.lastName || viewer.user.lastName,
        email: viewer.user.email,
        phone: defaultAddress?.phone || viewer.user.phone || "",
        shipLine1: defaultAddress?.line1 ?? "",
        shipLine2: defaultAddress?.line2 ?? "",
        shipCity: defaultAddress?.city ?? "",
        shipPostcode: defaultAddress?.postcode ?? "",
        shipRegion: defaultAddress?.region ?? "",
        shipAdminRegion: defaultAddress?.adminRegion ?? "",
      }
    : null;

  // An empty cart has nothing to check out; bouncing back is kinder than an
  // empty form that fails on submit.
  if (!cart || cart.lines.length === 0) redirect("/kalathi");

  /*
   * EU sales to a DHL destination: DHL only, and net when this visit's VIES
   * answer is valid, today, for this country, for a company (`resolveVatMode`).
   * Display only — `placeOrder` asks VIES and DHL again and decides itself.
   */
  const euDestination = euSales && destination && isDhlDestination(destination.country) ? destination : null;
  const vatMode: VatMode =
    euDestination && euBuyer
      ? resolveVatMode({
          country: euDestination.country,
          customerType: euBuyer.customerType,
          vies: euBuyer.vies
            ? { status: euBuyer.vies.status, checkedAt: euBuyer.vies.checkedAt, country: euBuyer.vies.country }
            : null,
        })
      : "standard";
  const totals = euDestination
    ? await computeTotals(
        cart.lines,
        "dhl",
        cart.paymentMethod,
        euDestination.postcode,
        { country: euDestination.country, city: euDestination.city },
        { vatMode },
      )
    : cart.totals;
  const exempt = vatMode === "intra_eu_exempt";
  /*
   * A reload after a valid check: the summary stays net (the cookie's answer
   * still counts), so the VAT field shows that number and its ✓ again rather
   * than a bare prefix beside a VAT-free total.
   */
  const euVerified =
    exempt && euDestination && euBuyer?.vies
      ? { country: euDestination.country, vat: euBuyer.vies.vat, message: euSalesCopy(locale).valid(null) }
      : null;
  /* The form opens priced for the remembered destination. */
  const initialQuote: DeliveryQuoteAnswer | null = !destination
    ? null
    : totals.quoteUnavailable
      ? { status: "unavailable" }
      : totals.refusal
        ? { status: "refused", code: totals.refusal }
        : totals.unserviceable
          ? { status: "refused", code: "unserviceable" }
          : totals.postage
            ? {
                status: "ok",
                carrier: totals.destination?.carrier === "DHL" ? "DHL" : "ACS",
                netAmount: totals.shippingNet,
                grossAmount: totals.shippingGross,
                etaDays: totals.postage.etaDays,
                ...(totals.postage.deliveryBy ? { deliveryBy: totals.postage.deliveryBy } : {}),
              }
            : null;
  /* Back-order requests: shapes the form; the action decides again on submit. */
  const requestKind = splitCart(cart.lines).kind;
  /*
   * A cart with back-order lines: what each choice costs, priced here by the
   * same `computeTotals` `placeOrder` charges with — the in-stock lines alone
   * for «split», with their own postage and threshold. Null for an ordinary
   * cart, whose page is exactly what it was.
   */
  const breakdown = await checkoutBreakdown({
    lines: cart.lines,
    cartTotals: totals,
    // EU sales abroad: DHL only, and the VAT mode the summary uses.
    shippingMethod: euDestination ? "dhl" : cart.shippingMethod,
    paymentMethod: cart.paymentMethod,
    postcode: destination?.postcode ?? null,
    destination: destination ? { country: destination.country, city: destination.city } : undefined,
    ...(euDestination ? { vatMode } : {}),
  });

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
                <span className="t-brand-count opacity-70">
                  {step.done ? "✓" : step.n}
                </span>
                {step.label}
              </li>
            ))}
          </ol>

          <Link
            href="/kalathi"
            className="t-link-mono text-k-text-3 hover:text-k-red"
          >
            ‹ {upGreek(t("piso_sto_kalathi"))}
          </Link>
        </div>
      </div>

      <SplitCheckoutProvider breakdown={breakdown} locale={locale}>
      <main
        id="main"
        className="shell-w bg-white lg:grid lg:grid-cols-[1fr_460px] lg:items-start"
      >
        <div className="min-w-0 border-k-line px-4 py-8 lg:border-r lg:px-10 lg:py-10">
          {!isVivaConfigured() && (
            <p className="mb-6 border-l-[3px] border-k-amber bg-k-surface-2 px-4 py-3 text-[12.5px] leading-[1.55] text-k-text-2">
              {t("i_pliromi_me_karta_den")}
            </p>
          )}

          {/*
            A way in, for somebody who has an account and is about to retype
            everything in it. Not a wall — the form below still works for a
            guest, and always will.
          */}
          {!viewer.user && (
            <p className="mb-6 border-l-[3px] border-k-line-2 bg-k-surface-2 px-4 py-3 text-[12.5px] leading-[1.55] text-k-text-2">
              Έχετε λογαριασμό;{" "}
              <Link
                href={{
                  pathname: "/eisodos",
                  query: { redirectTo: "/checkout" },
                }}
                className="text-k-ink underline-offset-2 hover:underline"
              >
                Συνδεθείτε
              </Link>{" "}
              και τα στοιχεία σας συμπληρώνονται μόνα τους.
            </p>
          )}

          <CheckoutForm
            locale={locale}
            postcode=""
            prefill={prefill}
            signedIn={viewer.user != null}
            shippingMethod={cart.shippingMethod}
            paymentMethod={cart.paymentMethod}
            requestKind={requestKind}
            international={international}
            destination={destination}
            initialQuote={initialQuote}
            {...(euSales
              ? { euSales, countries, euCustomerType: euBuyer?.customerType ?? null, euVerified, displayedVatMode: vatMode }
              : {})}
          />
        </div>

        {/* Summary */}
        <aside className="lg:sticky lg:top-0">
          {breakdown ? (
            /* Back-order lines: grouped, «Πληρωτέο τώρα» apart from «Σε αίτημα». */
            <SplitSummary
              locale={locale}
              lines={cart.lines.map((line) => ({
                id: line.id,
                name: line.name,
                brandName: line.brandName,
                image: line.image,
                quantity: line.quantity,
                lineGross: summaryLineAmount(line, vatMode),
              }))}
              postage={totals.postage?.carrier ?? null}
              exempt={exempt}
            />
          ) : (
          <>
          <div className="border-b border-k-line px-4 py-6 lg:px-8">
            <p className="t-footer-col mb-4 text-k-text-4">
              {upGreek(
                t("i_paraggelia_sas_proionta", { itemCount: totals.itemCount }),
              )}
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
                    {formatMoney(summaryLineAmount(line, vatMode), locale)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="h-[7px] bg-[repeating-linear-gradient(135deg,#FF3333_0_9px,#1A1A1C_9px_18px)]" />
          <div className="bg-k-ink px-4 py-6 lg:px-8">
            <dl className="flex flex-col gap-2.5">
              {[
                {
                  k: t("kathari_axia"),
                  v: formatMoney(totals.subtotalNet, locale),
                },
                {
                  k: t("metaforika"),
                  v: totals.quoteUnavailable
                    ? "—"
                    : totals.shippingGross === 0
                      ? upGreek(t("dorean"))
                      : formatMoney(totals.shippingGross, locale),
                },
                { k: t("fpa"), v: formatMoney(totals.vatAmount, locale) },
              ].map((row) => (
                <div
                  key={row.k}
                  className="flex items-baseline justify-between gap-4"
                >
                  <dt className="text-[12.5px] text-white/55">{row.k}</dt>
                  <dd className="font-mono text-[13px] font-medium text-white">
                    {row.v}
                  </dd>
                </div>
              ))}
            </dl>

            {totals.postage && totals.postage.carrier === "DHL" ? (
              <p className="mt-2.5 text-[11px] leading-[1.5] text-white/45">
                {t("dhl_line", {
                  eta: totals.postage.etaDays,
                  country: countryName(totals.destination?.country, locale),
                })}{" "}
                · {totals.postage.chargeableKg} kg
                {totals.postage.estimated && t("ektimisi")}
              </p>
            ) : totals.postage ? (
              <p className="mt-2.5 text-[11px] leading-[1.5] text-white/45">
                {totals.postage.carrier} · {totals.postage.zoneLabel} ·{" "}
                {totals.postage.chargeableKg} kg
                {totals.postage.estimated && t("ektimisi")}
                {" — "}
                {t("oristikopoieitai_me_to_t_k")}
              </p>
            ) : null}
            {totals.quoteUnavailable && (
              <p className="mt-2.5 text-[11px] leading-[1.5] text-white/70">
                {t("quote_unavailable")}
              </p>
            )}
            {exempt && (
              <p className="mt-2.5 leading-normal text-white/80" style={{ fontSize: "var(--fs-11-5)" }}>
                {t("eu_exempt_note")}
              </p>
            )}

            <div className="mt-4 flex items-end justify-between gap-4 border-t border-white/16 pt-4">
              <div>
                <p className="t-footer-col text-white/50">
                  {upGreek(t("synolo"))}
                </p>
                <p className="t-account-label mt-1.5 text-white/40">
                  {upGreek(exempt ? t("choris_fpa") : t("me_fpa"))}
                </p>
              </div>
              <p className="font-mono text-[30px] leading-none font-semibold tracking-[-0.03em] text-white lg:text-[36px]">
                {formatMoney(totals.totalGross, locale)}
              </p>
            </div>
          </div>
          </>
          )}
        </aside>
      </main>
      </SplitCheckoutProvider>

      <SiteFooter categories={rootCategories} />
    </>
  );
}
