import { useTranslations } from "next-intl";
import { getLocale } from "next-intl/server";
import { MobileFilterSheet } from "@/components/plp/MobileFilterSheet";
import { Link } from "@/i18n/navigation";
import {
  PER_PAGE_OPTIONS,
  PER_ROW_OPTIONS,
  SORT_OPTIONS,
  type PlpFacets,
} from "@/lib/catalog/plp-options";
import {
  setParamHref,
  setParamKeepingPage,
  toggleMultiHref,
  type RawParams,
} from "@/lib/catalog/filter-href";
import { upGreek } from "@/lib/greek";

/**
 * Result count, active-filter chips, density and sort — a SERVER component.
 *
 * Chips and density controls are links; sort is a `<form method="get">` that
 * submits on change through a tiny client leaf. Nothing else here hydrates.
 *
 * Chips are derived from the facets rather than read straight from the URL, so
 * a stale slug can never render as a chip nobody can identify.
 */
export async function PlpToolbar({
  total,
  facets,
  perRow,
  basePath,
  params,
}: {
  total: number;
  facets: PlpFacets;
  perRow: number;
  basePath: string;
  params: RawParams;
}) {
  const locale = await getLocale();
  const t = useTranslations("plp.PlpToolbar");
  const chips: Array<{ label: string; href: string }> = [
    ...facets.subcategories
      .filter((s) => s.active)
      .map((s) => ({
        label: s.label,
        href: toggleMultiHref(basePath, params, "sub", s.slug),
      })),
    ...facets.brands
      .filter((b) => b.active)
      .map((b) => ({
        label: b.label,
        href: toggleMultiHref(basePath, params, "brand", b.slug),
      })),
  ];

  if (params.avail === "in-stock") {
    chips.push({
      label: t("amesa_diathesima"),
      href: setParamHref(basePath, params, "avail", null),
    });
  }
  if (params.sale === "1") {
    chips.push({ label: t("se_prosfora"), href: setParamHref(basePath, params, "sale", null) });
  }
  if (params.new === "1") {
    chips.push({ label: t("nea"), href: setParamHref(basePath, params, "new", null) });
  }
  if (params.min != null || params.max != null) {
    const withoutMin = setParamHref(basePath, params, "min", null);
    chips.push({
      label: `${params.min ?? "0"} – ${params.max ?? "∞"} €`,
      // Clearing a price band must drop both ends, not just one.
      href: setParamHref(basePath, { ...params, min: undefined }, "max", null) || withoutMin,
    });
  }

  const sort = (Array.isArray(params.sort) ? params.sort[0] : params.sort) ?? "relevance";
  const perPage = Number(Array.isArray(params.perPage) ? params.perPage[0] : params.perPage) || 24;

  return (
    <div className="border-b border-k-line bg-white">
      <div className="shell-x flex flex-col gap-3 py-3 lg:min-h-[74px] lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <MobileFilterSheet facets={facets} total={total} basePath={basePath} params={params} />
          <span className="shrink-0 text-[13px] font-semibold whitespace-nowrap text-k-ink">
            {total.toLocaleString(locale)} {t("proionta")}
          </span>

          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {chips.map((chip) => (
              <Link
                key={chip.label}
                href={chip.href}
                scroll={false}
                className="flex items-center gap-2 bg-k-ink px-2.5 py-[7px] text-[10px] font-semibold tracking-[0.05em] whitespace-nowrap text-white transition-colors hover:bg-k-red"
              >
                {chip.label}
                <span className="text-k-red">✕</span>
              </Link>
            ))}
            {chips.length > 0 && (
              <Link
                href={basePath}
                className="px-1 text-[10px] font-semibold tracking-[0.05em] whitespace-nowrap text-k-red"
              >
                {upGreek(t("katharismos_olon"))}
              </Link>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <div className="hidden items-center gap-2 xl:flex">
            <span className="t-stat-label text-k-text-4">{upGreek(t("ana_grammi"))}</span>
            <div className="flex border border-k-line-2">
              {PER_ROW_OPTIONS.map((n) => (
                <Link
                  key={n}
                  href={setParamKeepingPage(basePath, params, "perRow", String(n))}
                  scroll={false}
                  className={`flex h-[30px] w-[30px] items-center justify-center text-[11px] font-semibold transition-colors ${
                    perRow === n ? "bg-k-ink text-white" : "text-k-text-2 hover:text-k-ink"
                  }`}
                >
                  {n}
                </Link>
              ))}
            </div>
          </div>

          <div className="hidden items-center gap-2 lg:flex">
            <span className="t-stat-label text-k-text-4">{upGreek(t("proionta_2"))}</span>
            <div className="flex border border-k-line-2">
              {PER_PAGE_OPTIONS.map((n) => (
                <Link
                  key={n}
                  href={setParamHref(basePath, params, "perPage", String(n))}
                  scroll={false}
                  className={`flex h-[30px] items-center px-2.5 text-[11px] font-semibold transition-colors ${
                    perPage === n ? "bg-k-ink text-white" : "text-k-text-2 hover:text-k-ink"
                  }`}
                >
                  {n}
                </Link>
              ))}
            </div>
          </div>

          {/*
            A GET form: selecting a sort submits and the server re-renders.
            Works without JavaScript; the client leaf only removes the extra
            click on the submit button.
          */}
          <form action={basePath} method="get" className="flex items-center gap-2">
            {Object.entries(params)
              .filter(([key]) => key !== "sort" && key !== "page")
              .map(([key, value]) =>
                value == null ? null : (
                  <input
                    key={key}
                    type="hidden"
                    name={key}
                    value={Array.isArray(value) ? value.join(",") : value}
                  />
                ),
              )}
            <label htmlFor="sort" className="sr-only">
              {t("taxinomisi")}
            </label>
            <select
              id="sort"
              name="sort"
              defaultValue={sort}
              className="h-[38px] border border-k-line-2 bg-white px-3 text-[11px] font-semibold tracking-[0.05em] text-k-ink outline-none"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="t-card-cta h-[38px] border border-k-line-2 px-3 text-k-text-2 transition-colors hover:border-k-ink hover:text-k-ink"
            >
              OK
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
