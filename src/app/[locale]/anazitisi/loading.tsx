import { ChromeSkeleton, ProductCardSkeleton, Shimmer } from "@/components/skeleton/Skeleton";

/**
 * Search loading state.
 *
 * Mirrors the real page box for box — dark hero, 74px toolbar, 326px sidebar,
 * 4-up grid — so nothing moves when the results land. It deliberately omits the
 * exact-code band: that band appears for a minority of queries, and reserving
 * its 130px on every search would shift the grid down on most of them.
 */
export default function Loading() {
  return (
    <>
      <ChromeSkeleton />
      <main id="main">
        <div className="shell-x bg-k-ink-deep">
          <div className="flex h-11 items-center gap-2.5">
            <Shimmer className="h-2.5 w-14 bg-white/10" />
            <Shimmer className="h-2.5 w-20 bg-white/10" />
          </div>
          <div className="space-y-3.5 pt-2.5 pb-7">
            <Shimmer className="h-7 w-80 bg-white/12 lg:h-9 lg:w-[420px]" />
            <Shimmer className="h-3 w-full max-w-[560px] bg-white/8" />
            <Shimmer className="h-3 w-2/3 max-w-[380px] bg-white/8" />
          </div>
        </div>

        <div className="border-b border-k-line bg-white">
          <div className="shell-x flex flex-col gap-3 py-3 lg:min-h-[74px] lg:flex-row lg:items-center lg:justify-between">
            <Shimmer className="h-3.5 w-32" />
            <div className="flex items-center gap-4">
              <Shimmer className="hidden h-[30px] w-32 lg:block" />
              <Shimmer className="h-[38px] w-40" />
            </div>
          </div>
        </div>

        <div className="shell-w bg-white lg:grid lg:grid-cols-[326px_1fr] lg:items-start">
          <div className="hidden border-r border-k-line lg:block">
            <div className="flex h-[62px] items-center justify-between border-b border-k-line px-6">
              <Shimmer className="h-3 w-16" />
              <Shimmer className="h-2.5 w-20" />
            </div>
            {[6, 5, 4].map((rows, group) => (
              <div key={group} className="border-b border-k-line px-6 py-5">
                <Shimmer className="h-2.5 w-28" />
                <div className="mt-4 space-y-3">
                  {Array.from({ length: rows }, (_, row) => (
                    <div key={row} className="flex items-center gap-3">
                      <Shimmer className="h-4 w-4 shrink-0" />
                      <Shimmer className="h-2.5 flex-1" />
                      <Shimmer className="h-2.5 w-6 shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="min-w-0 px-4 py-6 lg:px-10 lg:pt-6 lg:pb-10">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
