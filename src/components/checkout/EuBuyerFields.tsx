"use client";

import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { checkVatAction, setCustomerTypeAction, type VatCheckAnswer } from "@/lib/eu-sales/check-vat-action";
import { vatPrefix } from "@/lib/eu-sales/countries";
import { mayStartVatCheck } from "@/lib/eu-sales/check-gate";
import { normaliseEuVat } from "@/lib/eu-sales/vat-format";
import type { CustomerType } from "@/lib/eu-sales/vat-mode";
import { upGreek } from "@/lib/greek";

/**
 * «Ιδιώτης» or «Εταιρεία», for a delivery outside Greece with EU sales
 * (intra-EU sales design §3.2). Replaces «Θέλω τιμολόγιο» there; the Greek
 * invoice block (`CompanyVatFields`, AADE) is only ever shown for Greece.
 *
 * A company gives its name and its VAT number, the prefix already filled from
 * the country. The format is checked here first; then, on blur or «Έλεγχος»,
 * a server action asks VIES through HDCtool. Whatever this says, `placeOrder`
 * asks again and decides — the status line is information, not a switch.
 *
 * Mounted with `key={country}`: a new country starts the number and its answer
 * again from nothing, so a valid answer for Germany never shows next to
 * Austria (Review Focus 2). The consumer/company choice is the form's.
 */
export function EuBuyerFields({
  country,
  locale,
  type,
  onTypeChange,
  fieldErrors,
}: {
  country: string;
  locale: string;
  /** Held by the form, so a change of country keeps the choice. */
  type: CustomerType | null;
  onTypeChange: (type: CustomerType) => void;
  fieldErrors?: Record<string, string | undefined>;
}) {
  const t = useTranslations("checkout.CheckoutForm");
  const prefix = vatPrefix(country);
  const [vat, setVat] = useState(prefix);
  const [answer, setAnswer] = useState<VatCheckAnswer | null>(null);
  /* The number the answer is for: typing something else clears it. */
  const [checkedFor, setCheckedFor] = useState<string | null>(null);
  /*
   * Two transitions, not one: the VIES check, and the write that follows a
   * change of type or an edit. One shared flag disabled «Έλεγχος» (and dropped
   * the blur check) while that write ran, so edit-then-click did nothing the
   * first time.
   */
  const [checking, startCheck] = useTransition();
  const [, startTransition] = useTransition();
  const pending = checking;
  /*
   * The server refused the order because VIES no longer says what the screen
   * did (`placeOrder`, vatModeHint): drop the local «✓ Confirmed» and its
   * exemption note, so the form agrees with the summary, which now has VAT.
   */
  const [seenErrors, setSeenErrors] = useState(fieldErrors);
  if (fieldErrors !== seenErrors) {
    setSeenErrors(fieldErrors);
    if (fieldErrors?.vatNumber) {
      setAnswer(null);
      setCheckedFor(null);
    }
  }
  /*
   * The number being asked about right now. Pressing «Έλεγχος» blurs the
   * field first, so one press fires the blur check AND the click check —
   * before `pending` has re-rendered. This is what makes it one VIES call.
   */
  const inFlight = useRef<string | null>(null);

  const format = normaliseEuVat(vat, country);
  const typedDigits = vat.toUpperCase().replace(/[^A-Z0-9]/g, "").length > prefix.length;
  const formatError = typedDigits && !format.ok ? t("vat_invalid_format") : null;
  const current = format.ok && checkedFor === format.vat ? answer : null;

  const choose = (next: CustomerType) => {
    onTypeChange(next);
    setAnswer(null);
    setCheckedFor(null);
    // The summary beside the form follows: «Ιδιώτης» is VAT again at once.
    startTransition(async () => {
      await setCustomerTypeAction({ customerType: next });
    });
  };

  /*
   * Typing away from the number that was checked drops its answer — here, and
   * on the server, at the first keystroke that departs from it. The summary
   * and the pay button never show the net for a number nobody checked; the
   * new one has to be checked again (blur or «Έλεγχος»).
   */
  const edit = (next: string) => {
    setVat(next);
    if (checkedFor === null) return;
    const typed = normaliseEuVat(next, country);
    if (typed.ok && typed.vat === checkedFor) return;
    setCheckedFor(null);
    setAnswer(null);
    startTransition(async () => {
      await setCustomerTypeAction({ customerType: "company" });
    });
  };

  const check = () => {
    if (!format.ok) return;
    const asked = format.vat;
    if (
      !mayStartVatCheck({
        formatOk: true,
        checking,
        inFlight: inFlight.current,
        asked,
        checkedFor,
        answerStatus: answer?.status ?? null,
      })
    ) {
      return;
    }
    inFlight.current = asked;
    startCheck(async () => {
      try {
        const result = await checkVatAction({ country, vat: asked, locale });
        setAnswer(result);
        setCheckedFor(asked);
      } finally {
        inFlight.current = null;
      }
    });
  };

  const error = (name: string) => fieldErrors?.[name];

  return (
    <div className="mt-5" data-eu-buyer>
      <fieldset>
        <legend className="t-account-label mb-1.5 block text-k-text-4">
          {upGreek(t("customer_type"))}
          <span className="ml-1 text-k-red">*</span>
        </legend>
        <div className="flex flex-col gap-px border border-k-line bg-k-line sm:flex-row">
          {(["individual", "company"] as const).map((option) => (
            <label
              key={option}
              className={`flex min-h-11 flex-1 cursor-pointer items-center gap-3 px-4 py-3 ${
                type === option ? "bg-k-surface-2" : "bg-white"
              }`}
            >
              <input
                type="radio"
                name="customerType"
                value={option}
                required
                checked={type === option}
                onChange={() => choose(option)}
                className="h-4 w-4 accent-k-red"
              />
              <span className="font-semibold text-k-ink" style={{ fontSize: "var(--fs-13)" }}>
                {option === "individual" ? t("customer_individual") : t("customer_company")}
              </span>
            </label>
          ))}
        </div>
        {error("customerType") && (
          <p className="mt-1 text-k-red" style={{ fontSize: "var(--fs-11)" }}>
            {t("customer_type_required")}
          </p>
        )}
      </fieldset>

      {type === "individual" && (
        <p className="mt-2 text-k-text-3" style={{ fontSize: "var(--fs-11-5)" }}>
          {t("customer_individual_help")}
        </p>
      )}

      {type === "company" && (
        <div className="mt-4 grid gap-4 border-l-[3px] border-k-red bg-k-surface-2 p-4 sm:grid-cols-2">
          <label className="block">
            <span className="t-account-label mb-1.5 block text-k-text-4">
              {upGreek(t("company_name"))}
              <span className="ml-1 text-k-red">*</span>
            </span>
            <input
              name="companyName"
              required
              autoComplete="organization"
              aria-invalid={error("companyName") ? true : undefined}
              className={`t-input h-12 w-full border bg-white px-3.5 text-k-ink outline-none focus:border-k-ink ${
                error("companyName") ? "border-k-red" : "border-k-line-2"
              }`}
            />
            {error("companyName") && (
              <span className="mt-1 block text-k-red" style={{ fontSize: "var(--fs-11)" }}>
                {error("companyName")}
              </span>
            )}
          </label>

          <div>
            <label className="block">
              <span className="t-account-label mb-1.5 block text-k-text-4">
                {upGreek(t("vat_number_eu"))}
                <span className="ml-1 text-k-red">*</span>
              </span>
              <span className="flex">
                <input
                  name="vatNumber"
                  value={vat}
                  required
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => edit(e.target.value.toUpperCase())}
                  onBlur={check}
                  onKeyDown={(e) => {
                    // Enter inside the checkout form would submit the order.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      check();
                    }
                  }}
                  placeholder={`${prefix}123456789`}
                  aria-invalid={formatError || error("vatNumber") ? true : undefined}
                  aria-describedby="eu-vat-status"
                  className={`t-input h-12 min-w-0 flex-1 border border-r-0 bg-white px-3.5 font-mono text-k-ink outline-none focus:border-k-ink ${
                    formatError || error("vatNumber") ? "border-k-red" : "border-k-line-2"
                  }`}
                />
                <button
                  type="button"
                  onClick={check}
                  disabled={!format.ok || pending}
                  className="t-btn-sm h-12 min-w-11 shrink-0 bg-k-ink px-4 text-white transition-colors hover:bg-k-red disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pending ? "…" : upGreek(t("vat_check"))}
                </button>
              </span>
            </label>

            <div id="eu-vat-status" aria-live="polite" className="mt-1.5 leading-normal" style={{ fontSize: "var(--fs-11-5)" }}>
              {formatError ? (
                <p className="text-k-red">{formatError}</p>
              ) : error("vatNumber") && !current ? (
                <p className="text-k-red">{error("vatNumber")}</p>
              ) : current?.status === "valid" ? (
                <>
                  <p className="flex items-center gap-1.5 text-k-green">
                    <span aria-hidden>✓</span>
                    {current.message}
                  </p>
                  <p className="mt-1 text-k-text-2">{t("vat_exempt_note")}</p>
                </>
              ) : current?.status === "invalid" ? (
                <p className="flex items-start gap-1.5 text-k-red">
                  <span aria-hidden>✗</span>
                  {current.message}
                </p>
              ) : current?.status === "unavailable" ? (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-k-amber">
                  <span aria-hidden>⚠</span>
                  <span>{current.message}</span>
                  <button
                    type="button"
                    onClick={check}
                    disabled={pending}
                    className="min-h-11 font-semibold text-k-ink underline underline-offset-2"
                  >
                    {t("vat_retry")}
                  </button>
                </p>
              ) : current?.status === "invalid_format" ? (
                <p className="text-k-red">{current.message}</p>
              ) : (
                <p className="text-k-text-4">{t("vat_help", { prefix })}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
