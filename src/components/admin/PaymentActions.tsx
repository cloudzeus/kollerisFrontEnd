"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { recheckOrderPayment, recordOrderPayment } from "@/app/admin/(protected)/orders/actions";
import type { PaymentActionResult } from "@/lib/payment/payment-messages";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const eur = (cents: number) =>
  new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(cents / 100);

/** Same parsing as the server (`parseAmountToCents`), for the inline hint only. */
function centsOf(raw: string): number | null {
  let s = raw.replace(/[\s€]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

const METHOD_LABEL: Record<string, string> = {
  card: "κάρτα",
  bank: "τραπεζική κατάθεση",
  iris: "IRIS",
  credit: "επί πιστώσει",
};

function announce(result: PaymentActionResult) {
  if (!result.ok) {
    toast.error(result.error, { duration: 12_000 });
    return;
  }
  if (result.warnings.length) {
    toast.warning(result.message, { description: result.warnings.join(" "), duration: 20_000 });
  } else {
    toast.success(result.message);
  }
}

/**
 * The two ways an unpaid order becomes paid from the admin.
 *
 * «Επανέλεγχος πληρωμής» first, whenever the order has a Viva payment code:
 * Viva knows about every payment made with that code — card, IRIS, or a bank
 * deposit through e-banking — and the recheck records Viva's own transaction.
 * «Καταχώριση πληρωμής» is the fallback for money that reached the IBAN
 * without the code, and says so louder the less it fits the order.
 */
export function PaymentActions({
  orderNumber,
  paymentMethod,
  totalCents,
  vivaOrderCode,
  createdOn,
  today,
}: {
  orderNumber: string;
  paymentMethod: string;
  totalCents: number;
  vivaOrderCode: string | null;
  /** `YYYY-MM-DD` in Athens — the earliest allowed payment date. */
  createdOn: string;
  /** `YYYY-MM-DD` in Athens — the latest allowed payment date. */
  today: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [paidOn, setPaidOn] = useState(today);
  const [amount, setAmount] = useState((totalCents / 100).toFixed(2).replace(".", ","));
  const [reference, setReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isBank = paymentMethod === "bank";
  const isVivaMethod = paymentMethod === "card" || paymentMethod === "iris";
  const typedCents = centsOf(amount);
  const amountProblem =
    typedCents == null
      ? "Γράψτε το ποσό π.χ. 123,45."
      : typedCents !== totalCents
        ? `Το ποσό πρέπει να είναι ακριβώς ${eur(totalCents)}. Αν πιστώθηκε άλλο ποσό, μην καταχωρίσετε την πληρωμή.`
        : null;
  const dateProblem =
    !paidOn
      ? "Επιλέξτε ημερομηνία."
      : paidOn > today
        ? "Η ημερομηνία δεν μπορεί να είναι μελλοντική."
        : paidOn < createdOn
          ? "Η ημερομηνία δεν μπορεί να είναι πριν από την παραγγελία."
          : null;

  function recheck() {
    start(async () => {
      const result = await recheckOrderPayment(orderNumber);
      announce(result);
      router.refresh();
    });
  }

  function submit() {
    setError(null);
    start(async () => {
      const result = await recordOrderPayment(orderNumber, { paidOn, amount, reference, confirmed });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      announce(result);
      router.refresh();
    });
  }

  return (
    <div className="mt-2 space-y-2 border-t border-k-line pt-2.5">
      {vivaOrderCode ? (
        <p className="text-[11.5px] text-k-text-3">
          Πλήρωσε ο πελάτης με τον κωδικό Viva (κάρτα, IRIS ή κατάθεση μέσω e-banking); Ο επανέλεγχος
          ρωτά τη Viva και, αν βρει την πληρωμή, ολοκληρώνει την παραγγελία όπως η αυτόματη ειδοποίηση.
        </p>
      ) : (
        <p className="text-[11.5px] text-k-text-3">
          Χωρίς κωδικό Viva η πληρωμή δεν μπορεί να ελεγχθεί αυτόματα. Αν τα χρήματα πιστώθηκαν στο
          IBAN, καταχωρίστε την πληρωμή.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {vivaOrderCode && (
          <Button size="sm" onClick={recheck} disabled={pending} className="gap-1.5">
            {pending && !open ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Επανέλεγχος πληρωμής
          </Button>
        )}
        <Button
          size="sm"
          variant={vivaOrderCode ? "outline" : "default"}
          onClick={() => {
            setError(null);
            setConfirmed(false);
            setOpen(true);
          }}
          disabled={pending}
          className="gap-1.5"
        >
          <Banknote className="size-3.5" />
          Καταχώριση πληρωμής
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Καταχώριση πληρωμής · {orderNumber}</DialogTitle>
            <DialogDescription>
              Η παραγγελία σημειώνεται πληρωμένη, στέλνεται η απόδειξη στον πελάτη και η παραγγελία
              προωθείται στο HDCtool για έκδοση παραστατικού.
            </DialogDescription>
          </DialogHeader>

          {vivaOrderCode && (
            <Warning tone="amber">
              Η παραγγελία έχει κωδικό πληρωμής Viva ({vivaOrderCode}). Αν ο πελάτης πλήρωσε με αυτόν —
              ακόμη και με κατάθεση από e-banking — προτιμήστε τον «Επανέλεγχο πληρωμής»: καταγράφει τη
              συναλλαγή της Viva. Χρησιμοποιήστε την καταχώριση μόνο για κατάθεση απευθείας στο IBAN.
            </Warning>
          )}
          {!isBank && (
            <Warning tone="red">
              Η παραγγελία δεν είναι με τραπεζική κατάθεση (μέθοδος: {METHOD_LABEL[paymentMethod] ?? paymentMethod}).
              {isVivaMethod
                ? " Οι πληρωμές με κάρτα/IRIS επιβεβαιώνονται από τη Viva — καταχωρίστε χειροκίνητα μόνο αν έχετε δει τα χρήματα στον λογαριασμό και ο επανέλεγχος δεν τα βρίσκει."
                : " Καταχωρίστε μόνο αν έχετε δει τα χρήματα στον λογαριασμό."}
            </Warning>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="paid-on">Ημερομηνία πίστωσης</Label>
              <Input
                id="paid-on"
                type="date"
                value={paidOn}
                min={createdOn}
                max={today}
                onChange={(e) => setPaidOn(e.target.value)}
                aria-invalid={dateProblem ? true : undefined}
              />
              {dateProblem && <p className="text-[11.5px] text-k-red">{dateProblem}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="paid-amount">Ποσό που πιστώθηκε (€)</Label>
              <Input
                id="paid-amount"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={amountProblem ? true : undefined}
                className="numeral"
              />
              {amountProblem ? (
                <p className="text-[11.5px] text-k-red">{amountProblem}</p>
              ) : (
                <p className="text-[11.5px] text-k-text-4">Σύνολο παραγγελίας {eur(totalCents)}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="paid-reference">Αναφορά τράπεζας / σημείωση (προαιρετικό)</Label>
            <Input
              id="paid-reference"
              maxLength={200}
              autoComplete="off"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="π.χ. αριθμός συναλλαγής"
            />
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-k-ink">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(v === true)}
              className="mt-0.5"
            />
            <span>Επιβεβαίωσα ότι το ποσό έχει πιστωθεί στον λογαριασμό</span>
          </label>

          {error && <Warning tone="red">{error}</Warning>}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Άκυρο
            </Button>
            <Button
              onClick={submit}
              disabled={pending || !confirmed || amountProblem != null || dateProblem != null}
              className="gap-1.5"
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Καταχώριση πληρωμής
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Warning({ tone, children }: { tone: "amber" | "red"; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 border-l-[3px] px-3 py-2 text-[12.5px]",
        tone === "red" ? "border-k-red bg-k-red/8 text-k-red" : "border-k-amber bg-k-amber/10 text-k-amber",
      )}
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
