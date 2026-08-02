import { useTranslations } from "next-intl";
import Image from "next/image";
import { Fragment } from "react";
import { Link } from "@/i18n/navigation";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { formatPercent, formatPrice, savingsOf } from "@/lib/format";
import type { CompareColumn, CompareRowGroup } from "@/lib/compare/options";
import { upGreek } from "@/lib/greek";

/**
 * The comparison matrix — a SERVER component built as a real `<table>`.
 *
 * A table, not a grid of divs: the row label genuinely heads its row and the
 * product genuinely heads its column, which is what lets a screen reader
 * announce "Ροπή, WERA 05133156001, 1,5 Nm" instead of reading forty
 * disconnected numbers.
 *
 * Sticky behaviour differs by breakpoint on purpose. Below `lg` the table is
 * wider than the viewport, so it lives in a horizontal scroller with the label
 * column pinned left. At `lg` it fits inside the 1440 shell, the scroller is
 * removed — which is what frees `position: sticky` to resolve against the
 * viewport — and the product row pins under the toolbar.
 */
export function CompareMatrix({
  columns,
  groups,
  diffOnly,
  highlightBest,
  ids,
}: {
  columns: CompareColumn[];
  groups: CompareRowGroup[];
  diffOnly: boolean;
  highlightBest: boolean;
  ids: string[];
}) {
  const t = useTranslations("compare.CompareMatrix");
  const visible = groups
    .map((g) => ({
      ...g,
      rows: diffOnly ? g.rows.filter((r) => r.differs) : g.rows,
    }))
    .filter((g) => g.rows.length > 0);

  const span = columns.length + 1;

  return (
    <div className="overflow-x-auto lg:overflow-x-visible">
      <table className="w-full min-w-[680px] border-collapse text-left lg:min-w-0">
        <thead className="lg:sticky lg:top-[var(--compare-toolbar-h)] lg:z-20">
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 w-[148px] min-w-[148px] border-r border-b border-k-line bg-white align-bottom lg:w-[220px] lg:min-w-[220px]"
            >
              <span className="t-eyebrow block p-3 text-k-red lg:p-5">
                {upGreek(t("charaktiristiko"))}
              </span>
            </th>

            {columns.map((column) => (
              <ColumnHead key={column.slug} column={column} ids={ids} />
            ))}
          </tr>
        </thead>

        <tbody>
          {visible.map((group) => (
            <Fragment key={group.key}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={span}
                  className="sticky left-0 border-y border-k-line bg-k-ink-deep px-3 py-2.5 lg:px-5"
                >
                  <span className="t-eyebrow flex items-center gap-2.5 text-white">
                    {upGreek(group.label)}
                    <span className="t-brand-count font-normal text-white/40">
                      {group.rows.length}
                    </span>
                  </span>
                </th>
              </tr>

              {group.rows.map((row) => (
                <tr key={row.key} className="bg-white even:bg-k-surface-2">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-r border-b border-k-line bg-inherit px-3 py-2.5 align-top lg:px-5 lg:py-3"
                  >
                    <span className="block text-[12px] leading-[1.4] font-medium text-k-text-2 lg:text-[12.5px]">
                      {row.label}
                    </span>
                    {row.differs && (
                      <span className="t-brand-count mt-1 block text-k-red">
                        {upGreek(t("diaferei"))}
                      </span>
                    )}
                  </th>

                  {row.cells.map((cell, index) => {
  const t = useTranslations("compare.CompareMatrix");
                    const isBest = highlightBest && row.bestIndex === index;
                    return (
                      <td
                        key={columns[index]?.slug ?? index}
                        className={`border-b border-k-line px-3 py-2.5 align-top lg:px-5 lg:py-3 ${
                          isBest ? "bg-k-green/8" : ""
                        }`}
                      >
                        <span
                          className={`flex items-baseline gap-1.5 font-mono text-[12.5px] leading-[1.45] ${
                            cell.text == null
                              ? "text-k-text-5"
                              : isBest
                                ? "font-semibold text-k-green"
                                : "font-medium text-k-ink"
                          }`}
                        >
                          {isBest && (
                            <span
                              aria-hidden
                              className="mt-[3px] block h-1.5 w-1.5 shrink-0 bg-k-green"
                            />
                          )}
                          {cell.text ?? "—"}
                          {isBest && (
                            /* Neuter and about the VALUE, not the price — the
                               same marker sits on «Απόθεμα», where "χαμηλότερη
                               τιμή" would read as a price claim. */
                            <span className="sr-only">
                              {row.direction === "lower"
                                ? t("to_chamilotero_tis_sygkrisis")
                                : t("to_ypsilotero_tis_sygkrisis")}
                            </span>
                          )}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ColumnHead({ column, ids }: { column: CompareColumn; ids: string[] }) {
  const t = useTranslations("compare.CompareMatrix");
  const ctx = { vatRate: column.vatRate };
  const saving =
    column.priceListNet != null && column.priceNet != null
      ? savingsOf(column.priceListNet, column.priceNet, ctx)
      : null;

  // Removing a column rewrites `?ids=` — the comparison stays shareable and the
  // back button puts the product back.
  const without = ids.filter((id) => id !== column.slug);
  const removeHref = without.length
    ? `/sygkrisi?ids=${without.join(",")}`
    : "/sygkrisi";

  return (
    <th
      scope="col"
      className="relative min-w-[150px] border-r border-b border-k-line bg-white p-3 align-top last:border-r-0 lg:min-w-0 lg:p-5"
    >
      <Link
        href={removeHref}
        scroll={false}
        aria-label={`Αφαίρεση ${column.name} από τη σύγκριση`}
        title={t("afairesi")}
        className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center text-[15px] leading-none text-k-text-5 transition-colors hover:bg-k-red hover:text-white"
      >
        ×
      </Link>

      <Link href={`/proion/${column.slug}`} className="block">
        <span className="relative flex h-[88px] items-center justify-center bg-k-surface-2 lg:h-[132px]">
          {saving && (
            <span className="t-badge absolute top-0 left-0 bg-k-red px-1.5 py-[3px] text-white">
              {formatPercent(saving.percent)}
            </span>
          )}
          {column.image ? (
            <Image
              src={column.image}
              alt={column.name}
              width={240}
              height={240}
              className="max-h-full max-w-full object-contain p-2"
            />
          ) : (
            <span className="t-brand-count text-k-text-5">
              {upGreek(t("choris_eikona"))}
            </span>
          )}
        </span>
      </Link>

      <span className="t-card-brand mt-2.5 block text-k-red">
        {column.brandName ? upGreek(column.brandName) : "—"}
      </span>

      <Link
        href={`/proion/${column.slug}`}
        className="mt-1 block text-[12px] leading-[1.35] font-medium text-k-ink transition-colors hover:text-k-red lg:text-[13px]"
      >
        {column.name}
      </Link>

      <span className="t-card-sku mt-1 block text-k-text-5">{column.sku}</span>

      <span className="mt-2.5 block font-mono text-[15px] leading-none font-semibold text-k-ink lg:text-[17px]">
        {column.priceNet != null ? formatPrice(column.priceNet, ctx) : "—"}
      </span>
      <span className="t-card-vat mt-1 block text-k-text-5">
        {upGreek(`με ΦΠΑ ${column.vatRate}%`)}
      </span>

      <AddToCartButton
        productId={column.id}
        disabled={column.priceNet == null}
        className="t-card-cta mt-3 h-10 w-full bg-k-ink text-white transition-colors hover:bg-k-red"
      />
    </th>
  );
}
