"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Database, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { pushOrderToErp } from "@/app/admin/(protected)/orders/actions";
import { Button } from "@/components/ui/button";

/**
 * «Αποστολή στο SoftOne» στη σελίδα της παραγγελίας.
 *
 * Υπήρχε μόνο στη λίστα. Όταν κάτι πάει στραβά με μια παραγγελία, ο χειριστής
 * είναι ΕΔΩ — και μια πληρωμένη παραγγελία που δεν έφτασε στο ERP δεν είχε
 * από εδώ κανέναν δρόμο.
 */
export function ErpPushButton({ orderNumber }: { orderNumber: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function push() {
    start(async () => {
      const result = await pushOrderToErp(orderNumber);
      if (result.ok) {
        toast.success(
          result.alreadySent
            ? "Είχε ήδη σταλεί στο SoftOne"
            : `Στάλθηκε στο SoftOne — ${result.fincode ?? `FINDOC ${result.findoc}`}`,
        );
      } else {
        toast.error(result.error);
      }
      router.refresh();
    });
  }

  return (
    <div className="pt-2">
      <Button size="sm" onClick={push} disabled={pending}>
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Database className="size-3.5" />}
        {pending ? "Αποστολή…" : "Αποστολή στο SoftOne"}
      </Button>
    </div>
  );
}
