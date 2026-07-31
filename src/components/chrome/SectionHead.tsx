import { upGreek } from "@/lib/greek";

/**
 * The one section header on the site — a SERVER component.
 *
 * Every band that isn't the hero opens with this, which is what makes two
 * consecutive sections read as two sections. Before it existed the product
 * description and the related-products rail ran into each other with nothing
 * but a colour change between them, and at a glance that colour change looked
 * like a rendering artefact rather than a boundary.
 *
 * Three parts, always in the same order: red keyline + eyebrow, Artegra title,
 * and an optional meta slot pushed right for counts, links or filters.
 */
export function SectionHead({
  eyebrow,
  title,
  lead,
  meta,
  tone = "light",
  className = "",
}: {
  eyebrow: string;
  title: string;
  /** One sentence under the title. Skip it when the title already says it. */
  lead?: string;
  meta?: React.ReactNode;
  tone?: "light" | "dark";
  className?: string;
}) {
  const dark = tone === "dark";

  return (
    <div
      className={`flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-12 ${className}`}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2.5">
          <span aria-hidden className="rule-accent block shrink-0" />
          <span className="t-eyebrow text-k-red">{upGreek(eyebrow)}</span>
        </p>

        <h2
          className={`t-h2 mt-2.5 text-balance ${dark ? "text-white" : "text-k-ink"}`}
        >
          {upGreek(title)}
        </h2>

        {lead && (
          <p
            className={`mt-2.5 max-w-[62ch] text-[13px] leading-[1.65] lg:text-[13.5px] ${
              dark ? "text-white/60" : "text-k-text-3"
            }`}
          >
            {lead}
          </p>
        )}
      </div>

      {meta && <div className="shrink-0">{meta}</div>}
    </div>
  );
}
