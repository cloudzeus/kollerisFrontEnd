"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { submitContact, type ContactState } from "@/lib/contact/actions";
import { upGreek } from "@/lib/greek";

/**
 * Topic-driven contact form.
 *
 * The fields change with the topic, because the four reasons people write are
 * genuinely different: a technical question needs the job described, a quote
 * needs quantity and company, a partnership needs the ΑΦΜ, an order query needs
 * the order number. Asking everyone for all of it is how a contact form gets
 * abandoned.
 *
 * Progressive disclosure, per the UX rules — the extra field appears when the
 * topic is chosen, not before.
 */

/**
 * The five reasons somebody writes in.
 *
 * Only the value and the message keys live here — the words themselves are in
 * the message files, looked up at render. Keeping labels at module scope would
 * mean this list could never speak anything but Greek, which is exactly how the
 * form ended up untranslated in the first place.
 */
const TOPICS = [
  { value: "technical" },
  { value: "quote" },
  { value: "partnership" },
  { value: "order" },
  { value: "other" },
] as const;

export function ContactForm({ locale, pagePath }: { locale: string; pagePath?: string }) {
  const t = useTranslations("contact.ContactForm");
  const [state, action, pending] = useActionState<ContactState, FormData>(submitContact, {});
  const [topic, setTopic] = useState<(typeof TOPICS)[number]["value"]>("technical");


  if (state.ok) {
    return (
      <div className="border-l-[3px] border-k-green bg-k-surface-2 p-6 lg:p-8">
        <p className="t-eyebrow text-k-green">{upGreek(t("stalthike"))}</p>
        <p className="font-display t-display mt-3 text-[19px] leading-[1.25] text-k-ink lg:text-[22px]">
          {upGreek(t("to_lavame"))}
        </p>
        <p className="mt-3 max-w-lg text-[13.5px] leading-[1.7] text-k-text-2">
          {t("apantame_synithos_tin_idia_ergasimi")}{" "}
          <a href="tel:+302104111355" className="font-semibold text-k-ink underline underline-offset-4">
            210 411 1355
          </a>{" "}
          {t("sikonei_anthropos")}
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="locale" value={locale} />
      {pagePath && <input type="hidden" name="pagePath" value={pagePath} />}

      {/* Honeypot: off-screen, not `display:none`, so a bot's autofill still
          finds it while a screen reader is told to skip it. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">{t("min_symplirosete")}</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {state.error && (
        <p role="alert" className="border-l-[3px] border-k-red bg-k-red/8 px-4 py-3 text-[13px] text-k-ink">
          {state.error}
        </p>
      )}

      <fieldset>
        <legend className="t-account-label mb-2.5 text-k-text-4">{upGreek(t("thema"))}</legend>
        <div className="flex flex-wrap gap-1.5">
          {TOPICS.map((option) => (
            <label
              key={option.value}
              className={`t-nav-sub flex cursor-pointer items-center gap-2 border px-3.5 py-2.5 transition-colors ${
                topic === option.value
                  ? "border-k-ink bg-k-ink text-white"
                  : "border-k-line-2 bg-white text-k-text-3 hover:border-k-ink hover:text-k-ink"
              }`}
            >
              <input
                type="radio"
                name="topic"
                value={option.value}
                checked={topic === option.value}
                onChange={() => setTopic(option.value)}
                className="sr-only"
              />
              {upGreek(t(`topic_${option.value}_label`))}
            </label>
          ))}
        </div>
        {topic !== "other" && (
          <p className="mt-2.5 text-[12px] text-k-text-4">{t(`topic_${topic}_hint`)}</p>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("onomateponymo")} name="name" required error={state.fieldErrors?.name} />
        <Field label="Email" name="email" type="email" autoComplete="email" required error={state.fieldErrors?.email} />
        <Field label={t("tilefono")} name="phone" type="tel" autoComplete="tel" help={t("gia_na_sas_paroyme_an")} />
        <Field label={t("etaireia")} name="company" required={topic === "partnership"} error={state.fieldErrors?.company} />

        {topic === "partnership" && (
          <Field label={t("afm")} name="vatNumber" error={state.fieldErrors?.vatNumber} help={t("gia_na_etoimasoyme_ton_etairiko")} />
        )}
        {topic === "order" && (
          <Field label={t("arithmos_paraggelias")} name="orderRef" placeholder={t("p_ch_kol_20260731_0007")} error={state.fieldErrors?.orderRef} />
        )}
      </div>

      <Field label={t("thema_minymatos")} name="subject" required error={state.fieldErrors?.subject} />

      <label className="block">
        <span className="t-account-label mb-1.5 block text-k-text-4">
          {upGreek(t("minyma"))}
          <span className="ml-1 text-k-red">*</span>
        </span>
        <textarea
          name="message"
          rows={6}
          required
          placeholder={t(`topic_${topic}_placeholder`)}
          aria-invalid={state.fieldErrors?.message ? true : undefined}
          className={`t-input w-full resize-y border px-3.5 py-3 leading-[1.6] text-k-ink outline-none focus:border-k-ink ${
            state.fieldErrors?.message ? "border-k-red" : "border-k-line-2"
          }`}
        />
        {state.fieldErrors?.message && (
          <span className="mt-1 block text-[11px] text-k-red">{state.fieldErrors.message}</span>
        )}
      </label>

      <button
        type="submit"
        disabled={pending}
        className="t-btn h-13 self-start bg-k-red px-10 py-4 text-white transition-colors hover:bg-k-red-hover disabled:opacity-60"
      >
        {pending ? "…" : upGreek(t("apostoli"))}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  autoComplete,
  placeholder,
  error,
  help,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
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
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        className={`t-input h-12 w-full border px-3.5 text-k-ink outline-none focus:border-k-ink ${
          error ? "border-k-red" : "border-k-line-2"
        }`}
      />
      {error && <span className="mt-1 block text-[11px] text-k-red">{error}</span>}
      {help && !error && <span className="mt-1 block text-[11px] text-k-text-4">{help}</span>}
    </label>
  );
}
