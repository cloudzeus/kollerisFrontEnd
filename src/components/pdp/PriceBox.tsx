"use client";

import { useEffect, useState } from "react";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { BuyNowButton } from "@/components/cart/BuyNowButton";
import { Link } from "@/i18n/navigation";
import { formatMoney, formatPrice, savingsOf } from "@/lib/format";
import { upGreek } from "@/lib/greek";

/**
 * Buy box.
 *
 * Discount is COMPUTED from `priceListNet > priceNet`, never a stored flag —
 * and when there is none, the struck price and savings badge are absent
 * entirely rather than rendered empty (spec §4).
 *
 * The countdown stores the raw tick and derives its label at render. Storing
 * the derived label in state is the bug the spec explicitly warns about.
 */
export function PriceBox({
  productId,
  priceNet,
  priceListNet,
  vatRate,
  qty,
  inStock,
}: {
  productId: string;
  priceNet: number | null;
  priceListNet: number | null;
  vatRate: number;
  qty: number;
  inStock: boolean;
}) {
  const [quantity, setQuantity] = useState(1);
  const [tick, setTick] = useState<number | null>(null);

  /*
   * Client-only clock. Rendering a countdown on the server would ship a value
   * already stale by first paint and mismatch on hydration.
   *
   * The first tick is scheduled rather than set synchronously in the effect
   * body — a synchronous setState there causes a cascading render.
   */
  useEffect(() => {
    const start = setTimeout(() => setTick(Date.now()), 0);
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => {
      clearTimeout(start);
      clearInterval(id);
    };
  }, []);

  const ctx = { vatRate };
  const saving =
    priceListNet != null && priceNet != null ? savingsOf(priceListNet, priceNet, ctx) : null;
  const cutoff = tick != null ? nextCutoff(new Date(tick)) : null;

  const stockRatio = Math.min(1, qty / 20);

  return (
    <div>
      {/* Hazard stripe — the one loud element, and it belongs to the price. */}
      <div className="mt-5 h-[7px] bg-[repeating-linear-gradient(135deg,#FF3333_0_9px,#1A1A1C_9px_18px)]" />

      <div className="bg-k-ink px-5 pt-[18px] pb-5 lg:px-6">
        {/*
          The struck price is the SoftOne LIST price, not a promotion — see
          BACKEND_ALIGNMENT. So it is labelled "τιμή καταλόγου" rather than
          dressed as a limited-time offer: 68% of the catalogue carries this
          gap permanently, and a permanent "sale" is not a sale.
        */}
        {saving && priceListNet != null ? (
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="t-account-label text-white/40">{upGreek("Τιμή καταλόγου")}</span>
            <span className="font-mono text-[13px] font-medium text-white/45 line-through">
              {formatPrice(priceListNet, ctx)}
            </span>
            <span className="t-badge bg-k-red px-[7px] py-[3px] text-white">
              −{saving.percent}% · {saving.formatted}
            </span>
          </div>
        ) : (
          <span className="t-account-label block text-white/40">{upGreek("Τιμή eshop")}</span>
        )}

        <p className="mt-2 font-mono text-[38px] leading-[1.02] font-semibold tracking-[-0.03em] text-white lg:text-[44px]">
          {priceNet != null ? formatPrice(priceNet, ctx) : "—"}
        </p>

        <p className="t-account-label mt-2 text-white/50">
          {upGreek(`με ΦΠΑ ${vatRate}%`)}
          {priceNet != null && (
            <>
              {" · "}
              {upGreek("χωρίς ΦΠΑ")} {formatMoney(priceNet)}
            </>
          )}
        </p>

        <div className="mt-[18px] flex gap-2.5 border-t border-white/12 pt-[18px]">
          <div className="flex shrink-0 border border-white/22">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              aria-label="Μείωση ποσότητας"
              className="h-[52px] w-11 border-0 bg-transparent text-lg text-white transition-colors hover:bg-white/10"
            >
              −
            </button>
            <span
              aria-live="polite"
              className="flex h-[52px] w-[52px] items-center justify-center border-x border-white/22 font-mono text-[15px] font-semibold text-white"
            >
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              aria-label="Αύξηση ποσότητας"
              className="h-[52px] w-11 border-0 bg-transparent text-lg text-white transition-colors hover:bg-white/10"
            >
              +
            </button>
          </div>

          <AddToCartButton
            productId={productId}
            quantity={quantity}
            label={upGreek("Προσθήκη στο καλάθι")}
            className="t-btn h-[52px] flex-1 border-0 bg-k-red text-white transition-colors hover:bg-white hover:text-k-ink"
          />
        </div>

        {/* Carries the chosen quantity — buying 6 should not silently buy 1. */}
        <BuyNowButton
          productId={productId}
          quantity={quantity}
          disabled={priceNet == null}
          label={upGreek("Αγορά τώρα — απευθείας ταμείο")}
          className="t-btn-sm mt-2.5 h-[46px] w-full border border-white/25 bg-transparent text-white transition-colors hover:border-white hover:bg-white hover:text-k-ink"
        />

        <div className="mt-4 flex items-center gap-3.5">
          <span
            className={`t-card-stock flex shrink-0 items-center gap-2 ${
              inStock ? "text-k-green-2" : "text-white/50"
            }`}
          >
            <span className="rounded-pill block h-[7px] w-[7px] bg-current" />
            {inStock
              ? `${upGreek("Διαθέσιμο")} · ${qty} ${upGreek("τεμ.")}`
              : upGreek("Κατόπιν παραγγελίας")}
          </span>
          <span className="relative h-[5px] flex-1 overflow-hidden bg-white/12">
            <span
              className="absolute inset-y-0 left-0 bg-k-green-2"
              style={{ width: `${Math.round(stockRatio * 100)}%` }}
            />
          </span>
        </div>

        {inStock && (
          <div className="mt-3.5 flex items-center gap-3 border-l-[3px] border-k-red bg-k-red/13 px-3.5 py-2.5">
            <p className="flex-1 text-[12px] leading-[1.45] text-white/82">
              {cutoff ? (
                <>
                  Παραγγείλετε μέσα σε{" "}
                  <span className="font-mono text-[13px] font-semibold text-white">
                    {cutoff.remaining}
                  </span>{" "}
                  και φεύγει <strong className="font-semibold text-white">{cutoff.label}</strong>
                </>
              ) : (
                /* Placeholder until the client clock starts — same height, so
                   nothing shifts when the real countdown appears. */
                <span className="opacity-0">Παραγγείλετε μέσα σε 00:00:00</span>
              )}
            </p>
          </div>
        )}
      </div>

      {/*
        The B2B prompt used to sit INSIDE the dark box, squeezed beside the
        price into a 186px column. It is a different offer from this one, so it
        gets its own band under it rather than competing with the number the
        customer came for.
      */}
      <Link
        href="/eisodos"
        className="group/b2b flex items-center gap-4 border border-t-0 border-k-line bg-k-surface-2 px-5 py-3.5 transition-colors hover:bg-white"
      >
        <span className="block h-8 w-[3px] shrink-0 bg-k-red" />
        <span className="min-w-0 flex-1">
          <span className="t-account-label block text-k-text-4">
            {upGreek("Είστε επαγγελματίας;")}
          </span>
          <span className="mt-1 block text-[12.5px] leading-[1.4] font-semibold text-k-ink">
            Συνδεθείτε και δείτε την τιμή συνεργάτη σας
          </span>
        </span>
        <span className="t-card-cta shrink-0 text-k-red transition-transform group-hover/b2b:translate-x-0.5">
          {upGreek("Σύνδεση")} →
        </span>
      </Link>
    </div>
  );
}

const DAY_NAMES = [
  "την Κυριακή",
  "τη Δευτέρα",
  "την Τρίτη",
  "την Τετάρτη",
  "την Πέμπτη",
  "την Παρασκευή",
  "το Σάββατο",
];

/**
 * Warehouse cutoff is 15:00 on weekdays. Past it — or at a weekend — roll
 * forward to the next working day.
 */
function nextCutoff(now: Date): { remaining: string; label: string } {
  const target = new Date(now);
  target.setHours(15, 0, 0, 0);

  const rollForward = () => {
    target.setDate(target.getDate() + 1);
    target.setHours(15, 0, 0, 0);
  };

  if (now >= target) rollForward();
  while (target.getDay() === 0 || target.getDay() === 6) rollForward();

  const diff = Math.max(0, target.getTime() - now.getTime());
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);

  const daysAhead = Math.round(
    (new Date(target).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000,
  );
  const label =
    daysAhead === 0 ? "σήμερα" : daysAhead === 1 ? "αύριο" : DAY_NAMES[target.getDay()];

  const pad = (n: number) => String(n).padStart(2, "0");
  return { remaining: `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`, label };
}
