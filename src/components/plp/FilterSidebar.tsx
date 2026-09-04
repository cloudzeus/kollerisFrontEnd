import type { Locale } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  PRICE_BANDS,
  type FacetItem,
  type PlpFacets,
} from "@/lib/catalog/plp-options";
import {
  isPriceBandActive,
  priceHref,
  setParamHref,
  toggleMultiHref,
  type RawParams,
} from "@/lib/catalog/filter-href";
import { formatPrice } from "@/lib/format";
import { upGreek } from "@/lib/greek";

/**
 * Faceted filters — a SERVER component.
 *
 * Every control is a plain `<a>` whose href is computed from the current
 * `searchParams`, and every group is a native `<details>`. There is no state to
 * hydrate, no `router.push`, and no JavaScript shipped: the browser navigates,
 * the server re-renders, the counts come back correct. The brand find-box is
 * the one genuinely interactive control, and it is isolated in its own client
 * leaf (`BrandFilterSearch`).
 */
export function FilterSidebar({
  facets,
  basePath,
  params,
  locale,
  className = "",
}: {
  facets: PlpFacets;
  basePath: string;
  params: RawParams;
  /*
   * A prop rather than `getLocale()`, because `MobileFilterSheet` is a client
   * component and renders this one — an async server component cannot be
   * rendered from the client, so the locale has to arrive as data.
   */
  locale: Locale;
  className?: string;
}) {
  const t = useTranslations("plp.FilterSidebar");
  const activeSubs = facets.subcategories.filter((s) => s.active).length;
  const activeBrands = facets.brands.filter((b) => b.active).length;
  const priceActive = params.min != null || params.max != null;
  const flagCount = (params.sale ? 1 : 0) + (params.new ? 1 : 0);

  return (
    <aside className={className}>
      <div className="flex shrink-0 items-center justify-between bg-k-ink px-[22px] py-4">
        <span className="text-[11.5px] font-bold tracking-[0.09em] text-white">
          {upGreek(t("filtra"))}
        </span>
        <Link href={basePath} className="t-card-cta text-white/60 hover:text-k-red" prefetch={false}>
          {upGreek(t("katharismos"))}
        </Link>
      </div>

      <div className="scroll-slim flex-1 overflow-y-auto">
        {facets.subcategories.length > 0 && (
          <Group title={t("ypokatigoria")} badge={activeSubs} defaultOpen>
            {/* Κόκκινο μόνο στις υποκατηγορίες — το ίδιο με το όνομα μάρκας
                στην κάρτα, ώστε να μην μπει τρίτη απόχρωση στη σελίδα. Τα
                brands από κάτω μένουν γκρι: αν βάφονταν όλα, δεν θα ξεχώριζε
                τίποτα. */}
            <CheckList
              items={facets.subcategories}
              hrefFor={(slug) => toggleMultiHref(basePath, params, "sub", slug)}
              countClassName="text-k-red"
            />
          </Group>
        )}

        {facets.brands.length > 0 && (
          <Group title="Brand" badge={activeBrands} defaultOpen>
            <CheckList
              items={facets.brands}
              hrefFor={(slug) => toggleMultiHref(basePath, params, "brand", slug)}
            />
          </Group>
        )}

        <Group title={t("timi")} badge={priceActive ? 1 : 0} defaultOpen>
          <div className="flex flex-wrap gap-1.5">
            {PRICE_BANDS.map((band) => {
              const active = isPriceBandActive(params, band);
              return (
                <Link
                  key={band.label}
                  href={priceHref(basePath, params, band, active)}
                  scroll={false}
                  className={`border px-2.5 py-1.5 text-[10.5px] font-medium transition-colors ${
                    active
                      ? "border-k-ink bg-k-ink text-white"
                      : "border-k-line-2 text-k-text-2 hover:border-k-ink"
                  }`}
                 prefetch={false}>
                  {band.label}
                </Link>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-k-text-4">
            {t("eyros_katalogoy")} {formatPrice(facets.priceBounds.min, locale, { vatRate: 24 })} —{" "}
            {formatPrice(facets.priceBounds.max, locale, { vatRate: 24 })}
          </p>
        </Group>

        <Group title={t("diathesimotita")} badge={params.avail ? 1 : 0} defaultOpen>
          <div className="flex flex-col gap-0.5">
            {facets.availability.map((item) => (
              <Link
                key={item.slug}
                href={setParamHref(
                  basePath,
                  params,
                  "avail",
                  item.slug === "in-stock" ? "in-stock" : null,
                )}
                scroll={false}
                className="flex min-h-[34px] items-center gap-2.5 py-1"
               prefetch={false}>
                <span
                  className={`rounded-pill block h-3.5 w-3.5 shrink-0 border ${
                    item.active ? "border-[5px] border-k-red" : "border-k-line-2"
                  }`}
                />
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-k-ink">
                  {item.label}
                </span>
                <span className="t-brand-count text-k-text-4">{item.count}</span>
              </Link>
            ))}
          </div>
        </Group>

        <Group title={t("eidika_filtra")} badge={flagCount} defaultOpen>
          <div className="flex flex-col gap-2.5">
            {(
              [
                { key: "sale", label: t("se_prosfora"), count: facets.flags.sale },
                { key: "new", label: t("nea_proionta"), count: facets.flags.isNew },
              ] as const
            ).map((flag) => {
              const active = params[flag.key] === "1";
              return (
                <Link
                  key={flag.key}
                  href={setParamHref(basePath, params, flag.key, active ? null : "1")}
                  scroll={false}
                  role="switch"
                  aria-checked={active}
                  className="flex min-h-[34px] items-center gap-3"
                 prefetch={false}>
                  <span
                    className={`rounded-pill relative block h-[18px] w-8 shrink-0 transition-colors ${
                      active ? "bg-k-red" : "bg-k-line-2"
                    }`}
                  >
                    <span
                      className={`rounded-pill absolute top-0.5 block h-3.5 w-3.5 bg-white transition-all ${
                        active ? "left-[15px]" : "left-0.5"
                      }`}
                    />
                  </span>
                  <span className="min-w-0 flex-1 text-[12.5px] text-k-ink">{flag.label}</span>
                  <span className="t-brand-count text-k-text-4">{flag.count}</span>
                </Link>
              );
            })}
          </div>
        </Group>

        <div className="px-[22px] pt-5 pb-6">
          <div className="border-l-[3px] border-k-red bg-k-surface-3 px-[18px] py-4">
            <p className="text-[12.5px] font-semibold text-k-ink">{t("den_vriskete_to_sosto")}</p>
            <p className="mt-1.5 text-[12px] leading-[1.55] text-k-text-3">
              {t("peite_mas_ti_doyleia_kai")}
            </p>
            <a
              href="tel:+302104111355"
              className="t-card-cta mt-3 flex h-11 items-center justify-center bg-k-ink text-white transition-colors hover:bg-k-red"
            >
              210 411 1355
            </a>
          </div>
        </div>
      </div>
    </aside>
  );
}

/** Collapsible group. `<details>` gives open/close with no JavaScript. */
function Group({
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  badge: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group border-b border-k-line">
      <summary className="flex min-h-[54px] cursor-pointer list-none items-center gap-2.5 px-[22px] py-3.5 marker:content-none">
        <span className="min-w-0 flex-1 text-[11px] font-bold tracking-[0.07em] text-k-ink">
          {upGreek(title)}
        </span>
        {badge > 0 && (
          <span className="t-brand-count bg-k-red px-1.5 py-0.5 text-white">{badge}</span>
        )}
        <span className="text-[15px] leading-none text-k-text-4 group-open:hidden">+</span>
        <span className="hidden text-[15px] leading-none text-k-text-4 group-open:inline">
          −
        </span>
      </summary>
      <div className="px-[22px] pb-4">{children}</div>
    </details>
  );
}

function CheckList({
  items,
  hrefFor,
  /** Το χρώμα του αριθμού. Οι υποκατηγορίες τον θέλουν χρυσό· τα brands όχι. */
  countClassName = "text-k-text-4",
}: {
  items: FacetItem[];
  hrefFor: (slug: string) => string;
  countClassName?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {items.map((item) => (
        <Link
          key={item.slug}
          href={hrefFor(item.slug)}
          scroll={false}
          aria-pressed={item.active}
          className="flex min-h-[34px] items-center gap-2.5 py-1"
         prefetch={false}>
          <span
            className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center border text-[9px] leading-none ${
              item.active ? "border-k-ink bg-k-ink text-white" : "border-k-line-2"
            }`}
          >
            {item.active ? "✓" : ""}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-k-ink">
            {item.label}
          </span>
          <span className={`t-brand-count ${countClassName}`}>{item.count}</span>
        </Link>
      ))}
    </div>
  );
}
