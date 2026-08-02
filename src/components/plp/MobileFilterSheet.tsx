"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { FilterSidebar } from "@/components/plp/FilterSidebar";
import type { RawParams } from "@/lib/catalog/filter-href";
import type { PlpFacets } from "@/lib/catalog/plp-options";
import { upGreek } from "@/lib/greek";

/**
 * Mobile filter access.
 *
 * A client SHELL around a server-rendered sidebar: this component owns nothing
 * but the open/closed flag and the scroll lock. `FilterSidebar` is a server
 * component passed in as `children` from the toolbar — its markup and every
 * facet count are rendered on the server and never re-rendered here.
 *
 * Without this the whole facet set would be unreachable on a phone: the desktop
 * sidebar is `hidden` below `lg`.
 */
export function MobileFilterSheet({
  facets,
  total,
  basePath,
  params,
}: {
  facets: PlpFacets;
  total: number;
  basePath: string;
  params: RawParams;
}) {
  const t = useTranslations("plp.MobileFilterSheet");
  const [open, setOpen] = useState(false);

  const activeCount =
    facets.subcategories.filter((s) => s.active).length +
    facets.brands.filter((b) => b.active).length +
    (facets.availability.find((a) => a.slug === "in-stock")?.active ? 1 : 0) +
    (params.min != null || params.max != null ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className="t-btn-sm flex h-11 items-center gap-2 border-[1.5px] border-k-ink px-4 text-k-ink lg:hidden"
      >
        {upGreek(t("filtra"))}
        {activeCount > 0 && (
          <span className="t-brand-count bg-k-red px-1.5 py-0.5 text-white">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={t("kleisimo_filtron")}
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/50"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("filtra")}
            className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col bg-white"
          >
            <FilterSidebar
              facets={facets}
              basePath={basePath}
              params={params}
              className="flex min-h-0 flex-1 flex-col"
            />

            <div className="shrink-0 border-t border-k-line p-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="t-btn h-12 w-full bg-k-red text-white"
              >
                {upGreek(`Εμφάνιση ${total.toLocaleString("el-GR")} προϊόντων`)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
