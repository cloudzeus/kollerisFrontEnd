import { upGreek } from "@/lib/greek";

export type SiteReview = {
  text: string;
  name: string;
  role: string;
};

/**
 * Google reviews band.
 *
 * Handoff: mobile 390 shows only the rating, stars and a one-line summary —
 * the three quote cards are desktop-only.
 *
 * Static until the CMS `SiteReview` model exists (Phase 3, admin screen 15).
 * HDCtool's `/api/serp/reviews` is per-product and admin-gated, so it cannot
 * back this band. Per the spec's edge case, the whole band is skipped when
 * there are no reviews rather than rendering an empty shell.
 */
export function ReviewsBand({
  rating,
  reviewCount,
  reviews,
  copy
}: {
  rating: string;
  reviewCount: number;
  reviews: SiteReview[];
  copy: Record<string, string>
}) {
  if (reviews.length === 0) return null;

  const stars = [0, 1, 2, 3, 4];

  return (
    <section className="bg-k-ink shell-x py-7 lg:pt-15 lg:pb-16">
      <div className="grid gap-6 lg:grid-cols-[340px_1fr] lg:gap-14">
        <div>
          <p className="t-eyebrow mb-3 text-k-red lg:mb-3.5">
            {upGreek(copy.title)}
          </p>
          <div className="flex items-baseline gap-2.5 lg:gap-3">
            <span className="t-review-rating text-white">{rating}</span>
            <span className="t-news-body hidden text-white/50 lg:inline">/ 5,0</span>
            <span
              className="flex gap-[3px] lg:hidden"
              aria-label={`${rating} στα 5`}
            >
              {stars.map((i) => (
                <span key={i} className="text-sm text-k-red">
                  ★
                </span>
              ))}
            </span>
          </div>
          <p className="mt-3.5 hidden gap-1 lg:flex" aria-label={`${rating} στα 5`}>
            {stars.map((i) => (
              <span key={i} className="text-lg text-k-red">
                ★
              </span>
            ))}
          </p>
          <p className="t-review-text mt-3.5 text-white/60 lg:mt-4">
            Βασισμένο σε {reviewCount} αξιολογήσεις επαγγελματιών, συνεργείων και
            ναυπηγείων.
          </p>
        </div>

        <div className="hidden gap-px border border-white/10 bg-white/10 md:grid md:grid-cols-3">
          {reviews.map((review) => (
            <figure key={review.name} className="flex flex-col gap-3.5 bg-k-ink p-[26px]">
              <p className="flex gap-[3px]" aria-hidden>
                {stars.map((i) => (
                  <span key={i} className="text-[13px] text-k-red">
                    ★
                  </span>
                ))}
              </p>
              <blockquote className="t-review-text flex-1 text-white/86">
                {review.text}
              </blockquote>
              <figcaption className="border-t border-white/12 pt-[13px]">
                <span className="t-review-name block text-white">{review.name}</span>
                <span className="t-review-role mt-[3px] block text-white/42">
                  {review.role}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
