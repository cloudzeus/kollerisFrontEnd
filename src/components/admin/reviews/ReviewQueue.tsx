"use client";

import { useState, useTransition } from "react";
import { Check, ExternalLink, Star, X } from "lucide-react";
import { toast } from "sonner";
import { approveReview, rejectReview } from "@/app/admin/(protected)/reviews/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ReviewRow = {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  status: string;
  moderationNote: string | null;
  moderatedBy: string | null;
  orderNumber: string | null;
  createdAt: string;
  productSlug: string;
  productName: string;
  customerName: string;
  customerEmail: string;
};

/**
 * Η ουρά μετριασμού.
 *
 * Η απόρριψη ΑΠΑΙΤΕΙ λόγο, και ο λόγος φτάνει στον πελάτη. Κριτική που
 * εξαφανίζεται χωρίς εξήγηση διαβάζεται ως λογοκρισία — και επιστρέφει ως
 * τηλεφώνημα, που κοστίζει περισσότερο από το να γραφτεί μια γραμμή εδώ.
 *
 * Η έγκριση είναι ένα κλικ, η απόρριψη δύο. Σκόπιμα: η έγκριση είναι η
 * συνηθισμένη περίπτωση, και η απόρριψη πρέπει να είναι απόφαση.
 */
function Stars({ value }: { value: number }) {
  return (
    <span className="flex" aria-label={`${value} από 5`}>
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

function Card({ review, actionable }: { review: ReviewRow; actionable: boolean }) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  return (
    <li className="border border-k-line bg-white p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <a
            href={`/proion/${review.productSlug}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-[13px] font-semibold text-k-ink hover:text-k-red"
          >
            <span className="line-clamp-1">{review.productName}</span>
            <ExternalLink className="size-3 shrink-0 text-k-text-4" />
          </a>
          <p className="mt-0.5 text-[11px] text-k-text-4">
            {review.customerName} · {review.customerEmail}
            {review.orderNumber ? ` · ${review.orderNumber}` : ""} ·{" "}
            {new Date(review.createdAt).toLocaleDateString("el-GR")}
          </p>
        </div>
        <Stars value={review.rating} />
      </div>

      {review.title && (
        <p className="mt-2.5 text-[13px] font-semibold text-k-ink">{review.title}</p>
      )}
      <p className="mt-1 text-[12.5px] leading-[1.6] whitespace-pre-line text-k-text-2">
        {review.body}
      </p>

      {!actionable && (
        <p
          className={cn(
            "mt-2.5 border px-2.5 py-1.5 text-[11.5px] leading-[1.5]",
            review.status === "approved"
              ? "border-k-green/30 bg-k-green/5 text-k-ink"
              : "border-k-red/30 bg-k-red/5 text-k-ink",
          )}
        >
          {review.status === "approved" ? "Δημοσιευμένη" : "Απορρίφθηκε"}
          {review.moderatedBy ? ` · ${review.moderatedBy}` : ""}
          {review.moderationNote ? ` — ${review.moderationNote}` : ""}
        </p>
      )}

      {actionable && (
        <div className="mt-3 space-y-2">
          {rejecting && (
            <Input
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={400}
              placeholder="Ο λόγος — τον διαβάζει ο πελάτης."
              className="h-9 text-[12.5px]"
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await approveReview(review.id);
                  toast.success("Δημοσιεύτηκε.");
                })
              }
              className="h-8"
            >
              <Check className="size-3.5" />
              Έγκριση
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending || (rejecting && note.trim().length === 0)}
              onClick={() => {
                if (!rejecting) {
                  setRejecting(true);
                  return;
                }
                start(async () => {
                  await rejectReview(review.id, note);
                  setRejecting(false);
                  toast.success("Απορρίφθηκε.");
                });
              }}
              className="h-8 text-k-text-3 hover:text-k-red"
            >
              <X className="size-3.5" />
              {rejecting ? "Επιβεβαίωση απόρριψης" : "Απόρριψη"}
            </Button>
            {rejecting && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRejecting(false);
                  setNote("");
                }}
                className="h-8"
              >
                Ακύρωση
              </Button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

export function ReviewQueue({
  pending,
  decided,
}: {
  pending: ReviewRow[];
  decided: ReviewRow[];
}) {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2.5 text-[12px] font-medium tracking-[0.08em] text-k-text-3 uppercase">
          Σε αναμονή <span className="numeral">({pending.length})</span>
        </h2>
        {pending.length === 0 ? (
          <p className="border border-k-line bg-white px-4 py-8 text-center text-[12.5px] text-k-text-3">
            Καμία αξιολόγηση δεν περιμένει έλεγχο.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {pending.map((r) => (
              <Card key={r.id} review={r} actionable />
            ))}
          </ul>
        )}
      </section>

      {decided.length > 0 && (
        <section>
          <h2 className="mb-2.5 text-[12px] font-medium tracking-[0.08em] text-k-text-3 uppercase">
            Κριμένες
          </h2>
          <ul className="space-y-2.5">
            {decided.map((r) => (
              <Card key={r.id} review={r} actionable={false} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
