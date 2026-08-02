"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { useLocale } from "next-intl";
import { buyNow } from "@/lib/cart/actions";
import { upGreek } from "@/lib/greek";

/**
 * Buy now — a client LEAF taking a product id.
 *
 * Deliberately the SECONDARY action everywhere it appears. Add-to-cart is
 * still primary: most orders on a trade catalogue are several lines, and a
 * customer who buys one bit today buys six next week. This is the shortcut for
 * the single-item order, not the default path.
 *
 * There is no optimistic state and no success label — the button's success IS
 * the navigation to checkout, so anything else would flash and vanish.
 */
export function BuyNowButton({
  productId,
  quantity = 1,
  disabled = false,
  className = "",
  label,
}: {
  productId: string;
  quantity?: number;
  disabled?: boolean;
  className?: string;
  label?: string;
}) {
  const t = useTranslations("cart.BuyNowButton");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() =>
        startTransition(async () => {
          // The action redirects on success, so the only value that ever comes
          // back is a failure. Swallowed here: the customer stays put, and the
          // cart page will show whatever went wrong when they try again.
          await buyNow({ productId, quantity, locale });
        })
      }
      disabled={disabled || pending}
      className={`${className} cursor-pointer disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {pending ? "…" : (label ?? upGreek(t("agora_tora")))}
    </button>
  );
}
