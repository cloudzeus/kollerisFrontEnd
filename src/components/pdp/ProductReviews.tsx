import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export type ReviewView = {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  createdAt: Date;
  customer: { firstName: string; lastName: string };
};

/** «Γιάννης Κ.» — όνομα και αρχικό, ποτέ ολόκληρο επώνυμο. */
function displayName(c: { firstName: string; lastName: string }): string {
  const initial = c.lastName.trim().charAt(0);
  return initial ? `${c.firstName.trim()} ${initial}.` : c.firstName.trim();
}

function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("flex", className)} aria-label={`${value} από 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          className="size-3.5 text-k-gold-ink"
          fill={n <= value ? "currentColor" : "none"}
        />
      ))}
    </span>
  );
}

/**
 * Οι αξιολογήσεις του προϊόντος.
 *
 * Μόνο εγκεκριμένες, και μόνο από πελάτες που το αγόρασαν — η αγορά είναι
 * προϋπόθεση, γι' αυτό δεν χρειάζεται σήμα «επιβεβαιωμένη αγορά» δίπλα σε κάθε
 * μία: αν φαίνεται εδώ, είναι.
 *
 * Όνομα και αρχικό επωνύμου. Ολόκληρο το επώνυμο δίπλα σε μια γνώμη είναι
 * προσωπικό δεδομένο που κανείς δεν συμφώνησε να δημοσιεύσει, και σε αγορά
 * επαγγελματικού εξοπλισμού ο πελάτης είναι συχνά αναγνωρίσιμος.
 *
 * Δεν εμφανίζεται καθόλου χωρίς κριτικές: μια ενότητα «Αξιολογήσεις (0)» λέει
 * μόνο ότι κανείς δεν αγόρασε — και το λέει σε κάθε νέο προϊόν.
 */
export function ProductReviews({
  reviews,
  average,
  count,
}: {
  reviews: ReviewView[];
  average: number | null;
  count: number;
}) {
  if (reviews.length === 0) return null;

  return (
    <section className="band-base">
      <div className="pdp-band py-9 lg:py-14">
        <div className="pdp-inner">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
            <h2 className="font-display t-display text-[20px] leading-tight text-k-ink lg:text-[24px]">
              ΑΞΙΟΛΟΓΗΣΕΙΣ
            </h2>
            {average != null && (
              <span className="flex items-center gap-2">
                <Stars value={Math.round(average)} />
                <span className="numeral text-[13.5px] font-semibold text-k-ink">
                  {average.toFixed(1).replace(".", ",")}
                </span>
                <span className="text-[12.5px] text-k-text-3">
                  από <span className="numeral">{count}</span>{" "}
                  {count === 1 ? "πελάτη" : "πελάτες"}
                </span>
              </span>
            )}
          </div>

          <p className="mt-1.5 text-[12.5px] text-k-text-3">
            Γράφουν μόνο πελάτες που παρέλαβαν το προϊόν.
          </p>

          <ul className="mt-6 grid gap-3 md:grid-cols-2">
            {reviews.map((review) => (
              <li key={review.id} className="border border-k-line bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Stars value={review.rating} />
                  <span className="t-card-sku text-k-text-4">
                    {review.createdAt.toLocaleDateString("el-GR")}
                  </span>
                </div>
                {review.title && (
                  <p className="mt-2 text-[13.5px] font-semibold text-k-ink">{review.title}</p>
                )}
                <p className="mt-1.5 text-[13px] leading-[1.65] whitespace-pre-line text-k-text-2">
                  {review.body}
                </p>
                <p className="mt-2.5 text-[11.5px] text-k-text-4">
                  {displayName(review.customer)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
