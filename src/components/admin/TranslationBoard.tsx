"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Languages, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  actionListMissing,
  actionSetTranslation,
  actionTranslateMissing,
} from "@/app/admin/(protected)/translations/actions";
import { HARDCODED_UI, type SourceCoverage, type TranslatableSource } from "@/lib/i18n/coverage-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/admin/PageShell";
import { cn } from "@/lib/utils";

/**
 * What actually changes when the language changes.
 *
 * The number that matters is not how many fields are filled — the catalogue
 * sync fills all three languages with the Greek name when it has nothing
 * better, so a column can be 100% full and 0% translated. Everything here
 * counts a value identical to the Greek as MISSING, because that is what a
 * visitor sees.
 */

const LOCALES = [
  { code: "en" as const, label: "Αγγλικά" },
  { code: "it" as const, label: "Ιταλικά" },
];

export function TranslationBoard({ sources }: { sources: SourceCoverage[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<{ source: TranslatableSource; locale: "en" | "it" } | null>(null);
  const [rows, setRows] = useState<Array<{ id: string; el: string; current: string }>>([]);
  const [busy, start] = useTransition();

  function translate(source: TranslatableSource, locale: "en" | "it", count: number) {
    start(async () => {
      const result = await actionTranslateMissing(source, locale, 200);
      if (!result.ok) {
        toast.error(result.error);
        router.refresh();
        return;
      }
      toast.success(
        result.remaining > 0
          ? `Μεταφράστηκαν ${result.translated}. Μένουν ${result.remaining} — πατήστε ξανά.`
          : `Μεταφράστηκαν ${result.translated}. Δεν μένει τίποτα.`,
      );
      router.refresh();
      if (open) void inspect(open.source, open.locale);
    });
  }

  function inspect(source: TranslatableSource, locale: "en" | "it") {
    setOpen({ source, locale });
    start(async () => setRows(await actionListMissing(source, locale)));
  }

  return (
    <div className="space-y-4">
      {sources.map((source) => (
        <Panel key={source.id} title={source.label} description={source.hint}>
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {LOCALES.map(({ code, label }) => {
                const missing = source.missing[code];
                const done = source.total - missing;
                const pct = source.total === 0 ? 100 : Math.round((done / source.total) * 100);

                return (
                  <div key={code} className="border border-k-line p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[12.5px] font-medium text-k-ink">{label}</span>
                      <span
                        className={cn(
                          "numeral text-[12px]",
                          pct === 100 ? "text-k-green" : pct > 50 ? "text-k-amber" : "text-k-red",
                        )}
                      >
                        {pct}%
                      </span>
                    </div>

                    <div className="mt-2 h-1 bg-k-surface-3">
                      <div
                        className={cn(
                          "h-full",
                          pct === 100 ? "bg-k-green" : pct > 50 ? "bg-k-amber" : "bg-k-red",
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <p className="numeral mt-1.5 text-[11px] text-k-text-3">
                      {missing === 0
                        ? `${source.total} μεταφρασμένα`
                        : `${missing} από ${source.total} δείχνουν ακόμη ελληνικά`}
                    </p>

                    {source.translatable && missing > 0 && (
                      <div className="mt-2 flex gap-1.5">
                        <Button
                          size="sm"
                          onClick={() => translate(source.id, code, missing)}
                          disabled={busy}
                          className="text-[11.5px]"
                        >
                          {busy ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Sparkles className="size-3" />
                          )}
                          Μετάφραση {Math.min(200, missing)}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => inspect(source.id, code)}
                          disabled={busy}
                          className="text-[11.5px]"
                        >
                          Δες τα
                        </Button>
                      </div>
                    )}

                    {source.translatable && missing === 0 && (
                      <p className="mt-2 flex items-center gap-1 text-[11px] text-k-green">
                        <Check className="size-3" />
                        Πλήρες
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {!source.translatable && (
              <p className="text-[11.5px] leading-[1.6] text-k-text-3">
                {source.id === "products"
                  ? "Οι μεταφράσεις έρχονται από το HDCtool με τον συγχρονισμό — δεν γράφονται εδώ."
                  : "Οι προσφορές έχουν έναν τίτλο χωρίς πεδία ανά γλώσσα. Χρειάζεται αλλαγή στο μοντέλο πριν μεταφραστούν."}
              </p>
            )}

            {open?.source === source.id && rows.length > 0 && (
              <MissingList
                rows={rows}
                locale={open.locale}
                source={source.id}
                onSaved={() => router.refresh()}
              />
            )}
          </div>
        </Panel>
      ))}

      {/* The extraction pass, now complete. */}
      <Panel title="Κείμενα διεπαφής" description="Ό,τι είναι γραμμένο μέσα στα components.">
        <div className="flex items-start gap-2.5 text-[12.5px] leading-[1.65] text-k-text-2">
          <Check className="mt-0.5 size-4 shrink-0 text-k-green" />
          <span>
            <span className="numeral font-medium text-k-ink">
              {HARDCODED_UI.extracted.toLocaleString("el-GR")}
            </span>{" "}
            κείμενα βγήκαν από τα components στα αρχεία γλώσσας και είναι μεταφρασμένα σε αγγλικά
            και ιταλικά — κουμπιά, ετικέτες, τίτλοι, μηνύματα, μηνύματα σφάλματος. Δεν έμεινε
            ελληνικό κείμενο γραμμένο μέσα σε component του καταστήματος.
            <span className="mt-1 block text-k-text-3">
              Νέα κείμενα γράφονται στα ελληνικά στο <span className="font-mono">el.json</span> και
              μεταφράζονται με το <span className="font-mono">scripts/i18n/translate.mts</span>.
            </span>
          </span>
        </div>
      </Panel>
    </div>
  );
}

/** The rows still in Greek, editable by hand for the ones a model gets wrong. */
function MissingList({
  rows,
  locale,
  source,
  onSaved,
}: {
  rows: Array<{ id: string; el: string; current: string }>;
  locale: "en" | "it";
  source: TranslatableSource;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, start] = useTransition();

  function save(id: string) {
    const value = draft[id]?.trim();
    if (!value) return;
    start(async () => {
      const result = await actionSetTranslation(source, locale, id, value);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Αποθηκεύτηκε.");
      onSaved();
    });
  }

  return (
    <div className="border border-k-line">
      <p className="flex items-center gap-1.5 border-b border-k-line px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-k-text-4">
        <Languages className="size-3" />
        Χωρίς μετάφραση · {locale === "en" ? "αγγλικά" : "ιταλικά"}
      </p>
      <ul className="max-h-80 overflow-y-auto">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-2 border-b border-k-line px-2 py-1.5 last:border-0">
            <span className="min-w-0 flex-1 truncate text-[12px] text-k-text-2">{row.el}</span>
            <Input
              value={draft[row.id] ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, [row.id]: e.target.value }))}
              onBlur={() => save(row.id)}
              placeholder={locale === "en" ? "English…" : "Italiano…"}
              className="h-7 max-w-[16rem] text-[12px]"
              disabled={busy}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
