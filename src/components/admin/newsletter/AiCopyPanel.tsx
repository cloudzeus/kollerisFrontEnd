"use client";

import { useState, useTransition } from "react";
import { Check, Sparkles } from "lucide-react";
import { generateCopyAction } from "@/lib/newsletter/campaign-actions";
import type { PickedProduct } from "@/lib/newsletter/copy";
import { cn } from "@/lib/utils";

/**
 * Παραγωγή κειμένων με AI, με γωνία που διαλέγει ο συντάκτης.
 *
 * ── Δύο κανόνες που καθορίζουν τη διεπαφή ─────────────────────────────────
 *
 * 1. ΤΙΠΟΤΑ δεν αντικαθίσταται αυτόματα. Ό,τι βγαίνει εμφανίζεται δίπλα, και ο
 *    συντάκτης πατά «Εφαρμογή» αν του αρέσει. Κείμενο που άλλαξε μόνο του ενώ ο
 *    άνθρωπος κοίταζε αλλού είναι ο πιο σίγουρος τρόπος να φύγει καμπάνια που
 *    κανείς δεν διάβασε.
 *
 * 2. Η γωνία δηλώνεται πριν, όχι μετά. Το ίδιο σετ προϊόντων πουλιέται με
 *    τελείως διαφορετικό λόγο ανάλογα με το γιατί — λήγει η προσφορά, είναι
 *    φθηνό, ή αντέχει. Το μοντέλο δεν μπορεί να το μαντέψει· ο συντάκτης το
 *    ξέρει.
 */

const ANGLE_OPTIONS = [
  { id: "urgency", label: "Επείγον / λήξη", hint: "Η προσφορά τελειώνει" },
  { id: "price", label: "Τιμή / αξία", hint: "Το ποσοστό και η τελική τιμή" },
  { id: "quality", label: "Ποιότητα / αντοχή", hint: "Γιατί αξίζει, όχι γιατί είναι φθηνό" },
  { id: "b2b", label: "Επαγγελματίας / B2B", hint: "Εξοπλισμός συνεργείου, προμήθειες" },
  { id: "practical", label: "Πρακτικό / χρήση", hint: "Σε ποια δουλειά χρησιμεύει" },
] as const;

type Generated = {
  subject: string;
  preheader: string;
  eyebrow: string;
  title: string;
  text: string;
};

export function AiCopyPanel({
  products,
  validUntil,
  onApply,
}: {
  products: PickedProduct[];
  validUntil: string;
  onApply: (copy: Generated) => void;
}) {
  const [angle, setAngle] = useState<(typeof ANGLE_OPTIONS)[number]["id"]>("price");
  const [result, setResult] = useState<Generated | null>(null);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(false);
  const [pending, start] = useTransition();

  const run = () => {
    setError("");
    setApplied(false);
    start(async () => {
      const res = await generateCopyAction({ angle, products, validUntil });
      if (res.ok) setResult(res.copy);
      else {
        setResult(null);
        setError(res.error);
      }
    });
  };

  return (
    <div className="border border-neutral-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3">
        <p className="flex items-center gap-2 text-[13px] font-semibold">
          <Sparkles className="h-4 w-4 text-violet-600" />
          Πρόταση κειμένων με AI
        </p>
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="inline-flex h-8 items-center gap-1.5 bg-violet-600 px-3 text-[12px] font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
        >
          {pending ? "Γράφει…" : result ? "Ξαναδοκίμασε" : "Δημιουργία"}
        </button>
      </div>

      <div className="p-4">
        <p className="text-[12px] font-medium">Γωνία της καμπάνιας</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {ANGLE_OPTIONS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAngle(a.id)}
              title={a.hint}
              className={cn(
                "border px-2.5 py-1.5 text-left text-[12px] transition-colors",
                angle === a.id
                  ? "border-violet-600 bg-violet-50 text-violet-800"
                  : "border-neutral-200 hover:border-neutral-400",
              )}
            >
              {a.label}
            </button>
          ))}
        </div>

        <p className="mt-2 text-[11px] leading-snug text-neutral-500">
          {products.length > 0
            ? `Το κείμενο γράφεται από τα ΠΡΑΓΜΑΤΙΚΑ δεδομένα των ${products.length} προϊόντων — μάρκες, εκπτώσεις, εύρος τιμών. Ό,τι δεν υπάρχει στα δεδομένα, δεν επινοείται.`
            : "Δεν έχετε επιλέξει προϊόντα ακόμη. Το κείμενο θα είναι γενικό — επιλέξτε πρώτα προϊόντα για συγκεκριμένο αποτέλεσμα."}
        </p>

        {error && (
          <p className="mt-3 border border-amber-200 bg-amber-50 p-2.5 text-[12px] text-amber-800">
            {error}
          </p>
        )}

        {result && (
          <div className="mt-4 space-y-2.5 border-t border-neutral-100 pt-4">
            <Suggestion label="Θέμα email" value={result.subject} limit={55} />
            <Suggestion label="Preheader" value={result.preheader} limit={100} />
            <Suggestion label="Επικεφαλίδα" value={result.eyebrow} limit={45} />
            <Suggestion label="Τίτλος" value={result.title} limit={40} />
            <Suggestion label="Κείμενο" value={result.text} limit={180} />

            <button
              type="button"
              onClick={() => {
                onApply(result);
                setApplied(true);
              }}
              className="mt-2 inline-flex h-8 items-center gap-1.5 border border-neutral-900 px-3 text-[12px] font-semibold transition-colors hover:bg-neutral-900 hover:text-white"
            >
              {applied ? <Check className="h-3.5 w-3.5" /> : null}
              {applied ? "Εφαρμόστηκε" : "Εφαρμογή στα πεδία"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Κάθε πρόταση με τον μετρητή της.
 *
 * Το όριο δεν είναι διακοσμητικό: ένα θέμα 70 χαρακτήρων κόβεται στο κινητό και
 * ο παραλήπτης διαβάζει τη μισή πρόταση. Το μοντέλο τα τηρεί συνήθως — «συνήθως»
 * είναι ο λόγος που ο αριθμός φαίνεται.
 */
function Suggestion({ label, value, limit }: { label: string; value: string; limit: number }) {
  const over = value.length > limit;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-medium text-neutral-500">{label}</span>
        <span
          className={cn(
            "font-mono text-[10px] tabular-nums",
            over ? "font-semibold text-red-600" : "text-neutral-400",
          )}
        >
          {value.length}/{limit}
        </span>
      </div>
      <p className={cn("text-[13px] leading-snug", !value && "text-neutral-400 italic")}>
        {value || "δεν παρήχθη"}
      </p>
    </div>
  );
}
