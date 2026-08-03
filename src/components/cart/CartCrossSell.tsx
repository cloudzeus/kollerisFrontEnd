"use client";

import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import Image from "next/image";
import { useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { addToCart } from "@/lib/cart/actions";
import type { CrossSellItem } from "@/lib/cart/options";
import { formatPrice } from "@/lib/format";
import { upGreek } from "@/lib/greek";

/**
 * "Ξεχάσατε κάτι;" — items excluded from the basket server-side.
 *
 * The handoff scrolls this row horizontally; it wraps instead, per the same
 * decision taken on the PLP.
 */
export function CartCrossSell({ items }: { items: CrossSellItem[] }) {
  const locale = useLocale();
  const t = useTranslations("cart.CartCrossSell");
  const [pending, startTransition] = useTransition();

  if (items.length === 0) return null;

  return (
    <>
      <div className="h-[9px] bg-[repeating-linear-gradient(135deg,#1A1A1C_0_11px,#FF3333_11px_22px)]" />
      <section className="bg-k-ink shell-x py-6 lg:py-7">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
          <div>
            <p className="t-eyebrow mb-2.5 text-k-red">
              {upGreek(t("min_xanaparaggeilete_ayrio"))}
            </p>
            <h2 className="font-artegra text-[18px] leading-[1.2] font-medium text-white lg:text-[21px]">
              {upGreek(t("xechasate_kati_gia_ti_doyleia"))}
            </h2>
          </div>
          <p className="max-w-[330px] text-[12.5px] leading-[1.6] text-white/55 lg:text-right">
            {t("epilegmena_apo_tis_idies_katigories")}
          </p>
        </div>

        <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-4 ${pending ? "opacity-70" : ""}`}>
          {items.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-2.5 border border-white/16 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="t-badge border border-white/16 px-1.5 py-1 text-white/50">
                  {upGreek(t("proteinomeno"))}
                </span>
                <span className="t-brand-count text-white/40">{item.sku}</span>
              </div>

              <Link
                href={`/proion/${item.slug}`}
                className="flex h-[92px] items-center justify-center bg-white p-2"
              >
                {item.image ? (
                  <Image
                    src={item.image}
                    alt={item.name}
                    width={180}
                    height={92}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="t-brand-count text-k-text-5">—</span>
                )}
              </Link>

              <span className="t-card-brand text-k-red">{item.brandName ?? "—"}</span>
              <Link
                href={`/proion/${item.slug}`}
                className="flex-1 text-[11.5px] leading-[1.4] font-semibold text-white hover:text-k-red"
              >
                {item.name}
              </Link>

              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[15px] font-semibold whitespace-nowrap text-white">
                  {formatPrice(item.priceNet, locale, { vatRate: item.vatRate })}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    startTransition(async () => {
                      await addToCart({ productId: item.id, quantity: 1 });
                    })
                  }
                  className="t-card-cta h-9 border-0 bg-k-red px-3 text-white transition-colors hover:bg-white hover:text-k-ink"
                >
                  + {upGreek(t("prosthiki"))}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
