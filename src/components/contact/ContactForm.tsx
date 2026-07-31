"use client";

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

const TOPICS = [
  {
    value: "technical",
    label: "Τεχνική ερώτηση",
    hint: "Ποιο εργαλείο κάνει για τη δουλειά σας",
    placeholder:
      "Περιγράψτε τη δουλειά: υλικό, διάμετρος, συχνότητα χρήσης. Δεν χρειάζεται να ξέρετε τον κωδικό.",
  },
  {
    value: "quote",
    label: "Προσφορά",
    hint: "Για ποσότητα ή σετ",
    placeholder: "Ποια είδη και σε τι ποσότητες; Αν έχετε κωδικούς, επικολλήστε τους εδώ.",
  },
  {
    value: "partnership",
    label: "Συνεργασία B2B",
    hint: "Εταιρικός λογαριασμός",
    placeholder: "Πείτε μας για την εταιρεία σας και τι είδη σας ενδιαφέρουν.",
  },
  {
    value: "order",
    label: "Παραγγελία",
    hint: "Για υπάρχουσα παραγγελία",
    placeholder: "Τι θέλετε να ελέγξουμε; Παράδοση, τιμολόγιο, επιστροφή.",
  },
  {
    value: "other",
    label: "Άλλο",
    hint: "",
    placeholder: "Πείτε μας.",
  },
] as const;

export function ContactForm({ locale, pagePath }: { locale: string; pagePath?: string }) {
  const [state, action, pending] = useActionState<ContactState, FormData>(submitContact, {});
  const [topic, setTopic] = useState<(typeof TOPICS)[number]["value"]>("technical");

  const active = TOPICS.find((t) => t.value === topic)!;

  if (state.ok) {
    return (
      <div className="border-l-[3px] border-k-green bg-k-surface-2 p-6 lg:p-8">
        <p className="t-eyebrow text-k-green">{upGreek("Στάλθηκε")}</p>
        <p className="font-artegra mt-3 text-[19px] leading-[1.25] text-k-ink lg:text-[22px]">
          {upGreek("Το λάβαμε")}
        </p>
        <p className="mt-3 max-w-lg text-[13.5px] leading-[1.7] text-k-text-2">
          Απαντάμε συνήθως την ίδια εργάσιμη. Αν βιάζεστε, καλέστε μας στο{" "}
          <a href="tel:+302104111355" className="font-semibold text-k-ink underline underline-offset-4">
            210 411 1355
          </a>{" "}
          — σηκώνει άνθρωπος.
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
        <label htmlFor="website">Μην συμπληρώσετε</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {state.error && (
        <p role="alert" className="border-l-[3px] border-k-red bg-k-red/8 px-4 py-3 text-[13px] text-k-ink">
          {state.error}
        </p>
      )}

      <fieldset>
        <legend className="t-account-label mb-2.5 text-k-text-4">{upGreek("Θέμα")}</legend>
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
              {upGreek(option.label)}
            </label>
          ))}
        </div>
        {active.hint && (
          <p className="mt-2.5 text-[12px] text-k-text-4">{active.hint}</p>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Ονοματεπώνυμο" name="name" required error={state.fieldErrors?.name} />
        <Field label="Email" name="email" type="email" autoComplete="email" required error={state.fieldErrors?.email} />
        <Field label="Τηλέφωνο" name="phone" type="tel" autoComplete="tel" help="Για να σας πάρουμε αν είναι πιο γρήγορο." />
        <Field label="Εταιρεία" name="company" required={topic === "partnership"} error={state.fieldErrors?.company} />

        {topic === "partnership" && (
          <Field label="ΑΦΜ" name="vatNumber" error={state.fieldErrors?.vatNumber} help="Για να ετοιμάσουμε τον εταιρικό λογαριασμό." />
        )}
        {topic === "order" && (
          <Field label="Αριθμός παραγγελίας" name="orderRef" placeholder="π.χ. KOL-20260731-0007" error={state.fieldErrors?.orderRef} />
        )}
      </div>

      <Field label="Θέμα μηνύματος" name="subject" required error={state.fieldErrors?.subject} />

      <label className="block">
        <span className="t-account-label mb-1.5 block text-k-text-4">
          {upGreek("Μήνυμα")}
          <span className="ml-1 text-k-red">*</span>
        </span>
        <textarea
          name="message"
          rows={6}
          required
          placeholder={active.placeholder}
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
        {pending ? "…" : upGreek("Αποστολή")}
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
