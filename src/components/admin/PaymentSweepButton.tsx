"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { sweepOrderPayments } from "@/app/admin/(protected)/orders/actions";
import { Button } from "@/components/ui/button";

/**
 * «Έλεγχος εκκρεμών πληρωμών» — ask Viva about every order still waiting.
 *
 * The server does this on its own every ~15 minutes; the button is for the
 * morning somebody is on the phone with a customer who says they paid.
 */
export function PaymentSweepButton() {
  const router = useRouter();
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      try {
        const summary = await sweepOrderPayments();
        const description = summary.details.length ? (
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {summary.details.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : undefined;
        if (!summary.ok) toast.info(summary.message, { duration: 10_000 });
        else if (summary.details.length) toast.warning(summary.message, { description, duration: 30_000 });
        else toast.success(summary.message, { duration: 10_000 });
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Ο έλεγχος πληρωμών απέτυχε.");
      }
    });
  }

  return (
    <Button size="sm" variant="outline" onClick={run} disabled={pending} className="gap-1.5">
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
      Έλεγχος εκκρεμών πληρωμών
    </Button>
  );
}
