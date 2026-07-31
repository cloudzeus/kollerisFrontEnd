import { ChromeSkeleton, Shimmer } from "@/components/skeleton/Skeleton";

export default function Loading() {
  return (
    <>
      <ChromeSkeleton />
      <main id="main">
        <div className="shell-x bg-k-ink-deep">
          <div className="flex h-11 items-center gap-2.5">
            <Shimmer className="h-2.5 w-14 bg-white/10" />
            <Shimmer className="h-2.5 w-16 bg-white/10" />
          </div>
          <div className="grid items-end gap-8 pt-3.5 pb-10 lg:grid-cols-[1fr_440px] lg:gap-14">
            <div>
              <Shimmer className="h-2.5 w-44 bg-white/10" />
              <Shimmer className="mt-4 h-8 w-72 bg-white/12 lg:h-10 lg:w-[420px]" />
              <div className="mt-4 max-w-[620px] space-y-2">
                <Shimmer className="h-3 w-full bg-white/8" />
                <Shimmer className="h-3 w-5/6 bg-white/8" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-px border border-white/12 bg-white/12">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="bg-k-ink-deep px-5 py-4">
                  <Shimmer className="h-5 w-16 bg-white/12" />
                  <Shimmer className="mt-2.5 h-2 w-28 bg-white/8" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <section className="shell-x border-b border-k-line bg-white py-8 lg:pt-14 lg:pb-15">
          <Shimmer className="h-2.5 w-40" />
          <Shimmer className="mt-3 h-7 w-96" />
          <div className="mt-6 grid grid-cols-2 gap-px border border-k-line bg-k-line lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex min-h-[210px] flex-col bg-white p-5">
                <Shimmer className="h-4 w-24" />
                <Shimmer className="my-auto h-20 w-20" />
                <Shimmer className="h-4 w-16" />
              </div>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-2 gap-px border border-k-line bg-k-line sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="flex min-h-[132px] flex-col gap-2 bg-white p-4">
              <Shimmer className="h-2 w-20" />
              <Shimmer className="my-auto h-14 w-14" />
              <Shimmer className="h-3 w-24" />
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
