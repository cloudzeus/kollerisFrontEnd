"use client";

import { useTranslations } from "next-intl";
import { useQuickView } from "@/components/product/QuickViewProvider";
import { upGreek } from "@/lib/greek";

/**
 * Quick-view button — a client LEAF taking a single string prop.
 *
 * Hidden below `lg`: on touch there is no hover, and a bar that only appears
 * after a tap competes with the card's own link.
 */
export function QuickViewTrigger({ slug }: { slug: string }) {
  const t = useTranslations("product.QuickViewTrigger");
  const quickView = useQuickView();

  return (
    <button
      type="button"
      data-card-quickview
      onClick={() => quickView.open(slug)}
      className="t-card-cta absolute inset-x-0 bottom-0 hidden h-10 w-full items-center justify-center gap-2 bg-k-ink/92 text-white opacity-0 transition-colors group-focus-within:opacity-100 hover:bg-k-red lg:flex"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9">
        <path d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6-10-6-10-6Z" />
        <circle cx="12" cy="12" r="2.6" />
      </svg>
      {upGreek(t("grigori_provoli"))}
    </button>
  );
}
