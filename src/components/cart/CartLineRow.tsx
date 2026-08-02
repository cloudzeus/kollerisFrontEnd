"use client";

import { useTranslations } from "next-intl";
import Image from "next/image";
import { useOptimistic, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { removeCartLine, updateCartLine } from "@/lib/cart/actions";
import type { CartLineView } from "@/lib/cart/options";
import { formatPrice } from "@/lib/format";
import { upGreek } from "@/lib/greek";

/**
 * One cart line.
 *
 * The quantity number is optimistic so +/- feels instant, but every *amount*
 * comes from the server render. Doing optimistic maths on totals is where VAT
 * and the free-shipping threshold go wrong: the bar would cross at a number the
 * server then disagrees with. The spec calls this out explicitly.
 */
export function CartLineRow({ line }: { line: CartLineView }) {
  const t = useTranslations("cart.CartLineRow");
  const [pending, startTransition] = useTransition();
  const [optimisticQty, setOptimisticQty] = useOptimistic(line.quantity);

  const setQuantity = (next: number) => {
    if (next < 0 || next > 999) return;
    startTransition(async () => {
      setOptimisticQty(next);
      await updateCartLine({ lineId: line.id, quantity: next });
    });
  };

  const remove = () => {
    startTransition(async () => {
      setOptimisticQty(0);
      await removeCartLine(line.id);
    });
  };

  const ctx = { vatRate: line.vatRate };

  return (
    <div
      className={`grid gap-4 border-b border-k-line px-4 py-5 transition-opacity lg:grid-cols-[1fr_150px_150px_140px_52px] lg:items-center lg:gap-5 lg:px-10 lg:py-[22px] ${
        pending ? "opacity-60" : ""
      }`}
    >
      {/* Product */}
      <div className="flex min-w-0 gap-4 lg:gap-[18px]">
        <span className="flex h-20 w-20 shrink-0 items-center justify-center border border-k-line bg-k-surface-2 p-2 lg:h-24 lg:w-24">
          {line.image ? (
            <Image
              src={line.image}
              alt={line.name}
              width={96}
              height={96}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="t-brand-count text-k-text-5">—</span>
          )}
        </span>

        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="flex items-baseline gap-2.5">
            <span className="t-card-brand text-k-red">{line.brandName ?? "—"}</span>
            <span className="t-card-sku text-k-text-4">{line.sku}</span>
          </span>

          <Link
            href={`/proion/${line.slug}`}
            className="text-[13.5px] leading-[1.4] font-semibold text-k-ink hover:text-k-red"
          >
            {line.name}
          </Link>

          <span
            className={`t-card-stock flex items-center gap-[7px] ${
              line.inStock ? "text-k-green" : "text-k-amber"
            }`}
          >
            <span className="rounded-pill block h-1.5 w-1.5 bg-current" />
            {line.inStock
              ? `${upGreek(t("amesa_diathesimo"))} · ${line.availableQty} ${upGreek(t("tem"))}`
              : upGreek(t("katopin_paraggelias"))}
          </span>

          {/* Only shown when the basket actually exceeds stock. */}
          {line.overStock && (
            <span className="t-badge self-start bg-k-amber px-2 py-1 text-white">
              {upGreek(t("diathesima_ta_ypoloipa_katopin_paraggelias", { availableQty: line.availableQty }))}
            </span>
          )}
        </div>
      </div>

      {/* Unit price */}
      <div className="lg:text-right">
        <span className="t-account-label mb-1 block text-k-text-4 lg:hidden">
          {upGreek(t("timi_monadas"))}
        </span>
        {line.unitListNet != null && (
          <span className="t-card-was block whitespace-nowrap text-k-text-5 line-through">
            {formatPrice(line.unitListNet, ctx)}
          </span>
        )}
        <span className="block font-mono text-[15px] font-semibold whitespace-nowrap text-k-ink">
          {formatPrice(line.unitNet, ctx)}
        </span>
        <span className="t-card-vat mt-0.5 block text-k-text-5">
          {upGreek(t("me_fpa", { vatRate: line.vatRate }))}
        </span>
      </div>

      {/* Quantity */}
      <div className="flex items-center gap-4 lg:justify-center">
        <span className="t-account-label text-k-text-4 lg:hidden">
          {upGreek(t("posotita"))}
        </span>
        <div className="flex border border-k-line-2">
          <button
            type="button"
            onClick={() => setQuantity(optimisticQty - 1)}
            disabled={optimisticQty <= 1}
            aria-label={t("meiosi_posotitas")}
            className="h-11 w-[38px] border-0 bg-white text-[17px] text-k-ink disabled:text-k-text-5"
          >
            −
          </button>
          <span
            aria-live="polite"
            className="flex h-11 w-11 items-center justify-center border-x border-k-line-2 font-mono text-sm font-semibold text-k-ink"
          >
            {optimisticQty}
          </span>
          <button
            type="button"
            onClick={() => setQuantity(optimisticQty + 1)}
            aria-label={t("ayxisi_posotitas")}
            className="h-11 w-[38px] border-0 bg-white text-[17px] text-k-ink"
          >
            +
          </button>
        </div>
      </div>

      {/* Line total */}
      <div className="flex items-center justify-between lg:block lg:text-right">
        <span className="t-account-label text-k-text-4 lg:hidden">{upGreek(t("synolo"))}</span>
        <span className="font-mono text-[19px] font-semibold whitespace-nowrap text-k-ink">
          {formatPrice(line.unitNet * optimisticQty, ctx)}
        </span>
      </div>

      {/* Remove */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={remove}
          aria-label={t("afairesi", { name: line.name })}
          className="flex h-11 w-11 items-center justify-center border border-k-line bg-white text-k-text-4 transition-colors hover:border-k-red hover:text-k-red"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
