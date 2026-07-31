"use client";

import { useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { applyCoupon, setCartOptions } from "@/lib/cart/actions";
import {
  FREE_SHIPPING_THRESHOLD_NET,
  PAYMENT_METHODS,
  SHIPPING_METHODS,
  type CartTotals,
  type PaymentMethodId,
  type ShippingMethodId,
} from "@/lib/cart/options";
import { formatMoney } from "@/lib/format";
import { upGreek } from "@/lib/greek";
import { useState } from "react";

/**
 * Sticky summary.
 *
 * Every figure is passed in from the server render. The picker writes the
 * choice and the server recomputes — the panel never does its own arithmetic,
 * so the free-shipping bar and the total can never disagree.
 */
export function CartSummaryPanel({
  totals,
  shippingMethod,
  paymentMethod,
  isPartner = false,
}: {
  totals: CartTotals;
  shippingMethod: ShippingMethodId;
  paymentMethod: PaymentMethodId;
  isPartner?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [coupon, setCoupon] = useState("");
  const [couponError, setCouponError] = useState<string | null>(null);

  const choose = (patch: { shippingMethod?: string; paymentMethod?: string }) => {
    startTransition(async () => {
      await setCartOptions(patch);
    });
  };

  const progress = Math.min(
    100,
    Math.round((totals.subtotalNet / FREE_SHIPPING_THRESHOLD_NET) * 100),
  );

  // "Επί πιστώσει" is only offered to partner accounts (spec §5).
  const payments = PAYMENT_METHODS.filter((m) => !m.partnerOnly || isPartner);

  return (
    <aside
      className={`border-k-line lg:sticky lg:top-0 lg:border-l ${pending ? "opacity-70" : ""}`}
    >
      {/* Free shipping */}
      <div className="border-b border-k-line px-4 py-6 lg:px-8">
        <div className="mb-3.5 flex items-baseline justify-between">
          <span className="t-footer-col text-k-text-4">{upGreek("Δωρεάν μεταφορικά")}</span>
          <span
            className={`t-badge px-1.5 py-1 ${
              totals.freeShippingReached ? "bg-k-green text-white" : "bg-k-surface-3 text-k-text-3"
            }`}
          >
            {totals.freeShippingReached ? upGreek("Ενεργό") : `${progress}%`}
          </span>
        </div>
        <div className="relative h-2 overflow-hidden bg-k-line">
          <span
            className={`absolute inset-y-0 left-0 transition-all duration-500 ${
              totals.freeShippingReached ? "bg-k-green" : "bg-k-red"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-3 text-[12px] leading-[1.5] text-k-text-2">
          {totals.freeShippingReached ? (
            <>Τα μεταφορικά σας είναι δωρεάν.</>
          ) : (
            <>
              Προσθέστε ακόμη{" "}
              <strong className="font-mono font-semibold text-k-ink">
                {formatMoney(totals.freeShippingRemaining)}
              </strong>{" "}
              (καθαρή αξία) για δωρεάν μεταφορικά.
            </>
          )}
        </p>
      </div>

      {/* Shipping */}
      <div className="border-b border-k-line px-4 py-6 lg:px-8">
        <p className="t-footer-col mb-3 text-k-text-4">{upGreek("Τρόπος παραλαβής")}</p>
        <div className="flex flex-col gap-px border border-k-line bg-k-line">
          {SHIPPING_METHODS.map((method) => {
            const active = method.id === shippingMethod;
            const free = method.freeOverThreshold && totals.freeShippingReached;
            /*
             * Only the selected method carries a priced quote — quoting all
             * three would mean running the tariff engine three times per render
             * for numbers that change again once the postcode is known.
             */
            const cost = active ? totals.shippingGross : null;
            return (
              <button
                key={method.id}
                type="button"
                onClick={() => choose({ shippingMethod: method.id })}
                aria-pressed={active}
                className={`flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${
                  active ? "bg-k-surface-2" : "bg-white hover:bg-k-surface-2"
                }`}
              >
                <span
                  className={`rounded-pill block h-3.5 w-3.5 shrink-0 border ${
                    active ? "border-[5px] border-k-red" : "border-k-line-2"
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold text-k-ink">
                    {method.label}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] text-k-text-4">
                    {method.meta}
                  </span>
                </span>
                <span
                  className={`font-mono text-[13px] font-semibold whitespace-nowrap ${
                    free || method.expressMultiplier === 0 ? "text-k-green" : "text-k-ink"
                  }`}
                >
                  {free || method.expressMultiplier === 0
                    ? upGreek("Δωρεάν")
                    : cost != null
                      ? formatMoney(cost)
                      : upGreek("Υπολογισμός")}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Payment */}
      <div className="border-b border-k-line px-4 py-6 lg:px-8">
        <p className="t-footer-col mb-3 text-k-text-4">{upGreek("Τρόπος πληρωμής")}</p>
        <div className="flex flex-wrap gap-2">
          {payments.map((method) => {
            const active = method.id === paymentMethod;
            return (
              <button
                key={method.id}
                type="button"
                onClick={() => choose({ paymentMethod: method.id })}
                aria-pressed={active}
                className={`flex items-center gap-1.5 border px-3 py-2 text-[11.5px] font-semibold transition-colors ${
                  active
                    ? "border-k-ink bg-k-ink text-white"
                    : "border-k-line-2 text-k-text-2 hover:border-k-ink"
                }`}
              >
                {method.label}
                {method.feeNet > 0 && (
                  <span className={`t-brand-count ${active ? "text-white/60" : "text-k-text-4"}`}>
                    +{formatMoney(method.feeNet)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Coupon */}
      <div className="border-b border-k-line px-4 py-6 lg:px-8">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const result = await applyCoupon();
              setCouponError(
                result.ok ? null : "Τα κουπόνια δεν είναι ακόμη διαθέσιμα.",
              );
            });
          }}
          className="flex"
        >
          <label htmlFor="coupon" className="sr-only">
            Κωδικός έκπτωσης
          </label>
          <input
            id="coupon"
            value={coupon}
            onChange={(e) => setCoupon(e.target.value)}
            placeholder="Κωδικός έκπτωσης"
            className="h-[46px] min-w-0 flex-1 border border-r-0 border-k-line-2 px-3.5 font-mono text-[12.5px] text-k-ink outline-none focus:border-k-ink"
          />
          <button
            type="submit"
            className="t-card-cta border-0 bg-k-ink px-5 text-white transition-colors hover:bg-k-red"
          >
            {upGreek("Εφαρμογή")}
          </button>
        </form>
        {couponError && (
          <p role="alert" className="mt-2 text-[11.5px] text-k-amber">
            {couponError}
          </p>
        )}
      </div>

      {/* Totals */}
      <div className="h-[7px] bg-[repeating-linear-gradient(135deg,#FF3333_0_9px,#1A1A1C_9px_18px)]" />
      <div className="bg-k-ink px-4 py-6 lg:px-8">
        <dl className="flex flex-col gap-2.5">
          {[
            { k: "Καθαρή αξία", v: formatMoney(totals.subtotalNet) },
            {
              k: "Μεταφορικά",
              v:
                totals.shippingGross === 0
                  ? upGreek("Δωρεάν")
                  : formatMoney(totals.shippingGross),
            },
            ...(totals.paymentFeeGross > 0
              ? [{ k: "Επιβάρυνση πληρωμής", v: formatMoney(totals.paymentFeeGross) }]
              : []),
            { k: "ΦΠΑ", v: formatMoney(totals.vatAmount) },
          ].map((row) => (
            <div key={row.k} className="flex items-baseline justify-between gap-4">
              <dt className="text-[12.5px] text-white/55">{row.k}</dt>
              <dd className="font-mono text-[13px] font-medium whitespace-nowrap text-white">
                {row.v}
              </dd>
            </div>
          ))}
        </dl>

        {totals.postage && totals.shippingGross > 0 && (
          <p className="mt-2.5 text-[11px] leading-[1.5] text-white/45">
            {totals.postage.carrier} · {totals.postage.zoneLabel} ·{" "}
            {totals.postage.chargeableKg} kg χρεώσιμο βάρος
            {totals.postage.estimated && " (εκτίμηση)"}
            {" — "}
            {totals.postage.etaDays} εργάσιμες
          </p>
        )}

        <div className="mt-4 flex items-end justify-between gap-4 border-t border-white/16 pt-4">
          <div>
            <p className="t-footer-col text-white/50">{upGreek("Τελικό σύνολο")}</p>
            <p className="t-account-label mt-1.5 text-white/40">{upGreek("Με ΦΠΑ")}</p>
          </div>
          <p className="font-mono text-[30px] leading-none font-semibold tracking-[-0.03em] whitespace-nowrap text-white lg:text-[38px]">
            {formatMoney(totals.totalGross)}
          </p>
        </div>

        {totals.savingsGross > 0 && (
          <p className="mt-3.5 border-l-[3px] border-k-red bg-k-red/14 px-3.5 py-2.5 text-[11.5px] font-semibold text-white">
            Κερδίζετε {formatMoney(totals.savingsGross)} σε αυτή την παραγγελία
          </p>
        )}

        <Link
          href="/checkout"
          className="t-btn mt-4 flex h-14 w-full items-center justify-center bg-k-red text-white transition-colors hover:bg-white hover:text-k-ink"
        >
          {upGreek("Ολοκλήρωση παραγγελίας")} →
        </Link>

        <p className="t-account-label mt-3 flex items-center justify-center gap-2 text-white/50">
          {upGreek("Ασφαλής πληρωμή · SSL")}
        </p>
      </div>
    </aside>
  );
}
