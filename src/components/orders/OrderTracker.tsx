"use client";

import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useActionState } from "react";
import { trackOrder, type TrackState } from "@/lib/orders/lookup";
import { formatMoney } from "@/lib/format";
import { upGreek } from "@/lib/greek";

/**
 * Order lookup + status timeline.
 *
 * One server action, one form. The result replaces the form rather than
 * appearing under it — someone who has just found their order does not need the
 * lookup fields any more, and a "search again" link is one tap when they do.
 */
export function OrderTracker({ initialOrderNumber }: { initialOrderNumber?: string }) {
  const t = useTranslations("orders.OrderTracker");
  const [state, action, pending] = useActionState<TrackState, FormData>(trackOrder, {
    state: "idle",
  });

  if (state.state === "found") {
    return <Result order={state.order} />;
  }

  return (
    <form action={action} className="max-w-xl">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="t-account-label mb-1.5 block text-k-text-4">
            {upGreek(t("arithmos_paraggelias"))}
            <span className="ml-1 text-k-red">*</span>
          </span>
          <input
            name="orderNumber"
            required
            defaultValue={initialOrderNumber}
            placeholder="KOL-20260731-0007"
            autoComplete="off"
            className="t-input h-12 w-full border border-k-line-2 px-3.5 font-mono text-k-ink outline-none focus:border-k-ink"
          />
        </label>

        <label className="block">
          <span className="t-account-label mb-1.5 block text-k-text-4">
            {upGreek(t("email_paraggelias"))}
            <span className="ml-1 text-k-red">*</span>
          </span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="t-input h-12 w-full border border-k-line-2 px-3.5 text-k-ink outline-none focus:border-k-ink"
          />
        </label>
      </div>

      {state.state === "error" && (
        <p
          role="alert"
          className="mt-4 border-l-[3px] border-k-red bg-k-red/8 px-4 py-3 text-[13px] leading-[1.55] text-k-ink"
        >
          {state.message}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="t-btn h-13 bg-k-red px-9 py-4 text-white transition-colors hover:bg-k-red-hover disabled:opacity-60"
        >
          {pending ? "…" : upGreek(t("entopismos"))}
        </button>
        <p className="text-[12px] leading-[1.55] text-k-text-4">
          {t("o_arithmos_einai_sto_email")}
        </p>
      </div>
    </form>
  );
}

function Result({ order }: { order: Extract<TrackState, { state: "found" }>["order"] }) {
  const locale = useLocale();
  const t = useTranslations("orders.OrderTracker");
  const halted = order.status === "CANCELLED" || order.status === "FAILED";
  const date = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(locale, {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : null;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-5 border border-k-line bg-white p-5 lg:p-6">
        <div className="min-w-0">
          <p className="t-account-label text-k-text-4">{upGreek(t("paraggelia"))}</p>
          <p className="mt-1 font-mono text-[19px] leading-none font-semibold text-k-ink lg:text-[23px]">
            {order.orderNumber}
          </p>
          <p className="t-brand-count mt-2 text-k-text-4">
            {date(order.placedAt)} · {order.itemCount} {upGreek(t("tem"))} ·{" "}
            {formatMoney(order.totalGross, locale)}
          </p>
        </div>

        <div className="text-right">
          <p
            className={`t-card-stock flex items-center justify-end gap-2 ${
              halted ? "text-k-red" : order.status === "DELIVERED" ? "text-k-green" : "text-k-amber"
            }`}
          >
            <span aria-hidden className="rounded-pill block h-2 w-2 bg-current" />
            {upGreek(order.statusLabel)}
          </p>
          <p className="t-brand-count mt-2 text-k-text-4">
            {order.shippingMethod} · {order.paymentLabel}
          </p>
        </div>
      </div>

      {halted ? (
        <p className="mt-px border border-t-0 border-k-line bg-k-surface-2 px-5 py-5 text-[13px] leading-[1.65] text-k-text-2 lg:px-6">
          {order.status === "CANCELLED"
            ? t("i_paraggelia_akyrothike_an_den")
            : t("i_pliromi_den_oloklirothike_mporeite")}
        </p>
      ) : (
        <ol className="mt-px grid gap-px border border-t-0 border-k-line bg-k-line sm:grid-cols-2 lg:grid-cols-4">
          {order.steps.map((step) => (
            <li key={step.status} className="flex flex-col gap-2 bg-white p-4 lg:p-5">
              <span
                aria-hidden
                className={`block h-1.5 w-full ${
                  step.done ? "bg-k-green" : step.current ? "bg-k-red" : "bg-k-line-2"
                }`}
              />
              <span
                className={`text-[13px] leading-[1.3] font-semibold ${
                  step.done || step.current ? "text-k-ink" : "text-k-text-5"
                }`}
              >
                {step.label}
              </span>
              <span className="t-brand-count text-k-text-4">
                {step.at ? date(step.at) : step.current ? upGreek(t("se_exelixi")) : "—"}
              </span>
            </li>
          ))}
        </ol>
      )}

      {order.voucher && (
        <div className="mt-px flex flex-wrap items-center justify-between gap-4 border border-t-0 border-k-line bg-k-surface-2 px-5 py-4 lg:px-6">
          <div className="min-w-0">
            <p className="t-account-label text-k-text-4">{upGreek(t("arithmos_apostolis_acs"))}</p>
            <p className="mt-1 font-mono text-[14px] font-semibold text-k-ink">{order.voucher}</p>
          </div>
          <a
            href={`https://www.acscourier.net/el/track-and-trace/?paramtracknr=${encodeURIComponent(order.voucher)}`}
            target="_blank"
            rel="noreferrer"
            className="t-btn-sm bg-k-ink px-6 py-3.5 text-white transition-colors hover:bg-k-red"
          >
            {upGreek(t("parakoloythisi_stin_acs"))} →
          </a>
        </div>
      )}

      {order.lines.length > 0 && (
        <ul className="mt-px border border-t-0 border-k-line bg-white">
          {order.lines.map((line) => (
            <li
              key={line.sku}
              className="flex items-center gap-4 border-b border-k-line px-5 py-3 last:border-b-0 lg:px-6"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center border border-k-line bg-white p-1">
                {line.image ? (
                  <Image
                    src={line.image}
                    alt=""
                    width={64}
                    height={64}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="t-brand-count text-k-text-5">—</span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium text-k-ink">
                  {line.name}
                </span>
                <span className="t-card-sku mt-0.5 block text-k-text-4">{line.sku}</span>
              </span>
              <span className="t-brand-count shrink-0 font-mono text-k-ink">×{line.quantity}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-5 text-[12.5px] text-k-text-3">
        {t("kati_den_paei_kala")}{" "}
        <a href="tel:+302104111355" className="font-semibold text-k-ink underline underline-offset-4">
          210 411 1355
        </a>{" "}
        ·{" "}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="cursor-pointer font-semibold text-k-ink underline underline-offset-4"
        >
          {t("alli_paraggelia")}
        </button>
      </p>
    </div>
  );
}
