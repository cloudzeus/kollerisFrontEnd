"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef, useState, useTransition } from "react";
import { CompanyVatFields } from "@/components/account/CompanyVatFields";
import { placeOrder, type CheckoutState } from "@/lib/checkout/actions";
import { DHL_SHIPPING_METHOD, PAYMENT_METHODS, SHIPPING_METHODS, shippingMethodsFor } from "@/lib/cart/options";
import { setCartOptions } from "@/lib/cart/actions";
import { AddressAutocomplete } from "@/components/checkout/AddressAutocomplete";
import { STOCK_HOLD_HOURS } from "@/lib/orders/hold";
import { upGreek } from "@/lib/greek";
import { checkDeliveryPostcode, quoteDelivery, type DeliveryQuoteAnswer } from "@/lib/shipping/actions";
import { foreignCountryIn, validatePostcode } from "@/lib/shipping/destination";
import { countryOptions, postcodeExample, validateCountryPostcode } from "@/lib/shipping/countries";
import { formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/routing";
import type { CartSplitKind, RequestMode } from "@/lib/requests/model";
import { useSplitCheckout } from "@/components/checkout/SplitCheckout";
import { EuBuyerFields } from "@/components/checkout/EuBuyerFields";
import { countryOptionsFor, isDhlDestination } from "@/lib/eu-sales/countries";
import { setCustomerTypeAction } from "@/lib/eu-sales/check-vat-action";
import type { CustomerType } from "@/lib/eu-sales/vat-mode";

/**
 * Checkout form.
 *
 * A single `<form>` posting to one server action, so it works without
 * JavaScript. The client parts are only the two disclosures — invoice fields
 * and card notice — and the submit-disabled-until-terms affordance. Every rule
 * they express is enforced again in the action, because a hidden field is not
 * a validation.
 */
export function CheckoutForm({
  locale,
  postcode,
  isPartner = false,
  signedIn = false,
  prefill,
  shippingMethod,
  paymentMethod,
  requestKind = "none",
  international = false,
  destination = null,
  initialQuote = null,
  euSales = false,
  countries,
  euCustomerType = null,
  displayedVatMode = "standard",
}: {
  locale: string;
  postcode: string;
  isPartner?: boolean;
  /** Somebody with an account does not need to be offered one. */
  signedIn?: boolean;
  /**
   * What we already know about a signed-in customer.
   *
   * Their name and email come from the account; the address from whichever one
   * they marked as default. Prefilled rather than locked: the account holder is
   * not always the recipient — a site foreman, a spouse, a different branch —
   * and a checkout that cannot be corrected is a checkout somebody abandons.
   */
  prefill?: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    shipLine1: string;
    shipLine2: string;
    shipCity: string;
    shipPostcode: string;
    shipRegion: string;
    shipAdminRegion: string;
  } | null;
  /** What the basket page already recorded. Seeds the controls below. */
  shippingMethod: string;
  paymentMethod: string;
  /**
   * Back-order requests (docs/backorder-requests.md), from the cart as the page
   * rendered it. «all»: nothing to pay, the submit sends a request. «mixed»:
   * the customer must choose split or together. The action re-reads the stock
   * and decides again — this only shapes the form.
   */
  requestKind?: CartSplitKind;
  /**
   * INTERNATIONAL_SHIPPING_ENABLED, read by the page (docs/dhl-express.md §4).
   * Off: no country field, Greece only — the form exactly as it was.
   */
  international?: boolean;
  /** The destination abroad remembered from this visit (`destination-cookie`). */
  destination?: { country: string; postcode: string; city: string } | null;
  /** The page's own quote for `destination`, so the form opens priced. */
  initialQuote?: DeliveryQuoteAnswer | null;
  /**
   * EU_SALES_ENABLED, read by the page (intra-EU sales design §3). Off: the
   * form exactly as it was. On: a DHL destination gets «Ιδιώτης / Εταιρεία»
   * with the VIES check instead of «Θέλω τιμολόγιο», DHL only, and a plain
   * address with no suggestions.
   */
  euSales?: boolean;
  /** The countries on offer (`allowedCountries`), read with `euSales` only. */
  countries?: readonly string[];
  /** The consumer/company choice remembered from this visit. */
  euCustomerType?: CustomerType | null;
  /** The VAT mode the summary beside the form shows — posted back as a hint (R11-I2). */
  displayedVatMode?: "standard" | "intra_eu_exempt";
}) {
  const t = useTranslations("checkout.CheckoutForm");
  const [state, action, pending] = useActionState<CheckoutState, FormData>(placeOrder, {});
  const [wantsInvoice, setWantsInvoice] = useState(false);
  /*
   * Seeded from the cart, not from a hardcoded default.
   *
   * These used to start at "courier" and "card" whatever the customer had
   * chosen one page earlier, so picking bank transfer in the basket and
   * arriving here showed card again. It read as the site changing its mind.
   */
  const [shipping, setShipping] = useState<string>(shippingMethod);
  const [payment, setPayment] = useState<string>(paymentMethod);
  const [terms, setTerms] = useState(false);
  /*
   * Shared with the summary beside the form (`SplitCheckoutProvider`), which
   * follows the choice; a local fallback keeps the form whole without it.
   */
  const split = useSplitCheckout();
  const [localMode, setLocalMode] = useState<RequestMode | null>(null);
  const requestMode = split ? split.mode : localMode;
  const setRequestMode = split ? split.setMode : setLocalMode;
  const breakdown = split?.breakdown ?? null;
  /* Nothing is paid now: the whole cart, or everything by choice, is a request. */
  const requestOnly = requestKind === "all" || (requestKind === "mixed" && requestMode === "together");
  const modeMissing = requestKind === "mixed" && requestMode == null;
  const [, startTransition] = useTransition();

  /* The Greek Τ.Κ. last sent to ACS — also what a split cart is priced for. */
  const askedPostcode = useRef<string | null>(null);

  /*
   * Written back to the cart on every change.
   *
   * The order summary beside this form is server-rendered from the cart row, so
   * without this the two disagree: the form says "collect from the shop" and
   * the panel next to it still charges for a courier. Persisting re-renders the
   * summary from the same source the action prices against.
   */
  const remember = (patch: { shippingMethod?: string; paymentMethod?: string }) => {
    startTransition(async () => {
      await setCartOptions(patch);
    });
    // The split card and the pay button follow: priced again for the Τ.Κ. typed.
    if (askedPostcode.current && !abroad) {
      split?.requote({
        postcode: askedPostcode.current,
        shippingMethod: patch.shippingMethod ?? shipping,
        paymentMethod: patch.paymentMethod ?? payment,
      });
    }
  };

  const payments = PAYMENT_METHODS.filter((m) => !m.partnerOnly || isPartner);

  /*
   * The delivery country (flag on only). Greece and Cyprus: ACS, as before.
   * Elsewhere in the EU: DHL Express, priced by HDCtool through
   * `quoteDelivery` while the customer types. The action asks again and
   * charges its own answer; this only shows it.
   */
  const [country, setCountry] = useState<string>(
    international && destination ? destination.country : "GR",
  );
  const abroad = international && country !== "GR";
  /* EU sales to a DHL destination: consumer/company, VIES, DHL only. */
  const euBuyer = euSales && isDhlDestination(country);
  const [customerType, setCustomerType] = useState<CustomerType | null>(euCustomerType);
  const methodsFor = (c: string) =>
    euSales && isDhlDestination(c) ? [DHL_SHIPPING_METHOD] : shippingMethodsFor(c);
  const methods = euBuyer ? [DHL_SHIPPING_METHOD] : international ? shippingMethodsFor(country) : SHIPPING_METHODS;
  /* A choice that does not fit the country (ACS Express to Italy) falls to the first that does. */
  const chosen = methods.some((m) => m.id === shipping) ? shipping : methods[0].id;
  const [quote, setQuote] = useState<DeliveryQuoteAnswer | { status: "loading" } | null>(
    abroad ? initialQuote : null,
  );
  const askedQuote = useRef<string | null>(
    abroad && destination ? `${destination.country}|${destination.postcode}|${destination.city}` : null,
  );
  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const askQuote = (data: Record<string, string>) => {
    if (!international) return;
    const c = data.shipCountry || "GR";
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    if (c === "GR") {
      if (askedQuote.current !== null) {
        askedQuote.current = null;
        setQuote(null);
        // Forget the destination so the summary prices Greece again.
        startTransition(async () => {
          await quoteDelivery({ country: "GR", postcode: "" });
        });
      }
      return;
    }
    const checked = validateCountryPostcode(c, data.shipPostcode ?? "");
    const city = (data.shipCity ?? "").trim();
    if (!checked.ok) {
      askedQuote.current = null;
      setQuote(null);
      return;
    }
    const key = `${c}|${checked.postcode}|${city}`;
    if (key === askedQuote.current) return;
    quoteTimer.current = setTimeout(() => {
      askedQuote.current = key;
      setQuote({ status: "loading" });
      startTransition(async () => {
        const answer = await quoteDelivery({ country: c, postcode: checked.postcode, city, locale });
        // A slower answer for a destination since replaced is not this one's.
        if (askedQuote.current !== key) return;
        setQuote(answer);
      });
    }, 500);
  };

  /*
   * Greece only — the same checks the action makes (lib/shipping/destination),
   * run here so the customer hears it while typing rather than after submit.
   * The postcode's shape locally, then ACS for whether it has a station there
   * (a foreign 37015 looks Greek); the street, city and regions for a foreign
   * country's name. The server stays the authority.
   */
  const [values, setValues] = useState<Record<string, string>>({});
  const [refusedPostcode, setRefusedPostcode] = useState<string | null>(null);
  const postcodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const askAcs = (raw: string) => {
    const checked = validatePostcode(raw);
    if (postcodeTimer.current) clearTimeout(postcodeTimer.current);
    if (!checked.ok || checked.postcode === askedPostcode.current) return;
    postcodeTimer.current = setTimeout(() => {
      const asked = checked.postcode;
      askedPostcode.current = asked;
      startTransition(async () => {
        const { serviceable } = await checkDeliveryPostcode({ postcode: asked });
        // A slower answer for a postcode since replaced is not this one's.
        if (askedPostcode.current !== asked) return;
        setRefusedPostcode(serviceable ? null : asked);
        // A split cart: what is paid now, priced for this Τ.Κ.
        if (serviceable) split?.requote({ postcode: asked, shippingMethod: chosen, paymentMethod: payment });
      });
    }, 400);
  };

  const addressValue = (name: keyof NonNullable<typeof prefill>): string => {
    if (values[name] !== undefined) return values[name];
    if (name === "shipPostcode") return (abroad && destination?.postcode) || prefill?.shipPostcode || postcode;
    if (name === "shipCity" && abroad && destination?.city) return destination.city;
    return prefill?.[name] ?? "";
  };
  const addressErrors: Record<string, string> = {};
  let quoteBlocked = false;
  if (chosen !== "pickup" && !abroad) {
    const zip = addressValue("shipPostcode").trim();
    const checked = validatePostcode(zip);
    const complete = zip.replace(/\s/g, "").length >= 5 || /[^\d\s]/.test(zip);
    if ((!checked.ok && complete) || (checked.ok && checked.postcode === refusedPostcode)) {
      addressErrors.shipPostcode = international ? t("tk_unserviceable_eu") : t("tk_unserviceable");
    }
    for (const name of ["shipLine1", "shipLine2", "shipCity", "shipRegion", "shipAdminRegion"] as const) {
      if (foreignCountryIn(addressValue(name))) {
        addressErrors[name] = international ? t("address_foreign_eu") : t("address_foreign");
      }
    }
  }
  if (chosen !== "pickup" && abroad) {
    const zip = addressValue("shipPostcode").trim();
    const example = postcodeExample(country);
    const checked = validateCountryPostcode(country, zip);
    if (!checked.ok && zip.replace(/[\s-]/g, "").length >= example.replace(/[\s-]/g, "").length) {
      addressErrors.shipPostcode = t("postcode_format", { example });
    } else if (quote?.status === "refused") {
      addressErrors.shipPostcode = t(`refused_${quote.code}`);
    } else if (quote?.status === "unavailable") {
      addressErrors.quote = t("quote_unavailable");
    }
    // Nothing is placed abroad without a price HDCtool gave.
    quoteBlocked = quote?.status !== "ok";
  }
  const blocked = Object.values(addressErrors)[0] ?? null;

  /* The split card and the pay button: the server's figures, never re-added here. */
  const money = (n: number) => formatMoney(n, locale as Locale);
  const items = (count: number) => (count === 1 ? t("items_one") : t("items_other", { count }));
  const splitNow = breakdown?.split?.now ?? null;
  const splitRequest = breakdown?.split?.request ?? null;
  const together = breakdown?.together ?? null;
  const splitPayNow = requestKind === "mixed" && requestMode === "split" && splitNow ? splitNow.totalGross : null;
  const fieldError = (name: string) => addressErrors[name] ?? state.fieldErrors?.[name];

  return (
    <form
      action={action}
      className="flex flex-col gap-8"
      data-eu-sales={euSales ? "" : undefined}
      onChange={(e) => {
        const target = e.target as unknown as HTMLInputElement;
        const data = new FormData(e.currentTarget);
        const next: Record<string, string> = {};
        for (const [k, v] of data.entries()) if (typeof v === "string") next[k] = v;
        if (target.name === "shipPostcode" && (next.shipCountry ?? "GR") === "GR") askAcs(target.value);
        if (["shipCountry", "shipPostcode", "shipCity"].includes(target.name)) askQuote(next);
        setValues(next);
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      {/* What the summary showed. The server never prices from it; it only
          refuses to charge VAT the customer was not shown (R11-I2). */}
      {euBuyer && <input type="hidden" name="vatModeHint" value={displayedVatMode} />}

      {state.error && (
        <p
          role="alert"
          className="border-l-[3px] border-k-red bg-k-red/8 px-4 py-3 text-[13px] text-k-ink"
        >
          {state.error}
        </p>
      )}

      {requestKind === "mixed" && (
        <Step n="00" title={t("request_mode_title")}>
          <p className="mb-3 text-[12.5px] leading-[1.55] text-k-text-2">{t("request_mode_intro")}</p>
          <div className="flex flex-col gap-px border border-k-line bg-k-line">
            {(["split", "together"] as const).map((mode) => (
              <label
                key={mode}
                className={`flex cursor-pointer items-start gap-3 px-4 py-3.5 ${
                  requestMode === mode ? "bg-k-surface-2" : "bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="requestMode"
                  value={mode}
                  required
                  checked={requestMode === mode}
                  onChange={() => setRequestMode(mode)}
                  className="mt-0.5 h-4 w-4 accent-k-red"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold text-k-ink">
                    {mode === "split" ? t("request_mode_split") : t("request_mode_together")}
                  </span>
                  {mode === "split" && splitNow && splitRequest ? (
                    <>
                      {/* Server-priced: the in-stock lines alone, with their own postage. */}
                      <span className="mt-1.5 block text-[12px] leading-[1.5] text-k-ink">
                        {/* The method the figures were priced for, not the radio a beat ahead of them. */}
                        {breakdown?.shippingMethod === "pickup"
                          ? t("split_now_pickup", { total: money(splitNow.totalGross), items: items(splitNow.itemCount) })
                          : // Free delivery is a Greek promise: never «δωρεάν» abroad.
                            splitNow.shippingGross === 0 && !splitNow.unserviceable && !abroad
                            ? t("split_now_free", { total: money(splitNow.totalGross), items: items(splitNow.itemCount) })
                            : t("split_now", {
                                total: money(splitNow.totalGross),
                                items: items(splitNow.itemCount),
                                shipping: splitNow.unserviceable ? "—" : money(splitNow.shippingGross),
                              })}
                      </span>
                      {splitNow.thresholdLost && (
                        <span className="mt-0.5 block text-[11.5px] leading-[1.5] text-k-text-3">
                          {t("split_threshold_lost")}
                        </span>
                      )}
                      {breakdown?.shippingMethod !== "pickup" && !breakdown?.postcode && (
                        <span className="mt-0.5 block text-[11px] leading-[1.5] text-k-text-4">
                          {t("split_postage_note")}
                        </span>
                      )}
                      <span className="mt-1.5 block text-[11.5px] leading-[1.5] text-k-text-3">
                        {t("split_request", {
                          items: items(splitRequest.itemCount),
                          value: money(splitRequest.subtotalGross),
                        })}
                      </span>
                    </>
                  ) : mode === "together" && together ? (
                    <span className="mt-1.5 block text-[12px] leading-[1.5] text-k-ink">
                      {t("together_line", { items: items(together.itemCount), value: money(together.subtotalGross) })}
                    </span>
                  ) : (
                    <span className="mt-0.5 block text-[11.5px] leading-[1.5] text-k-text-4">
                      {mode === "split" ? t("request_mode_split_help") : t("request_mode_together_help")}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
          {state.fieldErrors?.requestMode && (
            <p className="mt-1.5 text-[11.5px] text-k-red">{t("request_mode_required")}</p>
          )}
        </Step>
      )}

      <Step n="01" title={t("stoicheia_epikoinonias")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("onoma")} name="firstName" defaultValue={prefill?.firstName} error={state.fieldErrors?.firstName} required />
          <Field label={t("eponymo")} name="lastName" defaultValue={prefill?.lastName} error={state.fieldErrors?.lastName} required />
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={prefill?.email}
            error={state.fieldErrors?.email}
            required
          />
          <Field
            label={t("kinito")}
            name="phone"
            type="tel"
            autoComplete="tel"
            defaultValue={prefill?.phone}
            error={state.fieldErrors?.phone}
            help={abroad ? t("phone_intl_help") : undefined}
            required
          />
        </div>
      </Step>

      <Step n="02" title={t("dieythynsi_paradosis")}>
        {/*
          Street and floor on one row, the four locality fields on the next —
          the same shape as the account's address book, because it is the same
          address. Two forms that ask for one thing in two arrangements make the
          second one feel like a different question.
        */}
        {international && (
          <label className="mb-4 block">
            <span className="t-account-label mb-1.5 block text-k-text-4">
              {upGreek(t("chora"))}
              <span className="ml-1 text-k-red">*</span>
            </span>
            <select
              name="shipCountry"
              value={country}
              autoComplete="country"
              onChange={(e) => {
                const next = e.target.value;
                setCountry(next);
                const offered = methodsFor(next);
                if (!offered.some((m) => m.id === shipping)) {
                  setShipping(offered[0].id);
                  remember({ shippingMethod: offered[0].id });
                }
                /* A VIES answer is for one country: forget it, and the summary
                   charges VAT again until the new number is checked. */
                if (euSales && customerType) {
                  startTransition(async () => {
                    await setCustomerTypeAction({ customerType });
                  });
                }
              }}
              aria-invalid={state.fieldErrors?.shipCountry ? true : undefined}
              className="t-input h-12 w-full border border-k-line-2 bg-white px-3.5 text-k-ink outline-none focus:border-k-ink"
            >
              {(euSales && countries ? countryOptionsFor(countries, locale) : countryOptions(locale)).map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </select>
            {state.fieldErrors?.shipCountry && (
              <span className="mt-1 block text-[11px] text-k-red">{state.fieldErrors.shipCountry}</span>
            )}
          </label>
        )}

        <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          {/* Suggestions fill the postcode as well, which is the field that
              decides the ACS zone and the one customers most often get wrong. */}
          {euBuyer ? (
            /* Abroad with EU sales: no address suggestions (MapTiler is Greek). */
            <Field
              label={t("odos_kai_arithmos")}
              name="shipLine1"
              autoComplete="address-line1"
              defaultValue={prefill?.shipLine1}
              error={fieldError("shipLine1")}
              required
            />
          ) : (
            <AddressAutocomplete
              label={t("odos_kai_arithmos")}
              name="shipLine1"
              defaultValue={prefill?.shipLine1}
              error={fieldError("shipLine1")}
              required
            />
          )}
          <Field label={t("orofos_koydoyni")} name="shipLine2" defaultValue={prefill?.shipLine2} autoComplete="address-line2" error={fieldError("shipLine2")} invalid={addressErrors.shipLine2} />
        </div>

        {/* Νομός and περιφέρεια are two administrative levels, so one field
            could only ever hold one of them. Both are filled by a suggestion. */}
        <div
          className={
            euBuyer
              ? "mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
              : "mt-4 grid gap-4 sm:grid-cols-[110px_minmax(0,1fr)] lg:grid-cols-[110px_repeat(3,minmax(0,1fr))]"
          }
        >
          <Field
            label={t("t_k")}
            name="shipPostcode"
            autoComplete="postal-code"
            defaultValue={addressValue("shipPostcode")}
            error={fieldError("shipPostcode")}
            invalid={addressErrors.shipPostcode}
            required
            help={
              abroad
                ? t("postcode_help_abroad", { example: postcodeExample(country) })
                : t("kathorizei_ti_zoni_acs_kai")
            }
          />
          <Field
            label={t("poli")}
            name="shipCity"
            autoComplete="address-level2"
            defaultValue={addressValue("shipCity")}
            error={fieldError("shipCity")}
            invalid={addressErrors.shipCity}
            required
          />
          {/* Νομός and περιφέρεια are Greek administrative levels: not asked abroad with EU sales. */}
          {!euBuyer && (
            <>
              <Field label={t("nomos")} name="shipRegion" defaultValue={prefill?.shipRegion} autoComplete="address-level1" error={fieldError("shipRegion")} invalid={addressErrors.shipRegion} />
              <Field label={t("perifereia")} name="shipAdminRegion" defaultValue={prefill?.shipAdminRegion} error={fieldError("shipAdminRegion")} invalid={addressErrors.shipAdminRegion} />
            </>
          )}
        </div>
        <p className="mt-2.5 text-[11.5px] font-semibold text-k-text-3">
          {international
            ? euSales && countries && !countries.includes("CY")
              ? t("ship_zone_eu_sales")
              : t("ship_zone_eu")
            : t("ship_zone")}
        </p>

        {euBuyer ? (
          <EuBuyerFields
            key={country}
            country={country}
            locale={locale}
            type={customerType}
            onTypeChange={setCustomerType}
            fieldErrors={state.fieldErrors}
          />
        ) : (
        <>
        <label className="mt-5 flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            name="wantsInvoice"
            checked={wantsInvoice}
            onChange={(e) => setWantsInvoice(e.target.checked)}
            className="h-4 w-4 accent-k-red"
          />
          <span className="text-[13px] font-semibold text-k-ink">
            {t("thelo_timologio_chreiazontai_afm_kai")}
          </span>
        </label>

        {wantsInvoice && (
          <div className="mt-4 border-l-[3px] border-k-red bg-k-surface-2 p-4">
            {/* ΑΦΜ drives the rest: HDCtool resolves it against its own
                customers, then SoftOne, then the AADE registry. */}
            <CompanyVatFields required fieldErrors={state.fieldErrors} />
          </div>
        )}
        </>
        )}
      </Step>

      <Step n="03" title={t("tropos_apostolis")}>
        <div className="flex flex-col gap-px border border-k-line bg-k-line">
          {methods.map((method) => (
            <label
              key={method.id}
              className={`flex cursor-pointer items-center gap-3 px-4 py-3.5 ${
                chosen === method.id ? "bg-k-surface-2" : "bg-white"
              }`}
            >
              <input
                type="radio"
                name="shippingMethod"
                value={method.id}
                checked={chosen === method.id}
                onChange={() => {
                  setShipping(method.id);
                  remember({ shippingMethod: method.id });
                }}
                className="h-4 w-4 accent-k-red"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold text-k-ink">
                  {method.label}
                </span>
                <span className="mt-0.5 block text-[11.5px] text-k-text-4">
                  {abroad && method.id !== "pickup"
                    ? quote?.status === "ok"
                      ? method.id === "dhl"
                        ? euSales && quote.deliveryBy
                          ? t("dhl_meta_by", { date: deliveryDate(quote.deliveryBy, locale) })
                          : t("dhl_meta", { eta: quote.etaDays })
                        : method.meta
                      : quote?.status === "loading"
                        ? t("quoting")
                        : quote?.status === "unavailable"
                          ? t("quote_unavailable")
                          : method.id === "dhl"
                            ? t("dhl_needs_postcode")
                            : method.meta
                    : method.meta}
                </span>
              </span>
              {abroad && method.id !== "pickup" && quote?.status === "ok" && (
                <span className="font-mono text-[13px] font-semibold whitespace-nowrap text-k-ink">
                  {formatMoney(quote.grossAmount, locale as Locale)}
                </span>
              )}
            </label>
          ))}
        </div>
        <p className="mt-2.5 text-[11.5px] text-k-text-4">
          {abroad ? t("cost_abroad") : t("to_kostos_ypologizetai_apo_to")}
        </p>
      </Step>

      {requestOnly ? (
        <p className="border-l-[3px] border-k-amber bg-k-surface-2 px-4 py-3 text-[12.5px] leading-[1.55] text-k-text-2">
          {t("request_all_note")}
        </p>
      ) : (
      <Step n="04" title={t("tropos_pliromis")}>
        <div className="flex flex-wrap gap-2">
          {payments.map((method) => (
            <label
              key={method.id}
              className={`flex cursor-pointer items-center gap-2 border px-3.5 py-2.5 text-[12px] font-semibold transition-colors ${
                payment === method.id
                  ? "border-k-ink bg-k-ink text-white"
                  : "border-k-line-2 text-k-text-2 hover:border-k-ink"
              }`}
            >
              <input
                type="radio"
                name="paymentMethod"
                value={method.id}
                checked={payment === method.id}
                onChange={() => {
                  setPayment(method.id);
                  remember({ paymentMethod: method.id });
                }}
                className="sr-only"
              />
              {method.label}
            </label>
          ))}
        </div>

        {(payment === "card" || payment === "iris") && (
          <p className="mt-3 border-l-[3px] border-k-ink bg-k-surface-2 px-4 py-3 text-[12px] leading-[1.55] text-k-text-2">
            {t("tha_metafertheite_stin_asfali_selida")}
          </p>
        )}
        {payment === "bank" && (
          <p className="mt-3 border-l-[3px] border-k-ink bg-k-surface-2 px-4 py-3 text-[12px] leading-[1.55] text-k-text-2">
            {/* The number comes from the constant the checkout enforces, not
                from the sentence. A hardcoded «3 ώρες» here is a promise that
                keeps being made after somebody changes the policy. */}
            {t("tha_lavete_ta_stoicheia_katathesis", { hours: STOCK_HOLD_HOURS })}
          </p>
        )}
      </Step>
      )}

      {/*
        An account, offered rather than imposed.
        ─────────────────────────────────────────────────────────────────────
        Everything a registration needs has already been typed a few fields
        above. What was missing was consent and a password, and this is both —
        one optional box. Left empty, the order stays a guest order and nothing
        is created; a link can still be requested later from /eisodos.

        Not shown to somebody already signed in: they have an account.
      */}
      {!signedIn && (
        <Step n="04b" title={upGreek(t("logariasmos_proairetika"))}>
          <label className="block">
            <span className="t-account-label mb-1.5 block text-k-text-4">
              {upGreek(t("kodikos_prosvasis"))}
            </span>
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              minLength={8}
              placeholder={t("toylachiston_8_charaktires")}
              className="t-input w-full border border-k-line-2 px-3.5 py-3 text-k-ink outline-none focus:border-k-ink"
            />
            <span className="mt-1.5 block text-[12px] leading-[1.5] text-k-text-3">
              {t("symplirose_kodiko_gia_logariasmo")}
            </span>
          </label>
        </Step>
      )}

      <Step n="05" title={t("scholia_kai_oloklirosi")}>
        <label className="block">
          <span className="t-account-label mb-1.5 block text-k-text-4">
            {upGreek(t("scholia_paraggelias"))}
          </span>
          <textarea
            name="notes"
            rows={3}
            placeholder={t("odigies_paradosis_ores_paralavis")}
            className="t-input w-full border border-k-line-2 px-3.5 py-3 text-k-ink outline-none focus:border-k-ink"
          />
        </label>

        <label className="mt-4 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="terms"
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-k-red"
          />
          <span className="text-[12.5px] leading-[1.55] text-k-text-2">
            {t("apodechomai_toys_oroys_chrisis_kai")}
          </span>
        </label>
        {state.fieldErrors?.terms && (
          <p className="mt-1.5 text-[11.5px] text-k-red">{t("apaiteitai_apodochi_ton_oron")}</p>
        )}

        <button
          type="submit"
          disabled={!terms || pending || blocked != null || modeMissing || quoteBlocked}
          className="t-btn mt-6 flex h-14 w-full items-center justify-center bg-k-red text-white transition-colors hover:bg-k-red-hover disabled:opacity-50"
        >
          {pending
            ? upGreek(t("ginetai_katachorisi"))
            : requestOnly
              ? `${upGreek(t("apostoli_aitimatos"))} →`
              : splitPayNow != null
                ? payment === "card" || payment === "iris"
                  ? `${upGreek(t("pay_now_button", { amount: money(splitPayNow) }))} →`
                  : `${upGreek(t("order_now_button", { amount: money(splitPayNow) }))} →`
              : payment === "card" || payment === "iris"
              ? `${upGreek(t("pliromi_me_asfaleia"))} →`
              : `${upGreek(t("oloklirosi_paraggelias"))} →`}
        </button>
        {blocked && (
          <p role="alert" className="mt-2 text-[11.5px] text-k-red">
            {blocked}
          </p>
        )}
      </Step>
    </form>
  );
}

/** «30 Οκτ» — DHL's delivery day, in the customer's language. */
function deliveryDate(isoDay: string, locale: string): string {
  const date = new Date(`${isoDay}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDay;
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale === "it" ? "it-IT" : "el-GR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Europe/Athens",
  }).format(date);
}

function Step({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-4 flex items-center gap-3">
        <span className="t-cat-num text-k-red">{n}</span>
        <span className="text-[13px] font-bold tracking-[0.06em] text-k-ink">
          {upGreek(title)}
        </span>
      </h2>
      {children}
    </section>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  autoComplete,
  defaultValue,
  error,
  help,
  invalid,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  defaultValue?: string;
  error?: string;
  help?: string;
  /** A client-side verdict the browser enforces too, as the input's custom validity. */
  invalid?: string;
}) {
  return (
    <label className="block">
      <span className="t-account-label mb-1.5 block text-k-text-4">
        {upGreek(label)}
        {required && <span className="ml-1 text-k-red">*</span>}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        ref={(el) => el?.setCustomValidity(invalid ?? "")}
        aria-invalid={error ? true : undefined}
        className={`t-input h-12 w-full border px-3.5 text-k-ink outline-none focus:border-k-ink ${
          error ? "border-k-red" : "border-k-line-2"
        }`}
      />
      {error && <span className="mt-1 block text-[11px] text-k-red">{error}</span>}
      {help && !error && (
        <span className="mt-1 block text-[11px] text-k-text-4">{help}</span>
      )}
    </label>
  );
}
