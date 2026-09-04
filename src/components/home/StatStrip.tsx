import { CountUp } from "@/components/ui/CountUp";
import { upGreek } from "@/lib/greek";

/**
 * Stat band. Handoff: 2 columns / 16px padding on mobile, 4 columns /
 * 28px × 40px on desktop. Every figure comes from the projection, so none of
 * these can drift from the catalogue.
 */
export function StatStrip({
  stats,
  locale,
}: {
  /*
   * `count` προαιρετικό: μόνο ό,τι ΕΙΝΑΙ αριθμός μετριέται. Το «24-48ω» είναι
   * εύρος, όχι μέγεθος — μια καταμέτρηση πάνω του δεν σημαίνει τίποτα.
   */
  stats: Array<{
    value: string;
    line1: string;
    line2: string;
    count?: number;
    decimals?: number;
    suffix?: string;
  }>;
  locale: string;
}) {
  return (
    <section className="border-y border-k-line bg-white">
      <div className="shell-w grid grid-cols-2 gap-px bg-k-line lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.line1 + stat.line2}
            className="flex flex-col gap-1 bg-white p-4 lg:flex-row lg:items-center lg:gap-4 lg:px-10 lg:py-7"
          >
            {/* Never wrap the figure — "24-48ω" breaking in two reads as two stats. */}
            <span className="t-stat-num whitespace-nowrap text-k-ink">
              {stat.count == null ? (
                stat.value
              ) : (
                <CountUp
                  value={stat.count}
                  locale={locale}
                  decimals={stat.decimals}
                  suffix={stat.suffix}
                />
              )}
            </span>
            <span className="t-stat-label text-k-text-4">
              <span className="block">{upGreek(stat.line1)}</span>
              <span className="block">{upGreek(stat.line2)}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
