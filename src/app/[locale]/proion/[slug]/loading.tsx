import { ChromeSkeleton, ProductCardSkeleton, Shimmer } from "@/components/skeleton/Skeleton";

/** Two columns matching the PDP: gallery left, buy box right. */
export default function Loading() {
  return (
    <>
      <ChromeSkeleton />
      <main id="main">
        <div className="shell-x bg-k-ink-deep">
          <div className="flex h-11 items-center gap-2.5">
            <Shimmer className="h-2.5 w-14 bg-white/10" />
            <Shimmer className="h-2.5 w-24 bg-white/10" />
          </div>
        </div>

        <div className="shell-w grid border-b border-k-line bg-white lg:grid-cols-[1fr_480px]">
          <div className="min-w-0 border-k-line px-4 py-6 lg:border-r lg:px-10 lg:pt-[34px] lg:pb-10">
            <div className="grid gap-4 lg:grid-cols-[88px_1fr] lg:gap-5">
              <div className="order-2 flex gap-2.5 lg:order-1 lg:flex-col">
                {Array.from({ length: 4 }, (_, i) => (
                  <Shimmer key={i} className="h-[72px] w-[72px] lg:h-[88px] lg:w-[88px]" />
                ))}
              </div>
              <Shimmer className="order-1 h-[320px] w-full lg:order-2 lg:h-[540px]" />
            </div>
            <div className="mt-6 grid grid-cols-2 gap-px border border-k-line bg-k-line lg:mt-[22px] lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="bg-white px-4 py-4">
                  <Shimmer className="h-2 w-16" />
                  <Shimmer className="mt-2 h-4 w-20" />
                </div>
              ))}
            </div>
          </div>

          <div className="flex min-w-0 flex-col px-4 py-6 lg:px-10 lg:pt-[34px] lg:pb-10">
            <Shimmer className="h-3 w-24" />
            <Shimmer className="mt-3.5 h-6 w-full" />
            <Shimmer className="mt-2 h-6 w-3/4" />
            <div className="mt-4 flex border border-k-line">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="flex-1 border-r border-k-line px-3.5 py-2.5 last:border-r-0">
                  <Shimmer className="h-2 w-14" />
                  <Shimmer className="mt-1.5 h-3 w-20" />
                </div>
              ))}
            </div>
            <div className="mt-5 h-[7px] bg-[repeating-linear-gradient(135deg,#FF3333_0_9px,#1A1A1C_9px_18px)]" />
            <div className="bg-k-ink px-5 pt-5 pb-6 lg:px-[22px]">
              <Shimmer className="h-10 w-48 bg-white/12" />
              <Shimmer className="mt-2 h-2.5 w-32 bg-white/8" />
              <div className="mt-5 flex gap-2.5">
                <Shimmer className="h-[52px] w-[140px] bg-white/12" />
                <Shimmer className="h-[52px] flex-1 bg-white/12" />
              </div>
            </div>
          </div>
        </div>

        <section className="shell-x border-t border-k-line bg-k-surface-3 py-7 lg:py-12">
          <Shimmer className="h-2.5 w-32" />
          <Shimmer className="mt-3 h-6 w-64" />
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-4">
            {Array.from({ length: 5 }, (_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
