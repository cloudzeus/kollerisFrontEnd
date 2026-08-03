"use client";

import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { FREE_SHIPPING_THRESHOLD_NET, type MiniCartSummary } from "@/lib/cart/options";
import { formatMoney } from "@/lib/format";
import { upGreek } from "@/lib/greek";

/**
 * Header mini-cart.
 *
 * Contents are rendered on the server from the session cookie and passed down
 * as props — this component only owns opening and closing. Nothing is fetched
 * from the browser, so the badge and the panel are correct in the first HTML
 * byte instead of appearing after hydration.
 *
 * The trigger markup lives here rather than being passed in: `SiteHeader` is a
 * server component, and a render prop is a function — not serialisable across
 * the RSC boundary.
 *
 * Opens on hover on desktop and on click everywhere; hover alone would leave
 * the basket unreachable by keyboard and invisible on touch.
 */
export function MiniCart({
  cart,
  variant = "desktop",
}: {
  cart: MiniCartSummary | null;
  variant?: "desktop" | "mobile";
}) {
  const locale = useLocale();
  const t = useTranslations("cart.MiniCart");
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 160);
  }, [cancelClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClickOutside = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [open]);

  const count = cart?.unitCount ?? 0;
  const progress = cart
    ? Math.min(100, Math.round((cart.subtotalNet / FREE_SHIPPING_THRESHOLD_NET) * 100))
    : 0;

  return (
    <div
      ref={wrapper}
      className="relative"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t("kalathi_temachia", { count: count })}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5"
      >
        <span className="relative block">
          <Image
            src="/icons/cart.png"
            alt=""
            width={variant === "mobile" ? 21 : 23}
            height={variant === "mobile" ? 21 : 23}
            className="block"
          />
          {count > 0 && (
            <span className="rounded-pill absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center bg-k-red px-[3px] font-mono text-[9.5px] leading-4 font-semibold text-white">
              {count}
            </span>
          )}
        </span>

        {variant === "desktop" && (
          <span className="block text-left">
            <span className="t-account-label block text-k-text-4">{upGreek(t("kalathi"))}</span>
            <span className="t-account-value mt-0.5 block text-k-ink">
              {cart ? formatMoney(cart.subtotalGross, locale) : upGreek(t("adeio"))}
            </span>
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("to_kalathi_sas")}
          onMouseEnter={cancelClose}
          className="absolute top-full right-0 z-40 mt-2 w-[min(92vw,360px)] border border-k-line bg-white shadow-[0_18px_40px_rgba(0,0,0,.12)]"
        >
          <div className="flex items-baseline justify-between border-b border-k-line px-[18px] py-3.5">
            <span className="text-[11px] font-bold tracking-[0.07em] text-k-ink">
              {upGreek(t("to_kalathi_sas"))}
            </span>
            <span className="t-brand-count text-k-text-4">
              {cart ? `${cart.itemCount} ${upGreek(t("proionta"))}` : "—"}
            </span>
          </div>

          {!cart ? (
            <div className="px-[18px] py-10 text-center">
              <p className="text-[13px] text-k-text-3">{t("to_kalathi_einai_adeio")}</p>
              <Link
                href="/katalogos"
                onClick={() => setOpen(false)}
                className="t-link-mono mt-3 inline-block border-b-[1.5px] border-k-red pb-0.5 text-k-ink"
              >
                {upGreek(t("ston_katalogo"))} →
              </Link>
            </div>
          ) : (
            <>
              <div className="max-h-[280px] overflow-y-auto overscroll-contain">
                {cart.lines.map((line) => (
                  <Link
                    key={line.id}
                    href={`/proion/${line.slug}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 border-b border-k-line-3 px-[18px] py-3 transition-colors hover:bg-k-surface-2"
                  >
                    <span className="relative flex h-[52px] w-[52px] shrink-0 items-center justify-center border border-k-line bg-k-surface-2 p-1">
                      {line.image ? (
                        <Image
                          src={line.image}
                          alt=""
                          width={52}
                          height={52}
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <span className="t-brand-count text-k-text-5">—</span>
                      )}
                      <span className="rounded-pill absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center bg-k-ink px-1 font-mono text-[9.5px] font-semibold text-white">
                        {line.quantity}
                      </span>
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="t-card-brand block text-k-red">
                        {line.brandName ?? "—"}
                      </span>
                      <span className="mt-0.5 block truncate text-[11.5px] leading-[1.4] font-semibold text-k-ink">
                        {line.name}
                      </span>
                    </span>

                    <span className="shrink-0 font-mono text-[13px] font-semibold whitespace-nowrap text-k-ink">
                      {formatMoney(line.lineGross, locale)}
                    </span>
                  </Link>
                ))}

                {cart.overflow > 0 && (
                  <p className="px-[18px] py-2.5 text-[11.5px] text-k-text-4">
                    + {cart.overflow} {t("akomi_sto_kalathi")}
                  </p>
                )}
              </div>

              <div className="border-b border-k-line bg-k-surface-2 px-[18px] py-3.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[12px] text-k-text-3">{t("yposynolo")}</span>
                  <span className="font-mono text-[19px] font-semibold whitespace-nowrap text-k-ink">
                    {formatMoney(cart.subtotalGross, locale)}
                  </span>
                </div>

                <div className="relative mt-2.5 h-1.5 overflow-hidden bg-k-line">
                  <span
                    className={`absolute inset-y-0 left-0 transition-all duration-500 ${
                      cart.freeShippingReached ? "bg-k-green" : "bg-k-red"
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[10.5px] text-k-text-5">
                  {t("choris_metaforika_ypologizontai_sto_kalathi")}
                </p>
                <p className="mt-2 text-[11px] leading-[1.5] text-k-text-3">
                  {cart.freeShippingReached
                    ? t("dorean_metaforika_energa")
                    : t("akomi_gia_dorean_metaforika", { n: formatMoney(cart.freeShippingRemaining, locale) })}
                </p>
              </div>

              <div className="flex gap-2.5 px-[18px] py-3.5">
                <Link
                  href="/kalathi"
                  onClick={() => setOpen(false)}
                  className="t-card-cta flex h-11 flex-1 items-center justify-center border-[1.5px] border-k-ink text-k-ink transition-colors hover:bg-k-ink hover:text-white"
                >
                  {upGreek(t("kalathi"))}
                </Link>
                <Link
                  href="/checkout"
                  onClick={() => setOpen(false)}
                  className="t-card-cta flex h-11 flex-1 items-center justify-center bg-k-red text-white transition-colors hover:bg-k-red-hover"
                >
                  {upGreek(t("oloklirosi"))} →
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
