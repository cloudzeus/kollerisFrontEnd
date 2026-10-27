"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useRef, useState, useTransition } from "react";
import { quoteCheckoutBreakdown } from "@/lib/checkout/breakdown-actions";
import type { CheckoutBreakdown } from "@/lib/requests/breakdown";
import type { RequestMode } from "@/lib/requests/model";
import { formatMoney } from "@/lib/format";
import { upGreek } from "@/lib/greek";
import type { Locale } from "@/i18n/routing";

/**
 * The split checkout, shared by the form and the summary beside it.
 *
 * The choice «split / together» is made in the form; the summary — a separate
 * column of the page — follows it: which lines ship now and which go as a
 * request, what is payable now and what stays indicative. Both read the same
 * server-computed breakdown (`lib/requests/checkout-breakdown`), so the option
 * card, the summary and the pay button cannot say three different amounts.
 *
 * The page prices the «now» half for the mainland zone; once the customer
 * types a Τ.Κ. the form asks the server again (`quoteCheckoutBreakdown`) and
 * the figures become the ones for that postcode. `placeOrder` prices from
 * scratch either way and is the authority.
 */

type SplitContext = {
  mode: RequestMode | null;
  setMode: (mode: RequestMode) => void;
  /** The breakdown in force: the latest postcode quote, else the page's. */
  breakdown: CheckoutBreakdown | null;
  /** Re-price for a Τ.Κ. and the methods the form shows. */
  requote: (input: { postcode: string; shippingMethod: string; paymentMethod: string }) => void;
};

const Context = createContext<SplitContext | null>(null);

export function SplitCheckoutProvider({
  breakdown: server,
  locale,
  children,
}: {
  breakdown: CheckoutBreakdown | null;
  locale: string;
  children: React.ReactNode;
}) {
  const [mode, setMode] = useState<RequestMode | null>(null);
  const [quoted, setQuoted] = useState<CheckoutBreakdown | null>(null);
  const asked = useRef<string | null>(null);
  const [, startTransition] = useTransition();

  const requote = useCallback(
    (input: { postcode: string; shippingMethod: string; paymentMethod: string }) => {
      if (!server || server.kind !== "mixed") return;
      const key = `${input.postcode}|${input.shippingMethod}|${input.paymentMethod}`;
      if (asked.current === key) return;
      asked.current = key;
      startTransition(async () => {
        const answer = await quoteCheckoutBreakdown({ ...input, locale });
        // A slower answer for a postcode or method since replaced is not this one's.
        if (asked.current !== key) return;
        setQuoted(answer);
      });
    },
    [server, locale],
  );

  /*
   * The quote holds while it was asked for the methods the page now shows; a
   * method changed since falls back to the page's figures until the form has
   * asked again.
   */
  const breakdown =
    quoted &&
    server &&
    quoted.kind === server.kind &&
    quoted.shippingMethod === server.shippingMethod &&
    quoted.paymentMethod === server.paymentMethod
      ? quoted
      : server;

  return (
    <Context.Provider value={{ mode, setMode, breakdown, requote }}>{children}</Context.Provider>
  );
}

export function useSplitCheckout(): SplitContext | null {
  return useContext(Context);
}

export type SummaryLine = {
  id: string;
  name: string;
  brandName: string | null;
  image: string | null;
  quantity: number;
  lineGross: number;
};

/**
 * The order summary of a cart with back-order lines (mixed, or all on request).
 * An ordinary cart keeps the page's own summary, untouched.
 */
export function SplitSummary({
  locale,
  lines,
  postage,
  exempt = false,
}: {
  locale: string;
  lines: SummaryLine[];
  /** The page's postage line («ACS · Αττική · 2 kg»), for the «now» part. */
  postage: string | null;
  /** Intra-EU exempt buyer: no VAT now, and the request shown net like the lines. */
  exempt?: boolean;
}) {
  const t = useTranslations("checkout.SplitCheckout");
  const split = useSplitCheckout();
  const breakdown = split?.breakdown ?? null;
  if (!breakdown) return null;

  const money = (n: number) => formatMoney(n, locale as Locale);
  const items = (count: number) => (count === 1 ? t("items_one") : t("items_other", { count }));

  // «all»: nothing can ship now, whatever was chosen.
  const mode: RequestMode | null = breakdown.kind === "all" ? "together" : (split?.mode ?? null);
  const requestIds = new Set(
    mode === "together" ? breakdown.together?.lineIds : breakdown.split?.request.lineIds,
  );
  const groups =
    mode === "together"
      ? [{ key: "together", title: t("group_together"), lines }]
      : [
          { key: "now", title: t("group_now"), lines: lines.filter((l) => !requestIds.has(l.id)) },
          { key: "request", title: t("group_request"), lines: lines.filter((l) => requestIds.has(l.id)) },
        ];

  const now = mode === "split" ? (breakdown.split?.now ?? null) : null;
  const request = mode === "split" ? (breakdown.split?.request ?? null) : mode === "together" ? breakdown.together : null;
  const pickup = breakdown.shippingMethod === "pickup";

  return (
    <>
      <div className="border-b border-k-line px-4 py-6 lg:px-8">
        <div className="flex max-h-[360px] flex-col gap-5 overflow-y-auto">
          {groups.map((group) =>
            group.lines.length === 0 ? null : (
              <section key={group.key}>
                <p
                  className={`t-account-label mb-1 flex items-center gap-2 ${
                    group.key === "now" ? "text-k-ink" : "text-k-amber"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`inline-block h-2 w-2 ${group.key === "now" ? "bg-k-ink" : "bg-k-amber"}`}
                  />
                  {upGreek(group.title)} · {items(group.lines.length)}
                </p>
                {group.lines.map((line) => (
                  <div
                    key={line.id}
                    className="flex items-center gap-3 border-b border-k-line-3 py-3 last:border-0"
                  >
                    <span className="relative flex h-[52px] w-[52px] shrink-0 items-center justify-center border border-k-line bg-k-surface-2 p-1">
                      {line.image && (
                        <Image
                          src={line.image}
                          alt=""
                          width={52}
                          height={52}
                          className="max-h-full max-w-full object-contain"
                        />
                      )}
                      <span className="rounded-pill absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center bg-k-ink px-1 font-mono text-[9.5px] font-semibold text-white">
                        {line.quantity}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="t-card-brand block text-k-red">{line.brandName ?? "—"}</span>
                      <span className="mt-0.5 block truncate text-[11.5px] font-semibold text-k-ink">
                        {line.name}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 font-mono text-[13px] font-semibold ${
                        group.key === "now" ? "text-k-ink" : "text-k-text-3"
                      }`}
                    >
                      {money(line.lineGross)}
                    </span>
                  </div>
                ))}
              </section>
            ),
          )}
        </div>
      </div>

      <div className="h-[7px] bg-[repeating-linear-gradient(135deg,#FF3333_0_9px,#1A1A1C_9px_18px)]" />
      <div className="bg-k-ink px-4 py-6 lg:px-8">
        {mode == null ? (
          <p className="text-[12.5px] leading-[1.55] text-white/70">{t("choose_mode")}</p>
        ) : (
          <>
            {now && (
              <>
                <p className="t-footer-col mb-3 text-white/50">{upGreek(t("now_title"))}</p>
                <dl className="flex flex-col gap-2.5">
                  {[
                    { k: t("kathari_axia"), v: money(now.subtotalNet) },
                    {
                      k: t("metaforika_now"),
                      v: now.unserviceable
                        ? "—"
                        : now.shippingGross === 0
                          ? upGreek(t("dorean"))
                          : money(now.shippingGross),
                    },
                    ...(now.paymentFeeGross > 0 ? [{ k: t("payment_fee"), v: money(now.paymentFeeGross) }] : []),
                    { k: t("fpa"), v: money(now.vatAmount) },
                  ].map((row) => (
                    <div key={row.k} className="flex items-baseline justify-between gap-4">
                      <dt className="text-[12.5px] text-white/55">{row.k}</dt>
                      <dd className="font-mono text-[13px] font-medium text-white">{row.v}</dd>
                    </div>
                  ))}
                </dl>
                {!pickup && (
                  <p className="mt-2.5 text-[11px] leading-[1.5] text-white/45">
                    {postage ? `${postage} — ` : ""}
                    {breakdown.postcode
                      ? t("postage_for", { postcode: breakdown.postcode })
                      : t("postage_indicative")}
                  </p>
                )}
                {now.thresholdLost && (
                  <p className="mt-1.5 text-[11px] leading-[1.5] text-white/70">{t("threshold_lost")}</p>
                )}
              </>
            )}

            <div className="mt-4 flex items-end justify-between gap-4 border-t border-white/16 pt-4">
              <div>
                <p className="t-footer-col text-white/50">{upGreek(t("payable_now"))}</p>
                <p className="t-account-label mt-1.5 text-white/40">
                  {now ? upGreek(exempt ? t("choris_fpa") : t("me_fpa")) : upGreek(t("nothing_now"))}
                </p>
              </div>
              <p className="font-mono text-[30px] leading-none font-semibold tracking-[-0.03em] text-white lg:text-[36px]">
                {money(now ? now.totalGross : 0)}
              </p>
            </div>

            {request && (
              <div className="mt-5 border-l-[3px] border-k-amber bg-white/6 px-4 py-3.5">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="t-footer-col text-white/70">{upGreek(t("on_request"))}</p>
                  <p className="font-mono text-[17px] font-semibold text-white/85">
                    {money(exempt ? request.subtotalNet : request.subtotalGross)}
                  </p>
                </div>
                <p className="mt-1.5 text-[11px] leading-[1.5] text-white/60">
                  {items(request.itemCount)} ·{" "}
                  {mode === "together" ? t("together_shipping_offer") : t("request_shipping_offer")}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
