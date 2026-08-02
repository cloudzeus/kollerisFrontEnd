"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { addToCart } from "@/lib/cart/actions";
import { upGreek } from "@/lib/greek";

/**
 * Add-to-cart, shared by the product card, the quick view and the PDP.
 *
 * Shows a short confirmation in place of the label rather than a toast: the
 * feedback belongs where the click happened, especially in a grid where a
 * corner toast gives no clue which of forty cards responded.
 */
export function AddToCartButton({
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
  const t = useTranslations("cart.AddToCartButton");
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<"idle" | "done" | "error">("idle");

  const add = () => {
    startTransition(async () => {
      const result = await addToCart({ productId, quantity });
      setState(result.ok ? "done" : "error");
      setTimeout(() => setState("idle"), 2200);
    });
  };

  return (
    <button
      type="button"
      onClick={add}
      disabled={disabled || pending}
      aria-live="polite"
      className={`${className} disabled:opacity-60`}
    >
      {state === "done"
        ? `✓ ${upGreek(t("sto_kalathi"))}`
        : state === "error"
          ? upGreek(t("dokimaste_xana"))
          : pending
            ? "…"
            : (label ?? upGreek(t("sto_kalathi")))}
    </button>
  );
}
