import {
  ChromeSkeleton,
  ProductCardSkeleton,
  Shimmer,
} from "@/components/skeleton/Skeleton";

export default function Loading() {
  return (
    <>
      <ChromeSkeleton />
      <main id="main">
        {/* Hero + promo tiles */}
        <div className="shell-w grid gap-0.5 bg-k-line lg:grid-cols-[1fr_400px]">
          <Shimmer className="h-[420px] rounded-none bg-k-ink lg:h-[520px]" />
          <div className="hidden grid-rows-2 gap-0.5 lg:grid">
            <Shimmer className="h-full bg-k-surface-3" />
            <Shimmer className="h-full bg-k-ink" />
          </div>
        </div>

        {/* Stat strip */}
        <div className="border-y border-k-line bg-white">
          <div className="shell-w grid grid-cols-2 gap-px bg-k-line lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div
                key={i}
                className="flex flex-col gap-1 bg-white p-4 lg:flex-row lg:items-center lg:gap-4 lg:px-10 lg:py-7"
              >
                <Shimmer className="h-7 w-20 lg:h-9" />
                <div className="space-y-1">
                  <Shimmer className="h-2 w-24" />
                  <Shimmer className="h-2 w-28" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Category grid */}
        <section className="shell-x bg-white py-7 lg:pt-16 lg:pb-17">
          <Shimmer className="h-2.5 w-36" />
          <Shimmer className="mt-3 h-7 w-72" />
          <div className="mt-6 grid grid-cols-2 gap-px border border-k-line bg-k-line md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div
                key={i}
                className="flex min-h-[150px] flex-col justify-between bg-white p-4 lg:min-h-[196px] lg:p-6"
              >
                <div className="flex justify-between">
                  <Shimmer className="h-2.5 w-6" />
                  <Shimmer className="h-2.5 w-16" />
                </div>
                <Shimmer className="h-[54px] w-[54px] lg:h-[76px] lg:w-[76px]" />
                <Shimmer className="h-3 w-32" />
              </div>
            ))}
          </div>
        </section>

        {/* Featured products */}
        <section className="shell-x border-t border-k-line bg-k-surface-3 py-7 lg:pt-16 lg:pb-[70px]">
          <Shimmer className="h-2.5 w-40" />
          <Shimmer className="mt-3 h-7 w-80" />
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            {Array.from({ length: 8 }, (_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
