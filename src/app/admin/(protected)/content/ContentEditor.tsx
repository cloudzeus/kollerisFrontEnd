"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { saveContent } from "./actions";
import { CONTENT, CONTENT_SECTIONS, type ContentView } from "@/lib/content/registry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

/**
 * The copy editor.
 *
 * Two things it does that a plain form would not:
 *
 *   - Says which blocks are still showing the original text, and lets one be
 *     put back with a single button. Editing copy is reversible work, and
 *     "undo" should not mean "retype what it used to say".
 *   - Counts characters against the length the layout was designed for. It is
 *     advice, not a limit — a title that runs two characters over is fine, one
 *     that runs forty over wraps into the image.
 */

const LOCALE_LABEL: Record<string, string> = { el: "Ελληνικά", en: "English", it: "Italiano" };

export function ContentEditor({
  locale,
  locales,
  values,
}: {
  locale: string;
  locales: readonly string[];
  values: ContentView[];
}) {
  const baseline = useMemo(
    () => Object.fromEntries(values.map((v) => [v.key, v.value])) as Record<string, string>,
    [values],
  );
  const fallbackOf = useMemo(
    () => Object.fromEntries(CONTENT.map((c) => [c.key, c.fallback])) as Record<string, string>,
    [],
  );
  const [draft, setDraft] = useState<Record<string, string>>(baseline);
  const [pending, start] = useTransition();

  const dirty = useMemo(
    () => Object.keys(draft).filter((k) => draft[k] !== baseline[k]),
    [draft, baseline],
  );

  function submit() {
    const data = new FormData();
    for (const key of dirty) data.set(key, draft[key]);
    start(async () => {
      const result = await saveContent(locale, data);
      if (result.ok) toast.success(`Αποθηκεύτηκαν ${result.saved} κείμενα.`);
      else result.errors.forEach((e) => toast.error(e));
    });
  }

  return (
    <div className="pb-28">
      {/* Language switch. A tab strip rather than a dropdown: with three
          locales, seeing which exist matters more than saving the space. */}
      <div className="flex items-center gap-1 border-b border-k-line">
        {locales.map((l) => (
          <Link
            key={l}
            href={`/admin/content?locale=${l}`}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] transition-colors ${
              l === locale
                ? "border-k-ink font-medium text-k-ink"
                : "border-transparent text-k-text-3 hover:text-k-ink"
            }`}
          >
            {LOCALE_LABEL[l] ?? l}
          </Link>
        ))}
        <Link
          href="/"
          target="_blank"
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 text-[12px] text-k-text-3 hover:text-k-ink"
        >
          Δείτε το κατάστημα
          <ExternalLink className="size-3" aria-hidden />
        </Link>
      </div>

      <div className="mt-6 space-y-4">
        {CONTENT_SECTIONS.map((section) => {
          const defs = CONTENT.filter((c) => c.section === section.id);
          if (!defs.length) return null;

          return (
            <section key={section.id} aria-labelledby={`sec-${section.id}`} className="border border-k-line bg-white">
              <div className="border-b border-k-line bg-k-surface-3 px-4 py-3">
                <h2
                  id={`sec-${section.id}`}
                  className="text-[15px] font-semibold tracking-tight text-k-ink"
                >
                  {section.title}
                </h2>
                <p className="mt-1 text-[12.5px] text-k-text-3">{section.blurb}</p>
              </div>

              <div className="divide-y divide-k-line px-4">
                {defs.map((def) => {
                  const view = values.find((v) => v.key === def.key);
                  const id = `c-${def.key.replace(/\./g, "-")}`;
                  const value = draft[def.key] ?? "";
                  const changed = value !== baseline[def.key];
                  const isOriginal = value.trim() === fallbackOf[def.key].trim();
                  const over = def.maxChars ? value.length - def.maxChars : 0;

                  return (
                    <div
                      key={def.key}
                      className="grid gap-2 py-5 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:gap-8"
                    >
                      <div className="min-w-0">
                        <Label htmlFor={id} className="text-[13px] text-k-ink">
                          {def.label}
                        </Label>
                        <p className="mt-1 text-[11.5px] leading-[1.55] text-k-text-3">
                          {def.where}
                        </p>
                      </div>

                      <div className="min-w-0">
                        {def.kind === "long" ? (
                          <textarea
                            id={id}
                            rows={3}
                            value={value}
                            onChange={(e) =>
                              setDraft((d) => ({ ...d, [def.key]: e.target.value }))
                            }
                            className="w-full max-w-[36rem] border border-k-line-2 bg-white px-3 py-2 text-[13px] leading-[1.6] text-k-ink outline-none focus:border-k-ink"
                          />
                        ) : (
                          <Input
                            id={id}
                            value={value}
                            placeholder={def.kind === "image" ? "/images/… ή https://…" : undefined}
                            onChange={(e) =>
                              setDraft((d) => ({ ...d, [def.key]: e.target.value }))
                            }
                            className="max-w-[36rem] text-[13px]"
                          />
                        )}

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-k-text-3">
                          {changed && <Badge className="bg-k-ink text-white">αλλαγμένο</Badge>}

                          {isOriginal ? (
                            <span className="text-k-text-4">αρχικό κείμενο</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setDraft((d) => ({ ...d, [def.key]: fallbackOf[def.key] }))
                              }
                              className="inline-flex items-center gap-1 text-k-text-3 underline-offset-2 hover:text-k-ink hover:underline"
                            >
                              <RotateCcw className="size-3" aria-hidden />
                              επαναφορά αρχικού
                            </button>
                          )}

                          {def.maxChars && (
                            <span className={over > 0 ? "text-k-amber" : "text-k-text-4"}>
                              {value.length}/{def.maxChars}
                              {over > 0 ? " — μπορεί να μη χωρέσει" : ""}
                            </span>
                          )}

                          {view?.updatedAt && !changed && (
                            <span className="text-k-text-4">
                              {new Intl.DateTimeFormat("el-GR", {
                                dateStyle: "short",
                                timeStyle: "short",
                                timeZone: "Europe/Athens",
                              }).format(new Date(view.updatedAt))}
                              {view.updatedBy ? ` · ${view.updatedBy}` : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {dirty.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-k-line bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-[72rem] items-center justify-between gap-4 px-4 py-3 lg:px-8">
            <p className="text-[12.5px] text-k-text-2">
              {dirty.length === 1
                ? "1 μη αποθηκευμένη αλλαγή"
                : `${dirty.length} μη αποθηκευμένες αλλαγές`}{" "}
              <span className="text-k-text-4">· {LOCALE_LABEL[locale] ?? locale}</span>
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setDraft(baseline)} disabled={pending}>
                Αναίρεση
              </Button>
              <Button onClick={submit} disabled={pending}>
                {pending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                Αποθήκευση
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
