import type { OfferDraft, OfferRow } from "@/lib/offers/offer-types";

/**
 * A saved offer as the wizard wants it.
 *
 * Dates become `datetime-local` strings — local wall clock with no zone, which
 * is what the input speaks. Doing it here rather than in the component keeps
 * the one conversion in one place.
 */
export function toDraft(row: OfferRow): OfferDraft {
  const local = (date: Date | null) => {
    if (!date) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  return { ...row, startsAt: local(row.startsAt), endsAt: local(row.endsAt) };
}
