"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { clearCart } from "@/lib/cart/actions";
import { upGreek } from "@/lib/greek";

/**
 * "Continue shopping" / "Empty cart".
 *
 * Emptying asks first — it is the one action here that cannot be undone, and a
 * misclick loses a basket someone spent ten minutes assembling.
 */
export function CartActionsRow() {
  const t = useTranslations("cart.CartActionsRow");
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3 border-b border-k-line px-4 py-6 sm:flex-row sm:items-center sm:justify-between lg:px-10">
      <Link
        href="/katalogos"
        className="t-link-mono flex items-center gap-2 text-k-ink hover:text-k-red"
      >
        ‹ {upGreek(t("synechiste_tis_agores"))}
      </Link>

      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(t("na_adeiasei_to_kalathi"))) return;
          startTransition(async () => {
            await clearCart();
          });
        }}
        className="t-link-mono self-start text-k-text-4 transition-colors hover:text-k-red disabled:opacity-50"
      >
        ✕ {upGreek(t("adeiasma_kalathioy"))}
      </button>
    </div>
  );
}
