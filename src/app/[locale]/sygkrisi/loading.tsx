import { ChromeSkeleton, Shimmer } from "@/components/skeleton/Skeleton";

const COLUMNS = [0, 1, 2];
const GROUPS = [5, 4, 6];

/**
 * Compare loading state.
 *
 * Mirrors the real matrix box for box — dark hero, 52px toolbar, the 148/220px
 * label column and three product heads — so nothing moves when the data lands.
 * Three columns because that is the common case; a fourth arriving widens the
 * table without shifting anything vertically.
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
            <Shimmer className="h-2.5 w-24 bg-white/10" />
          </div>
          <div className="flex flex-col gap-5 pt-2.5 pb-7 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3.5">
              <Shimmer className="h-6 w-64 bg-white/12 lg:h-8 lg:w-80" />
              <Shimmer className="h-3 w-full max-w-[560px] bg-white/8" />
              <Shimmer className="h-3 w-2/3 max-w-[380px] bg-white/8" />
            </div>
            <Shimmer className="hidden h-10 w-48 bg-white/8 lg:block" />
          </div>
        </div>

        <div className="border-y border-k-line bg-k-surface-2">
          <div className="shell-x flex h-[var(--compare-toolbar-h)] items-center justify-between">
            <div className="flex gap-2.5">
              <Shimmer className="h-8 w-32" />
              <Shimmer className="h-8 w-44" />
            </div>
            <Shimmer className="hidden h-2.5 w-28 sm:block" />
          </div>
        </div>

        <div className="shell-x bg-white pt-5 pb-8 lg:pt-7 lg:pb-12">
          <div className="overflow-hidden">
            <div className="flex border-b border-k-line">
              <div className="w-[148px] shrink-0 border-r border-k-line p-3 lg:w-[220px] lg:p-5">
                <Shimmer className="mt-auto h-2.5 w-24" />
              </div>
              {COLUMNS.map((column) => (
                <div
                  key={column}
                  className="min-w-[150px] flex-1 space-y-2.5 border-r border-k-line p-3 last:border-r-0 lg:p-5"
                >
                  <Shimmer className="h-[88px] w-full lg:h-[132px]" />
                  <Shimmer className="h-2.5 w-16" />
                  <Shimmer className="h-3 w-full" />
                  <Shimmer className="h-3 w-3/4" />
                  <Shimmer className="h-5 w-24" />
                  <Shimmer className="h-10 w-full" />
                </div>
              ))}
            </div>

            {GROUPS.map((rows, group) => (
              <div key={group}>
                <div className="border-b border-k-line bg-k-ink-deep px-3 py-2.5 lg:px-5">
                  <Shimmer className="h-2.5 w-40 bg-white/12" />
                </div>
                {Array.from({ length: rows }, (_, row) => (
                  <div key={row} className="flex border-b border-k-line even:bg-k-surface-2">
                    <div className="w-[148px] shrink-0 border-r border-k-line px-3 py-3 lg:w-[220px] lg:px-5">
                      <Shimmer className="h-2.5 w-28" />
                    </div>
                    {COLUMNS.map((column) => (
                      <div key={column} className="min-w-[150px] flex-1 px-3 py-3 lg:px-5">
                        <Shimmer className="h-2.5 w-20" />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
