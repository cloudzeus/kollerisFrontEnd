"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepDef = { id: string; label: string; hint: string };

/**
 * Η ράγα βημάτων.
 *
 * Αριθμημένη επειδή ΕΙΝΑΙ ακολουθία — δεν μπορείς να διαλέξεις παραλήπτες πριν
 * ξέρεις τι στέλνεις. Τα ολοκληρωμένα βήματα γίνονται πατητά προς τα πίσω: ο
 * πιο συχνός λόγος που κάποιος γυρίζει είναι για να αλλάξει μια λέξη στο θέμα,
 * και το να ξαναπερνά από όλα τα ενδιάμεσα είναι τιμωρία.
 *
 * Μπροστά ΔΕΝ πηδάει. Ένα βήμα που δεν συμπληρώθηκε αφήνει την καμπάνια σε
 * κατάσταση που μοιάζει έτοιμη και δεν είναι.
 */
export function StepRail({
  steps,
  current,
  furthest,
  onJump,
}: {
  steps: StepDef[];
  current: number;
  furthest: number;
  onJump: (index: number) => void;
}) {
  return (
    <ol className="flex flex-wrap items-stretch gap-px overflow-hidden border border-neutral-200 bg-neutral-200">
      {steps.map((step, i) => {
        const done = i < furthest;
        const active = i === current;
        const reachable = i <= furthest;
        return (
          <li key={step.id} className="min-w-[168px] flex-1">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => reachable && onJump(i)}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex h-full w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                active ? "bg-neutral-900 text-white" : "bg-white text-neutral-700",
                reachable && !active && "hover:bg-neutral-50",
                !reachable && "cursor-not-allowed text-neutral-400",
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
                  active ? "bg-white text-neutral-900" : done ? "bg-emerald-600 text-white" : "bg-neutral-200 text-neutral-600",
                )}
              >
                {done && !active ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold">{step.label}</span>
                <span
                  className={cn(
                    "block truncate text-[11px]",
                    active ? "text-white/60" : "text-neutral-500",
                  )}
                >
                  {step.hint}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Η προεπισκόπηση, σε iframe.
 *
 * Iframe και όχι `dangerouslySetInnerHTML`: το HTML του email έχει δικά του
 * `<style>`, `<table>` πλάτη και `bgcolor`. Μέσα στη σελίδα του admin θα
 * μολύνονταν αμοιβαία — το Tailwind reset θα ισοπέδωνε τους πίνακες, και τα
 * χρώματα του email θα έβαφαν το admin. Το iframe είναι το μόνο σύνορο που
 * κρατά.
 *
 * `sandbox` χωρίς `allow-scripts`: το περιεχόμενο συντάσσεται από τον χρήστη
 * και δεν υπάρχει λόγος να τρέξει τίποτα.
 */
export function EmailPreview({
  html,
  width,
  loading,
}: {
  html: string;
  width: "desktop" | "mobile";
  loading: boolean;
}) {
  return (
    <div className="relative flex justify-center bg-neutral-100 p-4">
      {loading && (
        <div className="absolute top-3 right-3 z-10 bg-neutral-900/80 px-2 py-1 text-[11px] text-white">
          Ενημέρωση…
        </div>
      )}
      <iframe
        title="Προεπισκόπηση email"
        sandbox="allow-same-origin"
        srcDoc={html || "<p style='font:14px sans-serif;color:#888;padding:24px'>Η προεπισκόπηση θα εμφανιστεί εδώ.</p>"}
        className={cn(
          "h-[720px] border border-neutral-300 bg-white transition-[width] duration-200",
          width === "desktop" ? "w-full max-w-[680px]" : "w-[390px]",
        )}
      />
    </div>
  );
}
