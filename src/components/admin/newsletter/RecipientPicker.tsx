"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, Check, Search, Upload, Users } from "lucide-react";
import {
  parseRecipientListAction,
  searchSubscribersAction,
  type SubscriberRow,
} from "@/lib/newsletter/campaign-actions";
import { cn } from "@/lib/utils";

export type RecipientChoice =
  | {
      mode: "subscribers";
      /**
       * Κενό = ΟΛΟΙ οι επιβεβαιωμένοι. Γεμάτο = μόνο αυτοί.
       *
       * Το «κενό σημαίνει όλοι» δεν είναι σιωπηλή παραδοχή: ο μετρητής από
       * πάνω λέει πάντα σε πόσους θα φύγει, οπότε η κατάσταση είναι ορατή
       * χωρίς να χρειάζεται να τη συμπεράνει κανείς από το πλήθος επιλογών.
       */
      onlyIds?: string[];
    }
  | { mode: "upload"; rows: Array<{ email: string; name: string }> };

/**
 * Ποιοι θα το λάβουν.
 *
 * Δύο πηγές, και η διαφορά τους δεν είναι τεχνική: η λίστα συνδρομητών είναι
 * άνθρωποι που ΖΗΤΗΣΑΝ να λαμβάνουν, το ανέβασμα είναι άνθρωποι που κάποιος
 * αποφάσισε ότι θέλουν. Η δεύτερη περίπτωση υπάρχει επειδή χρειάζεται —
 * υπάρχουσα λίστα πελατών, έκθεση, κατάλογος B2B — αλλά δεν πρέπει να μοιάζει
 * με την πρώτη, γι' αυτό η αναφορά ελέγχου είναι ρητή και δείχνει τι κόπηκε.
 */
export function RecipientPicker({
  confirmedCount,
  value,
  onChange,
}: {
  confirmedCount: number;
  value: RecipientChoice;
  onChange: (next: RecipientChoice) => void;
}) {
  const [report, setReport] = useState<{
    valid: number;
    invalid: string[];
    duplicates: number;
    unsubscribed: string[];
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const ingest = (raw: string) => {
    startTransition(async () => {
      const parsed = await parseRecipientListAction(raw);
      setReport({
        valid: parsed.valid.length,
        invalid: parsed.invalid,
        duplicates: parsed.duplicates,
        unsubscribed: parsed.unsubscribed,
      });
      onChange({ mode: "upload", rows: parsed.valid });
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onChange({ mode: "subscribers" })}
          className={cn(
            "flex items-start gap-3 border p-4 text-left transition-colors",
            value.mode === "subscribers"
              ? "border-neutral-900 bg-neutral-900 text-white"
              : "border-neutral-200 bg-white hover:border-neutral-400",
          )}
        >
          <Users className="mt-0.5 h-5 w-5 shrink-0" />
          <span>
            <span className="block text-[13px] font-semibold">Λίστα συνδρομητών</span>
            <span
              className={cn(
                "mt-0.5 block text-[12px]",
                value.mode === "subscribers" ? "text-white/70" : "text-neutral-500",
              )}
            >
              {confirmedCount.toLocaleString("el-GR")} επιβεβαιωμένοι. Οι σε αναμονή δεν
              περιλαμβάνονται.
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className={cn(
            "flex items-start gap-3 border p-4 text-left transition-colors",
            value.mode === "upload"
              ? "border-neutral-900 bg-neutral-900 text-white"
              : "border-neutral-200 bg-white hover:border-neutral-400",
          )}
        >
          <Upload className="mt-0.5 h-5 w-5 shrink-0" />
          <span>
            <span className="block text-[13px] font-semibold">Ανέβασμα λίστας</span>
            <span
              className={cn(
                "mt-0.5 block text-[12px]",
                value.mode === "upload" ? "text-white/70" : "text-neutral-500",
              )}
            >
              CSV ή απλό κείμενο — μία διεύθυνση ανά γραμμή, προαιρετικά με όνομα.
            </span>
          </span>
        </button>
      </div>

      {value.mode === "subscribers" && (
        <SubscriberSearch
          selected={value.onlyIds ?? []}
          onChange={(ids) => onChange({ mode: "subscribers", onlyIds: ids })}
        />
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          ingest(await file.text());
          e.target.value = "";
        }}
      />

      {value.mode === "upload" && (
        <div className="border border-neutral-200 bg-white p-4">
          <label htmlFor="paste-list" className="block text-[12px] font-semibold">
            …ή επικολλήστε απευθείας
          </label>
          <textarea
            id="paste-list"
            rows={5}
            onBlur={(e) => e.target.value.trim() && ingest(e.target.value)}
            placeholder={"nikos@example.gr, Νίκος Παπαδόπουλος\nmaria@example.gr"}
            className="mt-2 w-full border border-neutral-300 p-2.5 font-mono text-[12px] outline-none focus:border-neutral-900"
          />
          <p className="mt-1 text-[11px] text-neutral-500">
            Ο έλεγχος τρέχει όταν φύγετε από το πεδίο.
          </p>
        </div>
      )}

      {pending && <p className="text-[12px] text-neutral-500">Έλεγχος λίστας…</p>}

      {report && value.mode === "upload" && (
        <div className="space-y-2 border border-neutral-200 bg-neutral-50 p-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold">
            <Check className="h-4 w-4 text-emerald-600" />
            {report.valid.toLocaleString("el-GR")} έγκυροι παραλήπτες
          </p>
          {report.duplicates > 0 && (
            <p className="text-[12px] text-neutral-600">
              {report.duplicates} διπλές εγγραφές αφαιρέθηκαν.
            </p>
          )}
          {report.unsubscribed.length > 0 && (
            <p className="flex items-start gap-2 text-[12px] text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {report.unsubscribed.length} διευθύνσεις εξαιρέθηκαν επειδή έχουν διαγραφεί ή
                απορριφθεί. Η διαγραφή είναι δήλωση του παραλήπτη και δεν παρακάμπτεται από
                ανέβασμα.
              </span>
            </p>
          )}
          {report.invalid.length > 0 && (
            <details className="text-[12px] text-neutral-600">
              <summary className="cursor-pointer">
                {report.invalid.length} γραμμές δεν είναι διευθύνσεις
              </summary>
              <ul className="mt-1.5 max-h-32 overflow-y-auto font-mono text-[11px] text-neutral-500">
                {report.invalid.slice(0, 50).map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Αναζήτηση και στοχευμένη επιλογή μέσα στους συνδρομητές.
 *
 * Προεπιλογή είναι «όλοι», και μένει έτσι όσο δεν αγγίξει κανείς τα κουτάκια —
 * η συχνή περίπτωση δεν πρέπει να απαιτεί ενέργεια. Μόλις επιλεγεί έστω ένας,
 * η αποστολή περιορίζεται σε αυτούς και το λέει καθαρά.
 */
function SubscriberSearch({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<SubscriberRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pending, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      startTransition(async () => {
        const res = await searchSubscribersAction(query);
        setRows(res.rows);
        setTotal(res.total);
      });
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query]);

  const picked = new Set(selected);
  const toggle = (id: string) =>
    onChange(picked.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Αναζήτηση σε email ή όνομα…"
            className="h-9 w-full border border-neutral-300 pr-3 pl-9 text-[13px] outline-none focus:border-neutral-900"
          />
        </div>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[12px] font-medium text-neutral-600 underline underline-offset-2 hover:text-neutral-900"
          >
            Καθαρισμός επιλογής — αποστολή σε όλους
          </button>
        )}
      </div>

      <p className="mt-2 text-[11px] text-neutral-500">
        {pending
          ? "Αναζήτηση…"
          : selected.length > 0
            ? `Επιλεγμένοι ${selected.length} — θα σταλεί ΜΟΝΟ σε αυτούς.`
            : `${total.toLocaleString("el-GR")} βρέθηκαν. Χωρίς επιλογή, στέλνεται σε όλους τους επιβεβαιωμένους.`}
      </p>

      <ul className="mt-3 max-h-[280px] space-y-1 overflow-y-auto pr-1">
        {rows.map((r) => (
          <li key={r.id}>
            <label className="flex cursor-pointer items-center gap-3 border border-neutral-100 px-2.5 py-2 hover:bg-neutral-50">
              <input
                type="checkbox"
                checked={picked.has(r.id)}
                onChange={() => toggle(r.id)}
                className="h-3.5 w-3.5"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium">
                  {r.name || r.email}
                </span>
                {r.name && (
                  <span className="block truncate font-mono text-[11px] text-neutral-500">
                    {r.email}
                  </span>
                )}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-neutral-400">{r.createdAt}</span>
            </label>
          </li>
        ))}
        {!pending && rows.length === 0 && (
          <li className="border border-dashed border-neutral-200 p-5 text-center text-[12px] text-neutral-500">
            {query.trim().length >= 2
              ? "Κανένας συνδρομητής με αυτά τα στοιχεία."
              : "Δεν υπάρχουν ακόμη επιβεβαιωμένοι συνδρομητές."}
          </li>
        )}
      </ul>
    </div>
  );
}
