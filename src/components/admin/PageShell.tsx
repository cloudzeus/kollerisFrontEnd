import { cn } from "@/lib/utils";

/**
 * The frame every admin screen sits in.
 *
 * Exists so the header, the container width and the vertical rhythm are decided
 * once. Three screens built independently drifted to three different paddings
 * and three different heading sizes, which is what makes an admin feel
 * assembled rather than designed.
 *
 * The header is sticky: on a long settings or content page the title and its
 * primary action scroll away exactly when somebody is deepest into the work.
 */
export function PageShell({
  title,
  description,
  actions,
  children,
  width = "wide",
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** `narrow` for forms — long lines of settings are hard to scan. */
  width?: "wide" | "narrow";
}) {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-k-line bg-k-surface-2/95 backdrop-blur">
        <div
          className={cn(
            "mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-4 pl-16 lg:px-8 lg:pl-8",
            width === "narrow" ? "max-w-[64rem]" : "max-w-[84rem]",
          )}
        >
          <div className="min-w-0">
            <h1 className="truncate text-[19px] font-semibold tracking-tight text-k-ink">
              {title}
            </h1>
            {description && (
              <p className="mt-0.5 max-w-[76ch] text-[12.5px] leading-[1.55] text-k-text-3">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      </header>

      <div
        className={cn(
          "mx-auto px-4 py-6 lg:px-8",
          width === "narrow" ? "max-w-[64rem]" : "max-w-[84rem]",
        )}
      >
        {children}
      </div>
    </>
  );
}

/**
 * A white panel on the tinted page background.
 *
 * The tint is what separates an admin from a document: content sits in cards,
 * the page behind them is quiet, and the eye can tell one block of work from
 * the next without reading it.
 */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Set to "" for tables and lists that manage their own padding. */
  bodyClassName?: string;
}) {
  return (
    <section className={cn("border border-k-line bg-white", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-k-line px-4 py-3">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[13px] font-semibold tracking-tight text-k-ink">{title}</h2>
            )}
            {description && (
              <p className="mt-0.5 text-[11.5px] leading-[1.5] text-k-text-3">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName ?? "p-4"}>{children}</div>
    </section>
  );
}

/** A single figure. Tabular numerals so a row of them lines up. */
export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-white px-4 py-3.5">
      <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-k-text-4">{label}</p>
      <p className="numeral mt-1 text-[21px] font-semibold leading-none tracking-tight text-k-ink">
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] text-k-text-4">{hint}</p>}
    </div>
  );
}
