"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { CompanyVatFields } from "@/components/account/CompanyVatFields";
import { placeOrder, type CheckoutState } from "@/lib/checkout/actions";
import { PAYMENT_METHODS, SHIPPING_METHODS } from "@/lib/cart/options";
import { upGreek } from "@/lib/greek";

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
}: {
  locale: string;
  postcode: string;
  isPartner?: boolean;
}) {
  const t = useTranslations("checkout.CheckoutForm");
  const [state, action, pending] = useActionState<CheckoutState, FormData>(placeOrder, {});
  const [wantsInvoice, setWantsInvoice] = useState(false);
  const [shipping, setShipping] = useState<string>("courier");
  const [payment, setPayment] = useState<string>("card");
  const [terms, setTerms] = useState(false);

  const payments = PAYMENT_METHODS.filter((m) => !m.partnerOnly || isPartner);

  return (
    <form action={action} className="flex flex-col gap-8">
      <input type="hidden" name="locale" value={locale} />

      {state.error && (
        <p
          role="alert"
          className="border-l-[3px] border-k-red bg-k-red/8 px-4 py-3 text-[13px] text-k-ink"
        >
          {state.error}
        </p>
      )}

      <Step n="01" title={t("stoicheia_epikoinonias")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("onoma")} name="firstName" error={state.fieldErrors?.firstName} required />
          <Field label={t("eponymo")} name="lastName" error={state.fieldErrors?.lastName} required />
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            error={state.fieldErrors?.email}
            required
          />
          <Field
            label={t("kinito")}
            name="phone"
            type="tel"
            autoComplete="tel"
            error={state.fieldErrors?.phone}
            required
          />
        </div>
      </Step>

      <Step n="02" title={t("dieythynsi_paradosis")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field
              label={t("odos_kai_arithmos")}
              name="shipLine1"
              autoComplete="address-line1"
              error={state.fieldErrors?.shipLine1}
              required
            />
          </div>
          <Field label={t("orofos_koydoyni")} name="shipLine2" autoComplete="address-line2" />
          <Field label={t("periochi")} name="shipRegion" />
          <Field
            label={t("poli")}
            name="shipCity"
            autoComplete="address-level2"
            error={state.fieldErrors?.shipCity}
            required
          />
          <Field
            label={t("t_k")}
            name="shipPostcode"
            autoComplete="postal-code"
            defaultValue={postcode}
            error={state.fieldErrors?.shipPostcode}
            required
            help="Καθορίζει τη ζώνη ACS και το κόστος αποστολής."
          />
        </div>

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
      </Step>

      <Step n="03" title={t("tropos_apostolis")}>
        <div className="flex flex-col gap-px border border-k-line bg-k-line">
          {SHIPPING_METHODS.map((method) => (
            <label
              key={method.id}
              className={`flex cursor-pointer items-center gap-3 px-4 py-3.5 ${
                shipping === method.id ? "bg-k-surface-2" : "bg-white"
              }`}
            >
              <input
                type="radio"
                name="shippingMethod"
                value={method.id}
                checked={shipping === method.id}
                onChange={() => setShipping(method.id)}
                className="h-4 w-4 accent-k-red"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold text-k-ink">
                  {method.label}
                </span>
                <span className="mt-0.5 block text-[11.5px] text-k-text-4">{method.meta}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2.5 text-[11.5px] text-k-text-4">
          {t("to_kostos_ypologizetai_apo_to")}
        </p>
      </Step>

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
                onChange={() => setPayment(method.id)}
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
            {t("tha_lavete_ta_stoicheia_katathesis")}
          </p>
        )}
      </Step>

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
          disabled={!terms || pending}
          className="t-btn mt-6 flex h-14 w-full items-center justify-center bg-k-red text-white transition-colors hover:bg-k-red-hover disabled:opacity-50"
        >
          {pending
            ? upGreek(t("ginetai_katachorisi"))
            : payment === "card" || payment === "iris"
              ? `${upGreek(t("pliromi_me_asfaleia"))} →`
              : `${upGreek(t("oloklirosi_paraggelias"))} →`}
        </button>
      </Step>
    </form>
  );
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
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  defaultValue?: string;
  error?: string;
  help?: string;
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
