"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, ArrowRight, Check, Loader2, RotateCcw, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { reorder } from "@/lib/cart/actions";
import type { ReorderPlan } from "@/lib/cart/reorder";
import type { Locale } from "@/i18n/routing";
import { formatMoney } from "@/lib/format";

/**
 * Buy this again — and then say what happened.
 *
 * The button is the easy half. The half that decides whether anybody trusts it
 * a second time is the panel underneath, because a reorder is the one action
 * where the customer's expectation and reality routinely differ: they expect
 * their old order, and what they get is today's catalogue at today's prices.
 *
 * So nothing is swallowed. Items that no longer exist are named, not counted.
 * Prices that moved are shown as then → now, before checkout rather than at it.
 * The panel stays until it is dismissed — a toast that vanishes after three
 * seconds is exactly the wrong shape for information somebody needs to read
 * and act on.
 *
 * It does not navigate on success either. Being thrown into the basket hides
 * the very report worth reading; the link to the cart is offered instead, so
 * leaving is the customer's decision once they have seen it.
 */

const MESSAGE: Record<string, string> = {
  not_found: "Η παραγγελία δεν βρέθηκε.",
  forbidden: "Δεν έχετε πρόσβαση σε αυτή την παραγγελία.",
  nothing_available: "Κανένα από τα είδη αυτής της παραγγελίας δεν είναι διαθέσιμο πλέον.",
  invalid_input: "Κάτι πήγε στραβά. Δοκιμάστε ξανά.",
};

export function ReorderButton({
  orderNumber,
  token,
  locale,
  compact,
}: {
  orderNumber: string;
  /** The confirmation link's `?t=`, so a customer who never registered can reorder too. */
  token?: string;
  locale: Locale;
  /** Row-sized rather than page-sized. */
  compact?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [plan, setPlan] = useState<ReorderPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    setPlan(null);
    startTransition(async () => {
      const result = await reorder({ orderNumber, token });
      if (result.ok) setPlan(result.plan);
      else setError(MESSAGE[result.error] ?? MESSAGE.invalid_input);
    });
  }

  const money = (n: number) => formatMoney(n, locale);

  return (
    <div className={compact ? "" : "space-y-3"}>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={`inline-flex items-center gap-2 border-[1.5px] border-k-ink text-k-ink transition-colors hover:bg-k-ink hover:text-white disabled:opacity-60 ${
          compact ? "t-btn-sm px-3.5 py-2" : "t-btn-sm px-6 py-3"
        }`}
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <RotateCcw className="size-3.5" aria-hidden />
        )}
        {pending ? "Προσθήκη…" : "Παραγγελία ξανά"}
      </button>

      {error && (
        <p className="mt-2 flex items-start gap-1.5 text-[12px] text-k-red">
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      {plan && (
        <div className="relative mt-2 border border-k-line bg-k-surface-2 px-4 py-3">
          <button
            type="button"
            onClick={() => setPlan(null)}
            aria-label="Κλείσιμο"
            className="absolute right-2 top-2 p-1 text-k-text-4 transition-colors hover:text-k-ink"
          >
            <X className="size-3.5" aria-hidden />
          </button>

          <p className="flex items-center gap-2 pr-6 text-[13px] font-semibold text-k-ink">
            <Check className="size-4 shrink-0 text-k-green" aria-hidden />
            {plan.units === 1
              ? "1 προϊόν στο καλάθι"
              : `${plan.units} προϊόντα στο καλάθι`}
          </p>

          {/* Named, not counted. "2 items unavailable" sends somebody hunting
              through an old order to work out which two. */}
          {plan.skipped.length > 0 && (
            <div className="mt-2.5 border-t border-k-line pt-2.5">
              <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-k-amber">
                <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                Δεν προστέθηκαν
              </p>
              <ul className="mt-1 space-y-0.5">
                {plan.skipped.map((s, i) => (
                  <li key={`${s.name}-${i}`} className="text-[12px] leading-[1.5] text-k-text-2">
                    {s.name}
                    <span className="text-k-text-4">
                      {s.reason === "delisted"
                        ? " · δεν διατίθεται πλέον"
                        : " · χωρίς διαθέσιμη τιμή"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Before checkout, not at it. */}
          {plan.priceChanges.length > 0 && (
            <div className="mt-2.5 border-t border-k-line pt-2.5">
              <p className="text-[11.5px] font-semibold text-k-text-3">
                Άλλαξε η τιμή από την προηγούμενη παραγγελία
              </p>
              <ul className="mt-1 space-y-0.5">
                {plan.priceChanges.map((c, i) => (
                  <li key={`${c.name}-${i}`} className="text-[12px] leading-[1.5] text-k-text-2">
                    {c.name}{" "}
                    <span className="numeral whitespace-nowrap">
                      <span className="text-k-text-4 line-through">{money(c.then)}</span>{" "}
                      <span className={c.now > c.then ? "text-k-ink" : "text-k-green"}>
                        {money(c.now)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-k-text-4">Τιμές χωρίς ΦΠΑ.</p>
            </div>
          )}

          <Link
            href="/kalathi"
            className="t-btn-sm mt-3 inline-flex items-center gap-1.5 bg-k-ink px-5 py-2.5 text-white transition-colors hover:bg-k-red"
          >
            Στο καλάθι
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      )}
    </div>
  );
}
