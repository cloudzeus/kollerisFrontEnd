import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { upGreek } from "@/lib/greek";

/**
 * Diff-only / highlight-best switches — a SERVER component.
 *
 * The component list called these client-only display filters. They are links
 * instead: the whole matrix is already server-rendered, and putting the two
 * flags in the URL means a filtered comparison can be sent to a colleague, the
 * back button undoes a toggle, and the page ships no JavaScript for either.
 *
 * Sticky at the top of the viewport; the product row sticks directly beneath it
 * at `--compare-toolbar-h`.
 */
export function CompareToolbar({
  ids,
  diffOnly,
  highlightBest,
  totalRows,
  differingRows,
  columnCount,
}: {
  ids: string[];
  diffOnly: boolean;
  highlightBest: boolean;
  totalRows: number;
  differingRows: number;
  columnCount: number;
}) {
  const t = useTranslations("compare.CompareToolbar");
  const href = (next: { diff?: boolean; best?: boolean }) => {
    const params = new URLSearchParams({ ids: ids.join(",") });
    if (next.diff ?? diffOnly) params.set("diff", "1");
    if (next.best ?? highlightBest) params.set("best", "1");
    return `/sygkrisi?${params.toString()}`;
  };

  const canDiff = columnCount > 1;

  return (
    <div className="sticky top-0 z-30 border-y border-k-line bg-k-surface-2/95 backdrop-blur-sm">
      <div className="shell-x flex h-[var(--compare-toolbar-h)] items-center justify-between gap-4 overflow-x-auto">
        <div className="flex shrink-0 items-center gap-1.5 lg:gap-2.5">
          <Toggle
            href={href({ diff: !diffOnly })}
            active={diffOnly}
            disabled={!canDiff}
            label={t("mono_diafores")}
          />
          <Toggle
            href={href({ best: !highlightBest })}
            active={highlightBest}
            disabled={!canDiff}
            label={t("kalyteri_timi_ana_grammi")}
          />
        </div>

        <p className="t-brand-count hidden shrink-0 items-center gap-2.5 text-k-text-4 sm:flex">
          <span className="font-mono font-semibold text-k-ink">
            {diffOnly ? differingRows : totalRows}
          </span>
          {upGreek(diffOnly ? t("apo_grammes", { totalRows: totalRows }) : t("grammes"))}
          {!diffOnly && differingRows > 0 && (
            <>
              <span className="block h-[14px] w-px bg-k-line-2" />
              <span className="font-mono font-semibold text-k-red">
                {differingRows}
              </span>
              {upGreek(t("me_diafora"))}
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function Toggle({
  href,
  active,
  disabled,
  label,
}: {
  href: string;
  active: boolean;
  disabled: boolean;
  label: string;
}) {
  const body = (
    <>
      <span
        aria-hidden
        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center border text-[10px] leading-none ${
          active
            ? "border-k-red bg-k-red text-white"
            : "border-k-line-2 bg-white"
        }`}
      >
        {active ? "✓" : ""}
      </span>
      {upGreek(label)}
    </>
  );

  const className = `t-brand-count flex items-center gap-2 border px-2.5 py-2 whitespace-nowrap transition-colors lg:px-3.5 ${
    active
      ? "border-k-ink bg-white text-k-ink"
      : "border-k-line-2 bg-white text-k-text-3 hover:border-k-ink hover:text-k-ink"
  }`;

  if (disabled) {
    return (
      <span
        aria-disabled
        className={`${className} cursor-not-allowed opacity-45`}
      >
        {body}
      </span>
    );
  }

  return (
    <Link
      href={href}
      scroll={false}
      aria-pressed={active}
      className={className}
    >
      {body}
    </Link>
  );
}
