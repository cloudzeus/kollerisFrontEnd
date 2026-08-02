"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { addSkusToCart } from "@/lib/cart/actions";
import { upGreek } from "@/lib/greek";

/**
 * Paste a column of SKUs from a spreadsheet.
 *
 * Reports back exactly which codes were not found. Silently dropping unknown
 * codes from a 40-line paste is how an order ships short and nobody notices
 * until the site is on the phone.
 */
export function QuickOrderPaste() {
  const t = useTranslations("cart.QuickOrderPaste");
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    { added: number; notFound: string[] } | { error: string } | null
  >(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    startTransition(async () => {
      const response = await addSkusToCart({ text });
      if (response.ok) {
        setResult({ added: response.added ?? 0, notFound: response.notFound ?? [] });
        setText("");
      } else {
        setResult({
          error:
            response.error === "no_matches"
              ? t("kanenas_apo_toys_kodikoys_den")
              : t("den_itan_dynati_i_prosthiki"),
        });
      }
    });
  };

  return (
    <div className="border-b border-k-line bg-k-surface-2 px-4 py-6 lg:px-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-k-ink">
            {t("grigori_paraggelia_me_kodikoys")}
          </p>
          <p className="mt-1 text-[12px] leading-[1.5] text-k-text-3">
            {t("epikolliste_lista_kodikon_apo_to")}
          </p>
        </div>

        <form onSubmit={submit} className="flex shrink-0">
          <label htmlFor="sku-paste" className="sr-only">
            {t("kodikoi_proionton")}
          </label>
          <input
            id="sku-paste"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="001955S5, 8111250, 05028148001…"
            className="h-[46px] w-full min-w-0 border-[1.5px] border-r-0 border-k-ink px-3.5 font-mono text-[12.5px] text-k-ink outline-none lg:w-[290px]"
          />
          <button
            type="submit"
            disabled={pending || !text.trim()}
            className="t-card-cta border-0 bg-k-ink px-5 text-white transition-colors hover:bg-k-red disabled:opacity-50"
          >
            {pending ? upGreek("…") : upGreek(t("prosthiki"))}
          </button>
        </form>
      </div>

      {result && (
        <div role="status" className="mt-3 flex flex-col gap-1.5">
          {"error" in result ? (
            <p className="text-[12px] text-k-red">{result.error}</p>
          ) : (
            <>
              {result.added > 0 && (
                <p className="text-[12px] text-k-green">
                  {t("prostethikan")} {result.added}{" "}
                  {result.added === 1 ? t("kodikos") : t("kodikoi")}.
                </p>
              )}
              {result.notFound.length > 0 && (
                <p className="text-[12px] text-k-amber">
                  {t("den_vrethikan")} {result.notFound.join(", ")}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
