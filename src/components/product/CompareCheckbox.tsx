"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toggleCompare } from "@/lib/compare/actions";
import { upGreek } from "@/lib/greek";

/**
 * Compare toggle on a product card — a client LEAF taking three plain props.
 *
 * `selected` and `disabled` are computed on the server from the selection
 * cookie, so the whole grid reflects the tray without the browser holding any
 * state. The action re-renders the layout, which is what flips every other
 * card's `disabled` the moment a different classification is locked in.
 *
 * Unlike the quick-view bar this stays visible on touch: the tray is the only
 * way to reach the compare page, and a hover-only entry point would hide the
 * feature entirely on mobile.
 */
export function CompareCheckbox({
  slug,
  selected,
  disabled = false,
  className = "",
}: {
  slug: string;
  selected: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations("product.CompareCheckbox");
  const [pending, startTransition] = useTransition();
  const [refused, setRefused] = useState<"full" | "wrong_scope" | null>(null);

  const toggle = () => {
    setRefused(null);
    startTransition(async () => {
      const result = await toggleCompare({ slug });
      if (!result.ok && (result.error === "full" || result.error === "wrong_scope")) {
        setRefused(result.error);
        setTimeout(() => setRefused(null), 2600);
      }
    });
  };

  // The server already knows this pick is not allowed; say why on the button
  // rather than in a toast the customer has to go looking for.
  const title = refused
    ? refused === "full"
      ? t("i_sygkrisi_choraei_4_proionta")
      : t("mono_proionta_tis_idias_katigorias")
    : disabled
      ? t("mono_proionta_tis_idias_katigorias_2")
      : selected
        ? t("afairesi_apo_ti_sygkrisi")
        : t("prosthiki_sti_sygkrisi");

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled || pending}
      aria-pressed={selected}
      title={title}
      className={`t-brand-count flex items-center gap-1.5 border px-1.5 py-1 transition-colors lg:px-2 ${
        selected
          ? "border-k-red bg-k-red text-white"
          : refused
            ? "border-k-amber bg-white text-k-amber"
            : "border-k-line-2 bg-white/92 text-k-text-3 hover:border-k-ink hover:text-k-ink"
      } disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
    >
      <span
        aria-hidden
        className={`flex h-3 w-3 shrink-0 items-center justify-center border text-[9px] leading-none ${
          selected ? "border-white bg-white text-k-red" : "border-current"
        }`}
      >
        {selected ? "✓" : ""}
      </span>
      {refused === "full"
        ? upGreek(t("eos_4"))
        : refused === "wrong_scope"
          ? upGreek(t("alli_kat"))
          : upGreek(t("sygkrisi"))}
    </button>
  );
}
