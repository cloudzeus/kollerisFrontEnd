"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { addToCartByCode } from "@/lib/cart/actions";
import { upGreek } from "@/lib/greek";

/**
 * Γρήγορη παραγγελία με κωδικό.
 *
 * Η μία ενότητα της αρχικής που δεν πουλάει τίποτα — δίνει συντόμευση σε
 * κάποιον που έχει ήδη αποφασίσει. Ο αγοραστής της ναυτιλιακής δεν περιηγείται:
 * έχει δελτίο ή παλιό τιμολόγιο μπροστά του και θέλει να πληκτρολογήσει τον
 * κωδικό. Μέχρι τώρα έπρεπε να τον αναζητήσει, να ανοίξει το προϊόν και να
 * πατήσει προσθήκη — τρία βήματα για κάτι που ήξερε ήδη.
 *
 * Η απάντηση εμφανίζεται ΔΙΠΛΑ στο πεδίο, όχι ως toast στη γωνία. Το «δεν
 * βρέθηκε» αφορά αυτό που μόλις πληκτρολογήθηκε, και σε γωνιακό μήνυμα
 * χρειάζεται να θυμηθεί κανείς τι έγραψε για να το ερμηνεύσει.
 */
export function QuickOrder() {
  const t = useTranslations("home.QuickOrder");
  const [code, setCode] = useState("");
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<"idle" | "done" | "missing" | "error">("idle");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = code.trim();
    if (!value) return;
    startTransition(async () => {
      const result = await addToCartByCode({ code: value, quantity: 1 });
      if (result.ok) {
        setState("done");
        // Καθαρίζει ΜΟΝΟ στην επιτυχία: μετά από αποτυχία ο κωδικός μένει για
        // να διορθωθεί, αντί να ξαναπληκτρολογηθεί από την αρχή.
        setCode("");
      } else {
        setState(result.error === "code_not_found" ? "missing" : "error");
      }
      setTimeout(() => setState("idle"), 3200);
    });
  };

  return (
    <section className="shell-x pb-16">
      <form
        onSubmit={submit}
        className="flex flex-col gap-5 border border-k-line bg-k-surface px-8 py-7 lg:flex-row lg:items-center lg:gap-7"
      >
        <div className="lg:min-w-[280px]">
          <h2 className="font-display text-[20px] leading-tight font-extrabold tracking-[0.01em]">
            {upGreek(t("grigori_paraggelia_me_kodiko"))}
          </h2>
          <p className="mt-1 text-[13px] text-k-text-3">{t("xerete_ti_thelete")}</p>
        </div>

        <div className="flex flex-1 flex-col gap-2">
          <div className="flex gap-2.5">
            <label htmlFor="quick-order-code" className="sr-only">
              {t("kodikos_proiontos")}
            </label>
            <input
              id="quick-order-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder={t("p_ch_4932499207_81_11")}
              autoComplete="off"
              className="h-12 min-w-0 flex-1 border border-k-line-2 bg-k-surface-3 px-4 text-[14px] text-k-ink outline-none placeholder:text-k-text-4 focus:border-k-ink"
            />
            <button
              type="submit"
              disabled={pending || code.trim().length === 0}
              className="font-display h-12 shrink-0 cursor-pointer bg-k-ink-deep px-7 text-[14px] font-bold tracking-[0.08em] text-white transition-colors hover:bg-k-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "…" : upGreek(t("prosthiki_sto_kalathi"))}
            </button>
          </div>

          <p aria-live="polite" className="min-h-[18px] text-[12.5px]">
            {state === "done" && (
              <span className="text-k-green">✓ {t("prostethike_sto_kalathi")}</span>
            )}
            {state === "missing" && (
              <span className="text-k-red">{t("den_vrethike_kodikos")}</span>
            )}
            {state === "error" && (
              <span className="text-k-red">{t("kati_pige_strava")}</span>
            )}
          </p>
        </div>
      </form>
    </section>
  );
}
