"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { submitReview } from "@/lib/account/review-actions";
import type { ReviewableItem } from "@/lib/account/reviews";
import { cn } from "@/lib/utils";

const STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "Σε έλεγχο", className: "bg-k-amber text-white" },
  approved: { label: "Δημοσιευμένη", className: "bg-k-green text-white" },
  rejected: { label: "Δεν δημοσιεύτηκε", className: "bg-k-red-600 text-white" },
};

/**
 * Η φόρμα αξιολόγησης, μία ανά προϊόν.
 *
 * Κλειστή μέχρι να πατηθεί: ο πελάτης με δώδεκα παραγγελίες θα έβλεπε δώδεκα
 * ανοιχτές φόρμες και θα έφευγε. Ανοιχτή είναι μόνο η μία που δουλεύει.
 *
 * Τα αστέρια είναι radio, όχι κουμπιά με state: δουλεύουν με πληκτρολόγιο και
 * με screen reader χωρίς να γραφτεί τίποτα γι' αυτό, και η φόρμα υποβάλλεται
 * σωστά ακόμη κι αν το JavaScript δεν έχει φορτώσει.
 */
export function ReviewForm({ item }: { item: ReviewableItem }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(item.existing?.rating ?? 0);
  const [pending, start] = useTransition();
  const status = item.existing ? STATUS[item.existing.status] : null;

  return (
    <li className="border border-k-line bg-white">
      <div className="flex gap-3.5 p-3.5">
        <span className="flex size-16 shrink-0 items-center justify-center border border-k-line bg-k-surface-2 p-1.5">
          {item.image ? (
            <Image
              src={item.image}
              alt=""
              width={56}
              height={56}
              unoptimized
              className="h-full w-auto object-contain"
            />
          ) : null}
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="line-clamp-2 text-[13.5px] leading-[1.4] font-semibold text-k-ink">
            {item.name}
          </p>
          <p className="t-card-sku text-k-text-4">
            {item.orderNumber} · {item.purchasedAt.toLocaleDateString("el-GR")}
          </p>

          {status && (
            <span className="mt-0.5 flex flex-wrap items-center gap-2">
              <span className={cn("t-badge px-1.5 py-[3px]", status.className)}>
                {status.label}
              </span>
              <span className="flex">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className="size-3.5 text-k-gold-ink"
                    fill={n <= (item.existing?.rating ?? 0) ? "currentColor" : "none"}
                  />
                ))}
              </span>
            </span>
          )}

          {/* Ο λόγος απόρριψης, ορατός. Μια κριτική που εξαφανίζεται χωρίς
              εξήγηση διαβάζεται ως λογοκρισία. */}
          {item.existing?.status === "rejected" && item.existing.moderationNote && (
            <p className="mt-1 border border-k-red/30 bg-k-red/5 px-2.5 py-1.5 text-[11.5px] leading-[1.5] text-k-ink">
              {item.existing.moderationNote}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="t-btn-sm h-9 shrink-0 self-start border border-k-line-2 px-3 text-k-ink transition-colors hover:border-k-ink"
        >
          {open ? "Κλείσιμο" : item.existing ? "Επεξεργασία" : "Αξιολόγηση"}
        </button>
      </div>

      {open && (
        <form
          action={(formData) =>
            start(async () => {
              const result = await submitReview(formData);
              if (result.ok) {
                setOpen(false);
                toast.success("Η αξιολόγηση στάλθηκε για έλεγχο.");
              } else {
                toast.error(result.error);
              }
            })
          }
          className="space-y-3 border-t border-k-line px-3.5 py-4"
        >
          <input type="hidden" name="productId" value={item.productId} />

          <fieldset>
            <legend className="t-account-label mb-1.5 text-k-text-3">Βαθμολογία</legend>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="cursor-pointer">
                  <input
                    type="radio"
                    name="rating"
                    value={n}
                    checked={rating === n}
                    onChange={() => setRating(n)}
                    className="sr-only"
                    required
                  />
                  <Star
                    className={cn(
                      "size-7 transition-colors",
                      n <= rating ? "text-k-gold-ink" : "text-k-line-2",
                    )}
                    fill={n <= rating ? "currentColor" : "none"}
                  />
                  <span className="sr-only">{n} από 5</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="t-account-label mb-1 block text-k-text-3">Τίτλος (προαιρετικό)</span>
            <input
              name="title"
              maxLength={120}
              defaultValue={item.existing?.title ?? ""}
              className="h-10 w-full border border-k-line-2 bg-white px-3 text-[13.5px] text-k-ink outline-none focus:border-k-ink"
            />
          </label>

          <label className="block">
            <span className="t-account-label mb-1 block text-k-text-3">Η εμπειρία σας</span>
            <textarea
              name="body"
              rows={4}
              minLength={20}
              maxLength={4000}
              required
              defaultValue={item.existing?.body ?? ""}
              placeholder="Πώς δούλεψε στη δουλειά σας; Τι θα θέλατε να ξέρετε πριν το αγοράσετε;"
              className="w-full border border-k-line-2 bg-white px-3 py-2 text-[13.5px] leading-[1.6] text-k-ink outline-none focus:border-k-ink"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] leading-[1.5] text-k-text-4">
              Δημοσιεύεται μετά από έλεγχο. Κάθε αλλαγή περνά ξανά από έλεγχο.
            </p>
            <button
              type="submit"
              disabled={pending || rating === 0}
              className="font-sans h-10 shrink-0 bg-k-ink-deep px-6 text-[13px] font-bold tracking-[0.08em] text-white transition-colors hover:bg-k-ink disabled:opacity-50"
            >
              {pending ? "…" : "ΑΠΟΣΤΟΛΗ"}
            </button>
          </div>
        </form>
      )}
    </li>
  );
}
