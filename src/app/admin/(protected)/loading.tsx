import { Shimmer } from "@/components/skeleton/Skeleton";

/** Sits inside the admin shell, so only the content column is replaced. */
export default function Loading() {
  return (
    <div className="p-10">
      <Shimmer className="h-8 w-64" />
      <Shimmer className="mt-3 h-3 w-96" />
      <div className="mt-8 grid gap-px border border-k-line bg-k-line sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="bg-white p-6">
            <Shimmer className="h-2.5 w-28" />
            <Shimmer className="mt-3 h-7 w-20" />
          </div>
        ))}
      </div>
      <div className="mt-10 space-y-px border border-k-line bg-k-line">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-6 bg-white p-3">
            <Shimmer className="h-3 w-32" />
            <Shimmer className="h-3 w-20" />
            <Shimmer className="ml-auto h-3 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
