"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Calculator, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { applyOrderPostage, previewOrderPostage } from "@/app/admin/(protected)/orders/actions";
import type { PostagePreview } from "@/lib/orders/postage-correction";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const eur = (v: number) =>
  new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(v);
const kg = (v: number | null) =>
  v == null ? "—" : `${new Intl.NumberFormat("el-GR", { maximumFractionDigits: 2 }).format(v)} kg`;

/**
 * Re-price the postage, look at the difference, then decide.
 *
 * Nothing changes on the first click: the preview is computed and shown next
 * to what the customer was quoted. Only the second step writes, and the one
 * that emails the customer asks once more, naming the address.
 */
export function PostageCorrection({
  orderNumber,
  email,
  suspicious,
}: {
  orderNumber: string;
  email: string;
  suspicious: boolean;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<PostagePreview | null>(null);
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  function recalc() {
    start(async () => {
      const result = await previewOrderPostage(orderNumber);
      if (result.ok) setPreview(result.preview);
      else toast.error(result.error);
    });
  }

  function apply(notify: boolean) {
    start(async () => {
      const result = await applyOrderPostage(orderNumber, { notify, message });
      setConfirming(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (notify && !result.emailed) {
        toast.warning(`Η τιμή διορθώθηκε σε ${eur(result.totalGross)}, αλλά το email δεν στάλθηκε`, {
          description: result.emailError,
        });
      } else {
        toast.success(
          notify
            ? `Στάλθηκε η διορθωμένη προσφορά (${eur(result.totalGross)}) στο ${email}`
            : `Η τιμή διορθώθηκε σε ${eur(result.totalGross)}`,
        );
      }
      setPreview(null);
      router.refresh();
    });
  }

  if (!preview) {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 border-t border-k-line px-4 py-3",
          suspicious && "bg-k-red/5",
        )}
      >
        <p className="text-[12.5px] text-k-text-2">
          {suspicious
            ? "Υπολογίστε ξανά τα μεταφορικά με τα σημερινά στοιχεία πριν απαντήσετε στον πελάτη."
            : "Η παραγγελία δεν έχει πληρωθεί — τα μεταφορικά μπορούν να υπολογιστούν ξανά."}
        </p>
        <Button onClick={recalc} disabled={pending} variant={suspicious ? "default" : "outline"} className="gap-1.5">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Calculator className="size-4" />}
          Επανυπολογισμός
        </Button>
      </div>
    );
  }

  const { before, after } = preview;
  const saving = before.totalGross - after.totalGross;
  const same = Math.abs(saving) < 0.005;

  return (
    <div className="border-t border-k-line">
      <div className="grid gap-px bg-k-line sm:grid-cols-3">
        <Compare label="Μεταφορικά" from={eur(before.shippingGross)} to={eur(after.shippingGross)} />
        <Compare label="Βάρος χρέωσης" from={kg(before.chargeableKg)} to={kg(after.chargeableKg)} />
        <Compare label="Σύνολο παραγγελίας" from={eur(before.totalGross)} to={eur(after.totalGross)} strong />
      </div>

      <div className="space-y-3 px-4 py-3">
        <p className="text-[12px] text-k-text-3">
          {after.source === "acs" ? "Ζωντανή τιμή ACS" : "Πίνακας τιμών (το ACS δεν απάντησε)"} · {after.zoneLabel}
          {" · "}πραγματικό {kg(after.actualKg)}, ογκομετρικό {kg(after.volumetricKg)}
          {after.freeShipping ? " · δωρεάν μεταφορικά" : ""}
          {!same && (
            <>
              {" · "}
              <span className={saving > 0 ? "font-medium text-k-green" : "font-medium text-k-red"}>
                {saving > 0 ? `−${eur(saving)} για τον πελάτη` : `+${eur(-saving)} για τον πελάτη`}
              </span>
            </>
          )}
        </p>

        {same ? (
          <p className="border-l-[3px] border-k-green bg-k-green/8 px-3 py-2 text-[12.5px] text-k-green">
            Ο επανυπολογισμός δίνει το ίδιο ποσό — δεν χρειάζεται διόρθωση.
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="correction-message">Προσωπικό μήνυμα στο email (προαιρετικό)</Label>
              <Textarea
                id="correction-message"
                rows={3}
                maxLength={1500}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="π.χ. Ως ελάχιστη αποζημίωση για την ταλαιπωρία, η παραγγελία σας θα φύγει κατά προτεραιότητα."
              />
              <p className="text-[11.5px] text-k-text-4">
                Το email ήδη ζητά συγγνώμη, εξηγεί ότι δεν έγινε χρέωση και δείχνει παλιά και νέα ποσά με κουμπί πληρωμής.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setPreview(null)} disabled={pending}>
                Άκυρο
              </Button>
              <Button variant="outline" onClick={() => apply(false)} disabled={pending}>
                Μόνο διόρθωση
              </Button>
              <Button onClick={() => setConfirming(true)} disabled={pending} className="gap-1.5">
                <Mail className="size-4" />
                Διόρθωση & αποστολή στον πελάτη
              </Button>
            </div>
          </>
        )}
      </div>

      <AlertDialog open={confirming} onOpenChange={(o) => !pending && setConfirming(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Αποστολή διορθωμένης προσφοράς</AlertDialogTitle>
            <AlertDialogDescription>
              Η παραγγελία {orderNumber} αλλάζει σε {eur(after.totalGross)} (από {eur(before.totalGross)}) και
              στέλνεται email με συγγνώμη και σύνδεσμο πληρωμής στο <strong>{email}</strong>. Ο προηγούμενος
              σύνδεσμος Viva παύει να ισχύει.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Άκυρο</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                apply(true);
              }}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Αποστολή
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Compare({ label, from, to, strong }: { label: string; from: string; to: string; strong?: boolean }) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-k-text-4">{label}</p>
      <p className="numeral mt-1 flex flex-wrap items-center gap-1.5">
        <span className="text-[13px] text-k-red line-through decoration-k-red/60">{from}</span>
        <ArrowRight className="size-3.5 text-k-text-4" aria-hidden />
        <span className={cn("font-semibold text-k-green", strong ? "text-[19px]" : "text-[15px]")}>{to}</span>
      </p>
    </div>
  );
}
