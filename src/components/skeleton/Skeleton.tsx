/**
 * Loading placeholders.
 *
 * These mirror the real components' box model — same heights, same grid, same
 * borders — so the page does not reflow when content arrives. A generic grey
 * block that is the wrong size is worse than no skeleton: it moves everything
 * twice instead of once.
 *
 * All server components: a skeleton that needs JavaScript to appear defeats its
 * own purpose.
 */

export function Shimmer({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse bg-k-surface-3 ${className}`} />;
}

/** Matches `ProductCard` exactly — 118px image on mobile, 186px from lg. */
export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col border border-k-line bg-white">
      <div className="p-3 lg:p-5">
        <Shimmer className="h-[118px] w-full lg:h-[186px]" />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-3 pb-3 lg:gap-[9px] lg:px-5 lg:pb-5">
        <div className="flex items-baseline justify-between">
          <Shimmer className="h-2.5 w-16" />
          <Shimmer className="hidden h-2.5 w-12 lg:block" />
        </div>
        <div className="min-h-[46px] space-y-1.5 lg:min-h-[54px]">
          <Shimmer className="h-3 w-full" />
          <Shimmer className="h-3 w-4/5" />
        </div>
        <Shimmer className="hidden h-2.5 w-28 lg:block" />
        <div className="mt-auto flex flex-col gap-1.5 pt-1.5 lg:flex-row lg:items-end lg:justify-between lg:pt-2.5">
          <div className="space-y-1.5">
            <Shimmer className="h-5 w-24" />
            <Shimmer className="h-2 w-16" />
          </div>
          <Shimmer className="h-11 w-full lg:h-9 lg:w-24" />
        </div>
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Matches `FilterSidebar`: dark header, then collapsible groups. */
export function FilterSidebarSkeleton() {
  return (
    <div className="hidden lg:block">
      <div className="flex items-center justify-between bg-k-ink px-[22px] py-4">
        <Shimmer className="h-3 w-16 bg-white/20" />
        <Shimmer className="h-3 w-20 bg-white/10" />
      </div>
      {Array.from({ length: 5 }, (_, group) => (
        <div key={group} className="border-b border-k-line px-[22px] py-3.5">
          <Shimmer className="h-3 w-32" />
          <div className="mt-3 space-y-2.5">
            {Array.from({ length: 5 }, (_, row) => (
              <div key={row} className="flex items-center gap-2.5">
                <Shimmer className="h-3.5 w-3.5" />
                <Shimmer className="h-2.5 flex-1" />
                <Shimmer className="h-2.5 w-6" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const CHIP_WIDTHS = ["w-24", "w-36", "w-28", "w-44", "w-20", "w-32"];

/** Dark hero band used by PLP, PDP and brand pages. */
export function HeroBandSkeleton({ chips = 0 }: { chips?: number }) {
  return (
    <div className="shell-x bg-k-ink-deep">
      <div className="flex h-11 items-center gap-2.5">
        <Shimmer className="h-2.5 w-14 bg-white/10" />
        <Shimmer className="h-2.5 w-20 bg-white/10" />
      </div>
      <div className="pt-2.5 pb-7">
        <Shimmer className="h-7 w-64 bg-white/12 lg:h-9 lg:w-96" />
        <div className="mt-3.5 max-w-[640px] space-y-2">
          <Shimmer className="h-3 w-full bg-white/8" />
          <Shimmer className="h-3 w-3/4 bg-white/8" />
        </div>
        {chips > 0 && (
          <div className="mt-5 flex flex-wrap gap-1.5 border-t border-white/10 pt-5">
            {/* Varied widths so the row reads as labels, not a progress bar. */}
            {Array.from({ length: chips }, (_, i) => (
              <Shimmer
                key={i}
                className={`h-7 bg-white/8 ${CHIP_WIDTHS[i % CHIP_WIDTHS.length]}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Matches `PlpToolbar`. */
export function ToolbarSkeleton() {
  return (
    <div className="border-b border-k-line bg-white">
      <div className="shell-x flex flex-col gap-3 py-3 lg:min-h-[74px] lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Shimmer className="h-11 w-24 lg:hidden" />
          <Shimmer className="h-3.5 w-28" />
        </div>
        <div className="flex items-center gap-4">
          <Shimmer className="hidden h-[30px] w-32 lg:block" />
          <Shimmer className="h-[38px] w-40" />
        </div>
      </div>
    </div>
  );
}

/**
 * Header, nav and utility bar.
 *
 * `loading.tsx` replaces the entire page, chrome included — this keeps the top
 * of the screen from flashing empty during a route change. It disappears the
 * moment the real chrome renders.
 */
export function ChromeSkeleton() {
  return (
    <>
      <div className="h-8 bg-k-ink lg:h-9" />
      <div className="shell-x flex h-[122px] items-center gap-4 border-b border-k-line bg-white lg:h-24 lg:gap-9">
        <Shimmer className="h-8 w-[104px] lg:w-[158px]" />
        <Shimmer className="hidden h-[50px] flex-1 lg:block" />
        <span className="ml-auto flex gap-4 lg:ml-0">
          <Shimmer className="h-6 w-6" />
          <Shimmer className="h-6 w-6" />
        </span>
      </div>
      <div className="hidden h-[54px] border-b border-k-line bg-white lg:block" />
    </>
  );
}
