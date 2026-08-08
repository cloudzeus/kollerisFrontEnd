/**
 * Google Customer Reviews.
 *
 * Two separate integrations that happen to share a merchant id:
 *
 *   the survey opt-in  — one script on the order confirmation page, which asks
 *                        the customer for permission to email them a survey
 *                        about this order once it should have arrived
 *   the badge          — a floating widget on every page showing the seller
 *                        rating those surveys produce
 *
 * The merchant id is not a secret — it is published in the page source of
 * every site running this, and it identifies one Merchant Center account.
 * Same reasoning as the Search Console verification token in `app/layout.tsx`:
 * making it a required deployment setting only adds a step to a chain that has
 * already dropped one. The environment variable still overrides, for a second
 * account or a staging property.
 */

/**
 * Ο λογαριασμός Merchant Center του καταστήματος: 5834747829.
 *
 * Ήταν `522915672` — αριθμός που ΔΕΝ ανήκει σε αυτό το κατάστημα. Δεν υπήρχε
 * ούτε env override, οπότε κάθε σελίδα επιβεβαίωσης ζητούσε από το Google να
 * στείλει έρευνα ικανοποίησης εκ μέρους ξένου λογαριασμού. Το Google δεν
 * επιστρέφει σφάλμα σε αυτό — απλώς δεν εμφανίζει ποτέ τη συμμετοχή, οπότε το
 * σύμπτωμα ήταν «δεν μαζεύουμε αξιολογήσεις» χωρίς κανένα ίχνος αιτίας.
 *
 * Ο αριθμός δεν είναι μυστικό: δημοσιεύεται στον πηγαίο κώδικα κάθε σελίδας
 * και ταυτοποιεί έναν λογαριασμό Merchant Center. Ίδιο σκεπτικό με το token
 * επαλήθευσης του Search Console — το να γίνει υποχρεωτική ρύθμιση deployment
 * απλώς προσθέτει ένα βήμα σε αλυσίδα που ήδη έχασε ένα.
 *
 * `||`, όχι `??` — μια δηλωμένη αλλά κενή γραμμή .env είναι `""`, και το
 * `"" ?? x` δίνει `""`.
 */
export const MERCHANT_ID = Number(
  process.env.NEXT_PUBLIC_GOOGLE_MERCHANT_ID || "5834747829",
);

/**
 * When the parcel should be with the customer, as `YYYY-MM-DD`.
 *
 * Google uses this to decide when to send the survey — too early and the
 * customer is asked about something that has not arrived, which is worse than
 * not asking. Derived from the same ACS zone table the checkout quotes from,
 * so the estimate the survey waits for is the estimate the customer was given.
 *
 * `etaDays` is a range like "2-4"; the upper bound is taken, then two days of
 * slack, because a survey that arrives a day late costs nothing and one that
 * arrives a day early costs a review.
 */
export function estimatedDeliveryDate(
  placedAt: Date,
  etaDays: string | null | undefined,
  shippingMethod: string,
): string {
  // Pickup has no delivery: ready in about two hours, so the survey may as
  // well go out on the next working day.
  if (shippingMethod === "pickup") return isoDate(addDays(placedAt, 1));

  const upperBound = Number((etaDays ?? "").split("-").pop()) || 3;
  return isoDate(addDays(placedAt, upperBound + 2));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
