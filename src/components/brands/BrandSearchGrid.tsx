"use client";

import { useTranslations } from "next-intl";
import Image from "next/image";
import { useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import type { BrandListItem } from "@/lib/catalog/brands";
import { searchKey, upGreek } from "@/lib/greek";

/**
 * "Όλα τα brands με απόθεμα" plus its find-box.
 *
 * Filtering is client-side on purpose: the in-stock list is small enough to
 * ship whole, and a server round-trip per keystroke would be slower and noisier
 * than the filter is worth. `searchKey` means "knip" finds ΚΝΙΠΕΞ and "wera"
 * finds Wera regardless of accents or case.
 */
export function BrandSearchGrid({ brands }: { brands: BrandListItem[] }) {
  const t = useTranslations("brands.BrandSearchGrid");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return brands;
    const key = searchKey(query);
    return brands.filter((b) => searchKey(b.name).includes(key));
  }, [brands, query]);

  return (
    <>
      <div className="shell-x flex flex-col gap-4 border-y border-k-line bg-k-surface-2 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-11 w-full border-[1.5px] border-k-ink bg-white sm:w-[340px]">
            <span className="flex items-center pr-2.5 pl-3.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8A8A8E" strokeWidth="2.4">
                <circle cx="10.5" cy="10.5" r="7" />
                <line x1="15.8" y1="15.8" x2="22" y2="22" />
              </svg>
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("vreite_brand_p_ch_knip")}
              aria-label={t("anazitisi_brand")}
              className="t-input min-w-0 flex-1 border-0 bg-transparent pr-2 text-k-ink outline-none placeholder:text-k-text-4"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("katharismos")}
                className="px-3 text-k-text-4 hover:text-k-ink"
              >
                ✕
              </button>
            )}
          </div>
          <span className="t-nav-sub whitespace-nowrap text-k-text-4">
            {filtered.length === brands.length
              ? upGreek(`${brands.length} brands`)
              : upGreek(`${filtered.length} από ${brands.length}`)}
          </span>
        </div>

        <p className="flex items-center gap-2.5 text-[12.5px] text-k-text-3">
          <span className="block h-[7px] w-[7px] bg-k-red" />
          {t("episimi_antiprosopeysi")}
          <span className="mx-1.5 block h-[18px] w-px bg-k-line" />
          {t("taxinomisi_kata_plithos_kodikon")}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="shell-x py-16 text-center">
          <p className="font-artegra text-xl leading-[1.3] text-k-ink">
            {upGreek(t("den_vrethike_brand"))}
          </p>
          <p className="mx-auto mt-2.5 max-w-md text-[13.5px] text-k-text-3">
            {t("antiprosopeyoyme_polla_akomi_brands_kai")}
          </p>
          <a
            href="tel:+302104111355"
            className="t-btn-sm mt-5 inline-block bg-k-ink px-7 py-4 text-white transition-colors hover:bg-k-red"
          >
            {t("t_210_411_1355")}
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-px border border-k-line bg-k-line sm:grid-cols-3 lg:grid-cols-6">
          {filtered.map((brand) => (
            <Link
              key={brand.id}
              href={`/brands/${brand.slug}`}
              className="group flex min-h-[132px] flex-col gap-2 bg-white p-4 transition-colors hover:bg-k-surface-2"
            >
              <span className="flex items-center gap-[7px]">
                <span
                  className={`rounded-pill block h-1.5 w-1.5 ${
                    brand.inStockCount > 0 ? "bg-k-green" : "bg-k-text-5"
                  }`}
                />
                <span className="t-brand-count text-k-text-4">
                  {brand.inStockCount > 0 ? upGreek(t("se_apothema")) : upGreek(t("katopin"))}
                </span>
              </span>

              <span className="flex flex-1 items-center">
                {brand.logo ? (
                  <Image
                    src={brand.logo}
                    alt={brand.name}
                    width={160}
                    height={160}
                    className="block h-14 w-14 object-contain"
                  />
                ) : (
                  <span className="t-brand-name text-k-ink">{brand.name}</span>
                )}
              </span>

              <span className="t-brand-name block text-k-ink">{brand.name}</span>

              <span className="flex items-baseline gap-1.5">
                <span className="font-mono text-[13px] font-semibold text-k-ink">
                  {brand.productCount.toLocaleString("el-GR")}
                </span>
                <span className="t-brand-count text-k-text-5">{upGreek(t("kod"))}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
