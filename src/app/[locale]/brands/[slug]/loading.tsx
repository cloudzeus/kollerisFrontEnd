import { ChromeSkeleton, ProductCardSkeleton, Shimmer } from "@/components/skeleton/Skeleton";

const CHIP_WIDTHS = ["w-28", "w-44", "w-36", "w-52", "w-24", "w-40", "w-32", "w-48"];

/**
 * PLP loading state.
 *
 * Reproduces the real page's structure exactly — dark hero with a wrapped chip
 * row, the 74px toolbar, the 326px sidebar and a 4-up grid — so the content
 * arriving does not move anything. An approximate skeleton reflows the page
 * twice instead of once, which reads worse than no skeleton at all.
 */
export default function Loading() {
  return (
    <>
      <ChromeSkeleton />
      <main id="main">
        {/* Hero */}
        <div className="shell-x bg-k-ink-deep">
          <div className="flex h-11 items-center gap-2.5">
            <Shimmer className="h-2.5 w-14 bg-white/10" />
            <Shimmer className="h-2.5 w-20 bg-white/10" />
            <Shimmer className="h-2.5 w-28 bg-white/10" />
          </div>

          <div className="pt-2.5 pb-7">
            <Shimmer className="h-7 w-56 bg-white/12 lg:h-9 lg:w-80" />
            <div className="mt-3.5 max-w-[640px] space-y-2">
              <Shimmer className="h-3 w-full bg-white/8" />
              <Shimmer className="h-3 w-2/3 bg-white/8" />
            </div>

            <div className="mt-5 flex flex-wrap gap-1.5 border-t border-white/10 pt-5">
              {CHIP_WIDTHS.map((width, i) => (
                <Shimmer key={i} className={`h-[30px] bg-white/8 ${width}`} />
              ))}
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="border-b border-k-line bg-white">
          <div className="shell-x flex flex-col gap-3 py-3 lg:min-h-[74px] lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <Shimmer className="h-11 w-24 lg:hidden" />
              <Shimmer className="h-3.5 w-32" />
            </div>
            <div className="flex items-center gap-4">
              <Shimmer className="hidden h-[30px] w-[122px] xl:block" />
              <Shimmer className="hidden h-[30px] w-[136px] lg:block" />
              <Shimmer className="h-[38px] w-44" />
            </div>
          </div>
        </div>

        <div className="shell-w bg-white lg:grid lg:grid-cols-[326px_1fr] lg:items-start">
          {/* Sidebar */}
          <div className="hidden lg:block">
            <div className="flex items-center justify-between bg-k-ink px-[22px] py-4">
              <Shimmer className="h-3 w-16 bg-white/20" />
              <Shimmer className="h-3 w-20 bg-white/10" />
            </div>
            {[6, 6, 5, 2, 2].map((rows, group) => (
              <div key={group} className="border-b border-k-line px-[22px] py-3.5">
                <Shimmer className="h-3 w-28" />
                <div className="mt-3.5 space-y-2.5">
                  {Array.from({ length: rows }, (_, row) => (
                    <div key={row} className="flex items-center gap-2.5">
                      <Shimmer className="h-3.5 w-3.5" />
                      <Shimmer className="h-2.5 flex-1" />
                      <Shimmer className="h-2.5 w-7" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="px-[22px] py-5">
              <Shimmer className="h-[132px] w-full" />
            </div>
          </div>

          {/* Grid */}
          <div className="min-w-0 border-k-line px-4 py-6 lg:border-l lg:px-10 lg:pt-6 lg:pb-10">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4">
              {Array.from({ length: 12 }, (_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
            <div className="mt-8 flex justify-center gap-1.5">
              {Array.from({ length: 5 }, (_, i) => (
                <Shimmer key={i} className="h-10 w-10" />
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
