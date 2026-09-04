"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { subscribeAction, type NewsletterFormState } from "@/lib/newsletter/actions";
import { upGreek } from "@/lib/greek";

const INITIAL: NewsletterFormState = { status: "idle", message: "" };

/**
 * Newsletter band. Handoff: stacked 48px input + 48px button on mobile,
 * side-by-side 52px row on desktop.
 *
 * Η φόρμα ήταν ΑΠΕΝΕΡΓΟΠΟΙΗΜΕΝΗ και δεν έστελνε πουθενά — σκόπιμα, ώστε να μην
 * καταπίνει σιωπηλά πραγματικές διευθύνσεις μέχρι να υπάρχει μηχανισμός. Τώρα
 * υπάρχει: γράφει συνδρομητή σε κατάσταση αναμονής και στέλνει email
 * επιβεβαίωσης. Χωρίς το κλικ στο email δεν λαμβάνει τίποτα.
 */
export function NewsletterBand() {
  const t = useTranslations("home.NewsletterBand");
  const [state, action, pending] = useActionState(subscribeAction, INITIAL);

  return (
    <section className="shell-x flex flex-col gap-3 bg-k-red py-[26px] lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-10 lg:py-[42px]">
      <div>
        <p className="t-news-title text-white">{upGreek(t("eggrafi_sto_newsletter"))}</p>
        <p className="t-news-body mt-1.5 hidden text-white/86 lg:block">
          {t("nea_proionta_prosfores_kai_technika")}
        </p>
      </div>

      <form action={action} className="lg:min-w-[520px]">
        <div className="flex flex-col gap-3 lg:flex-row lg:gap-0">
          <label htmlFor="newsletter-email" className="sr-only">
            {t("to_email_sas")}
          </label>
          <input
            id="newsletter-email"
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder={t("to_email_sas")}
            className="t-input h-12 border-0 bg-white px-3.5 text-k-ink outline-none lg:h-[52px] lg:flex-1 lg:px-[18px]"
          />
          {/*
            Παγίδα για bots: κρυφό από τον άνθρωπο, ελκυστικό στο αυτόματο.
            `tabIndex={-1}` και `aria-hidden` ώστε να μην το βρει ούτε το
            πληκτρολόγιο ούτε ο αναγνώστης οθόνης — αλλιώς η παγίδα πιάνει
            χρήστες αντί για bots.
          */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute h-0 w-0 overflow-hidden opacity-0"
          />
          <button
            type="submit"
            disabled={pending}
            className="t-btn-sm h-12 border-0 bg-k-ink text-white disabled:opacity-70 lg:h-[52px] lg:px-[30px]"
          >
            {pending ? "…" : upGreek(t("eggrafi"))}
          </button>
        </div>

        <p aria-live="polite" className="t-news-body mt-2 min-h-[18px] text-white">
          {state.message}
        </p>
      </form>
    </section>
  );
}
