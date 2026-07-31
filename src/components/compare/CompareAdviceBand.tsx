import { Link } from "@/i18n/navigation";
import type { CompareAdvice, CompareColumn } from "@/lib/compare/options";
import { upGreek } from "@/lib/greek";

/**
 * "Η επιλογή του υπευθύνου" — a SERVER component over server-computed picks.
 *
 * Nothing here is editorial copy. Every card names a strict winner on a value
 * the ERP owns (price, stock, warranty, weight) or on a spec row that already
 * earned a highlight in the matrix, so the band can never disagree with the
 * table above it. When there is no clear winner the card is simply absent.
 */
export function CompareAdviceBand({
  advice,
  columns,
}: {
  advice: CompareAdvice[];
  columns: CompareColumn[];
}) {
  if (advice.length === 0) return null;

  return (
    <section className="shell-x border-t border-k-line bg-k-surface-3 py-7 lg:py-11">
      <p className="t-eyebrow text-k-red">
        {upGreek("Η επιλογή του υπευθύνου")}
      </p>
      <h2 className="font-artegra mt-2 text-[19px] leading-[1.2] font-medium text-k-ink lg:text-[25px]">
        {upGreek("Ποιο να πάρετε, ανάλογα με τι μετράει")}
      </h2>

      <div className="mt-5 grid gap-px border border-k-line bg-k-line sm:grid-cols-2 lg:mt-7 lg:grid-cols-4">
        {advice.map((item) => {
          const column = columns[item.columnIndex];
          return (
            <div
              key={item.key}
              className="flex flex-col gap-2 bg-white p-4 lg:p-5"
            >
              <span className="t-badge self-start bg-k-ink px-[7px] py-1 text-white">
                {upGreek(item.badge)}
              </span>
              <Link
                href={`/proion/${column.slug}`}
                className="mt-0.5 text-[13px] leading-[1.35] font-medium text-k-ink transition-colors hover:text-k-red"
              >
                {item.title}
              </Link>
              <p className="t-body-sm mt-auto pt-1 text-k-text-3">
                {item.reason}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
